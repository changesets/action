import fs from "node:fs/promises";
import * as core from "@actions/core";
import { GitHub } from "./github.ts";
import readChangesetState from "./readChangesetState.ts";
import { runPublish, runVersion } from "./run.ts";
import {
  fileExists,
  getOptionalInput,
  getRequiredInput,
  throwOnRenamedInputs,
} from "./utils.ts";

(async () => {
  throwOnRenamedInputs({
    publish: "publish-script",
    version: "version-script",
    commit: "commit-mesage",
    title: "pr-title",
    branch: "pr-base-branch",
    prDraft: "pr-draft",
    createGithubReleases: "create-github-releases",
    commitMode: "commit-mode",
    setupGitUser: "setup-git-user",
  });

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

  const commitMode = getOptionalInput("commit-mode") ?? "git-cli";
  const prDraft = getOptionalInput("pr-draft");
  if (commitMode !== "git-cli" && commitMode !== "github-api") {
    core.setFailed(`Invalid commit mode: ${commitMode}`);
    return;
  }
  if (prDraft !== undefined && prDraft !== "always" && prDraft !== "create") {
    core.setFailed(`Invalid pr-draft: ${prDraft}`);
    return;
  }
  const github = new GitHub({
    cwd,
    githubToken,
    commitMode,
  });

  let setupGitUser = core.getBooleanInput("setup-git-user");

  if (setupGitUser) {
    core.info("setting git user");
    await github.setupUser();
  }

  let { changesets } = await readChangesetState(cwd);

  let publishScript = core.getInput("publish-script");
  let hasChangesets = changesets.length !== 0;
  const hasNonEmptyChangesets = changesets.some(
    (changeset) => changeset.releases.length > 0,
  );
  let hasPublishScript = !!publishScript;

  core.setOutput("published", "false");
  core.setOutput("published-packages", "[]");
  core.setOutput("has-changesets", String(hasChangesets));

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
            // URL-shaped registry key + :_authToken=… (http(s):// or //)
            return /^\s*(?:https?:\/\/|\/\/).+:[_-]authToken=/i.test(line);
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

      const createGithubReleases = core.getBooleanInput(
        "create-github-releases",
      );
      const pushGitTags = core.getBooleanInput("push-git-tags");
      if (createGithubReleases && !pushGitTags) {
        throw new Error(
          "The input 'create-github-releases' is set to true, but 'push-git-tags' is set to false. " +
            "Creating GitHub releases requires pushing git tags. Please set 'push-git-tags' to true " +
            "or set 'create-github-releases' to false.",
        );
      }
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
          "published-packages",
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
        script: getOptionalInput("version-script"),
        github,
        cwd,
        prTitle: getOptionalInput("pr-title"),
        commitMessage: getOptionalInput("commit-message"),
        hasPublishScript,
        prDraft,
        branch: getOptionalInput("pr-base-branch"),
      });

      core.setOutput("pr-number", String(pullRequestNumber));

      return;
    }
  }
})().catch((err) => {
  core.error(err);
  core.setFailed(err.message);
});
