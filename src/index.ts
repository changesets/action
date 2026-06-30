import fs from "node:fs/promises";
import * as core from "@actions/core";
import { GitHub } from "./github.ts";
import readChangesetState from "./readChangesetState.ts";
import { runPublish, runVersion } from "./run.ts";
import { fileExists, getOptionalInput, getRequiredInput } from "./utils.ts";

(async () => {
  const githubToken = getRequiredInput("github-token");
  if (process.env.GITHUB_TOKEN && process.env.GITHUB_TOKEN !== githubToken) {
    throw new Error(
      'The GITHUB_TOKEN environment variable is set and does not match the "github-token" input. ' +
        'Please pass the custom GitHub token to the "github-token" input and ' +
        "remove the GITHUB_TOKEN environment variable to avoid conflicts.",
    );
  }

  // If the user needs to change the cwd, set `working-directory` in the step instead
  const cwd = process.cwd();

  const commitMode = getOptionalInput("commitMode") ?? "git-cli";
  const prDraft = getOptionalInput("prDraft");
  if (commitMode !== "git-cli" && commitMode !== "github-api") {
    core.setFailed(`Invalid commit mode: ${commitMode}`);
    return;
  }
  if (prDraft !== undefined && prDraft !== "always" && prDraft !== "create") {
    core.setFailed(`Invalid prDraft: ${prDraft}`);
    return;
  }
  const github = new GitHub({
    cwd,
    githubToken,
    commitMode,
  });

  let setupGitUser = core.getBooleanInput("setupGitUser");

  if (setupGitUser) {
    core.info("setting git user");
    await github.setupUser();
  }

  let { changesets } = await readChangesetState(cwd);

  let publishScript = core.getInput("publish");
  let hasChangesets = changesets.length !== 0;
  const hasNonEmptyChangesets = changesets.some(
    (changeset) => changeset.releases.length > 0,
  );
  let hasPublishScript = !!publishScript;

  core.setOutput("published", "false");
  core.setOutput("publishedPackages", "[]");
  core.setOutput("hasChangesets", String(hasChangesets));

  switch (true) {
    case !hasChangesets && !hasPublishScript:
      core.info(
        "No changesets present or were removed by merging release PR. Not publishing because no publish script found.",
      );
      return;
    case !hasChangesets && hasPublishScript: {
      core.info(
        "No changesets found. Attempting to publish any unpublished packages to npm",
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
              "Found existing auth token for the npm registry in the user .npmrc file",
            );
          } else {
            core.info(
              "Didn't find existing auth token for the npm registry in the user .npmrc file, creating one",
            );
            await fs.appendFile(
              userNpmrcPath,
              `\n//registry.npmjs.org/:_authToken=${process.env.NPM_TOKEN}\n`,
            );
          }
        } else {
          core.info(
            "No user .npmrc file found, creating one with NPM_TOKEN used as auth token",
          );
          await fs.writeFile(
            userNpmrcPath,
            `//registry.npmjs.org/:_authToken=${process.env.NPM_TOKEN}\n`,
          );
        }
      } else if (
        process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN &&
        process.env.ACTIONS_ID_TOKEN_REQUEST_URL
      ) {
        core.info(
          "No NPM_TOKEN found, but OIDC is available - using npm trusted publishing",
        );
      } else {
        core.info(
          "No NPM_TOKEN or OIDC available - assuming npm is already authenticated",
        );
      }

      const createGithubReleases = core.getBooleanInput("createGithubReleases");
      const pushGitTags =
        createGithubReleases || core.getBooleanInput("push-git-tags");
      const result = await runPublish({
        script: publishScript,
        github,
        createGithubReleases,
        pushGitTags,
        cwd,
      });

      if (result.published) {
        core.setOutput("published", "true");
        core.setOutput(
          "publishedPackages",
          JSON.stringify(result.publishedPackages),
        );
      }

      if (result.exitCode !== 0) {
        core.error(
          `Publish command exited with code ${result.exitCode}${
            result.published
              ? `, but some packages were published: ${result.publishedPackages
                  .map((p) => `${p.name}@${p.version}`)
                  .join(", ")}`
              : ""
          }`,
        );
        process.exit(result.exitCode);
      }
      return;
    }
    case hasChangesets && !hasNonEmptyChangesets:
      core.info("All changesets are empty; not creating PR");
      return;
    case hasChangesets: {
      const { pullRequestNumber } = await runVersion({
        script: getOptionalInput("version"),
        github,
        cwd,
        prTitle: getOptionalInput("title"),
        commitMessage: getOptionalInput("commit"),
        hasPublishScript,
        prDraft,
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
