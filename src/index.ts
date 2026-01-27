import * as core from "@actions/core";
import fs from "node:fs/promises";
import path from "node:path";
import { Git } from "./git.ts";
import { setupOctokit } from "./octokit.ts";
import readChangesetState from "./readChangesetState.ts";
import { runPublish, runVersion } from "./run.ts";
import { fileExists } from "./utils.ts";

const getOptionalInput = (name: string) => core.getInput(name) || undefined;

(async () => {
  let githubToken = process.env.GITHUB_TOKEN;

  if (!githubToken) {
    core.setFailed("Please add the GITHUB_TOKEN to the changesets action");
    return;
  }

  const cwd = path.resolve(getOptionalInput("cwd") ?? "");

  const octokit = setupOctokit(githubToken);
  const commitMode = getOptionalInput("commitMode") ?? "git-cli";
  if (commitMode !== "git-cli" && commitMode !== "github-api") {
    core.setFailed(`Invalid commit mode: ${commitMode}`);
    return;
  }
  const git = new Git({
    octokit: commitMode === "github-api" ? octokit : undefined,
    cwd,
  });

  let setupGitUser = core.getBooleanInput("setupGitUser");

  if (setupGitUser) {
    core.info("setting git user");
    await git.setupUser();
  }

  core.info("setting GitHub credentials");
  await fs.writeFile(
    `${process.env.HOME}/.netrc`,
    `machine github.com\nlogin github-actions[bot]\npassword ${githubToken}`
  );

  let { changesets } = await readChangesetState();

  let publishScript = core.getInput("publish");
  let hasChangesets = changesets.length !== 0;
  const hasNonEmptyChangesets = changesets.some(
    (changeset) => changeset.releases.length > 0
  );
  let hasPublishScript = !!publishScript;

  core.setOutput("published", "false");
  core.setOutput("publishedPackages", "[]");
  core.setOutput("hasChangesets", String(hasChangesets));

  switch (true) {
    case !hasChangesets && !hasPublishScript:
      core.info(
        "No changesets present or were removed by merging release PR. Not publishing because no publish script found."
      );
      return;
    case !hasChangesets && hasPublishScript: {
      core.info(
        "No changesets found. Attempting to publish any unpublished packages to npm"
      );

      if (process.env.NPM_TOKEN) {
        const userNpmrcPath = `${process.env.HOME}/.npmrc`;

        if (await fileExists(userNpmrcPath)) {
          core.info("Found existing user .npmrc file");
          const userNpmrcContent = await fs.readFile(userNpmrcPath, "utf8");
          const authLine = userNpmrcContent.split("\n").find((line) => {
            // check based on https://github.com/npm/cli/blob/8f8f71e4dd5ee66b3b17888faad5a7bf6c657eed/test/lib/adduser.js#L103-L105
            return /^\s*\/\/registry\.npmjs\.org\/:[_-]authToken=/i.test(line);
          });
          if (authLine) {
            core.info(
              "Found existing auth token for the npm registry in the user .npmrc file"
            );
          } else {
            core.info(
              "Didn't find existing auth token for the npm registry in the user .npmrc file, creating one"
            );
            await fs.appendFile(
              userNpmrcPath,
              `\n//registry.npmjs.org/:_authToken=${process.env.NPM_TOKEN}\n`
            );
          }
        } else {
          core.info(
            "No user .npmrc file found, creating one with NPM_TOKEN used as auth token"
          );
          await fs.writeFile(
            userNpmrcPath,
            `//registry.npmjs.org/:_authToken=${process.env.NPM_TOKEN}\n`
          );
        }
      } else {
        core.info(
          "No NPM_TOKEN found - assuming trusted publishing or npm is already authenticated"
        );
      }

      const result = await runPublish({
        script: publishScript,
        git,
        octokit,
        createGithubReleases: core.getBooleanInput("createGithubReleases"),
        cwd,
      });

      if (result.published) {
        core.setOutput("published", "true");
        core.setOutput(
          "publishedPackages",
          JSON.stringify(result.publishedPackages)
        );
      }
      return;
    }
    case hasChangesets && !hasNonEmptyChangesets:
      core.info("All changesets are empty; not creating PR");
      return;
    case hasChangesets: {
      const octokit = setupOctokit(githubToken);
      const { pullRequestNumber } = await runVersion({
        script: getOptionalInput("version"),
        git,
        octokit,
        prTitle: getOptionalInput("title"),
        commitMessage: getOptionalInput("commit"),
        hasPublishScript,
        branch: getOptionalInput("branch"),
      });

      core.setOutput("pullRequestNumber", String(pullRequestNumber));

      return;
    }
  }
})().catch((err) => {
  core.error(err);
  core.setFailed(err.message);
});
