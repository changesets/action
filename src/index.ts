import fs from "node:fs/promises";
import path from "node:path";
import * as core from "@actions/core";
import { getPackages } from "@manypkg/get-packages";
import { Git } from "./git.ts";
import { setupOctokit } from "./octokit.ts";
import readChangesetState from "./readChangesetState.ts";
import { runPublish, runVersion } from "./run.ts";
import { fileExists } from "./utils.ts";

const getOptionalInput = (name: string) => core.getInput(name) || undefined;

async function ensureUserNpmToken(tool: string, token: string) {
  if (tool === "yarn") {
    const userYarnrcPath = `${process.env.HOME}/.yarnrc.yml`;

    if (await fileExists(userYarnrcPath)) {
      core.info("Found existing user .yarnrc.yml file");
      const userYarnrcContent = await fs.readFile(userYarnrcPath, "utf8");
      const authLine = userYarnrcContent.split("\n").find((line) => {
        // indented npmAuthToken can be found when configured for a specific registry in npmRegistries
        // in here, we only take care of the default one (a top-level one)
        return /^npmAuthToken\s*:/i.test(line);
      });
      if (authLine) {
        core.info(
          "Found existing npmAuthToken in the user .yarnrc.yml file",
        );
      } else {
        core.info(
          "Didn't find npmAuthToken in the user .yarnrc.yml file, creating one",
        );
        await fs.appendFile(userYarnrcPath, `\nnpmAuthToken: ${token}\n`);
      }
    } else {
      core.info(
        "No user .yarnrc.yml file found, creating one with NPM_TOKEN used as npmAuthToken",
      );
      await fs.writeFile(userYarnrcPath, `npmAuthToken: ${token}\n`);
    }

    return;
  }

  // pnpm still respects .npmrc for auth tokens but its own `pnpm login` writes to `~/.config/pnpm/auth.ini`
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
        `\n//registry.npmjs.org/:_authToken=${token}\n`,
      );
    }
  } else {
    core.info(
      "No user .npmrc file found, creating one with NPM_TOKEN used as auth token",
    );
    await fs.writeFile(
      userNpmrcPath,
      `//registry.npmjs.org/:_authToken=${token}\n`,
    );
  }
}

(async () => {
  // to maintain compatibility with workflows created before github-token input was introduced
  // it's important to prefer the explicitly set GITHUB_TOKEN over the default token coming from github.token
  let githubToken = process.env.GITHUB_TOKEN || core.getInput("github-token");

  if (!githubToken) {
    core.setFailed("Please add the GITHUB_TOKEN to the changesets action");
    return;
  }

  const cwd = path.resolve(getOptionalInput("cwd") ?? "");
  core.info(`using resolved cwd: ${cwd}`);

  const octokit = setupOctokit(githubToken);
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
    `machine github.com\nlogin github-actions[bot]\npassword ${githubToken}`,
  );

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
        let { tool } = await getPackages(cwd);
        await ensureUserNpmToken(tool, process.env.NPM_TOKEN);
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

      const result = await runPublish({
        script: publishScript,
        githubToken,
        git,
        octokit,
        createGithubReleases: core.getBooleanInput("createGithubReleases"),
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
      const octokit = setupOctokit(githubToken);
      const { pullRequestNumber } = await runVersion({
        script: getOptionalInput("version"),
        githubToken,
        git,
        octokit,
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
