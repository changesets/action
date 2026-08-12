import * as core from "@actions/core";
import { GitHub } from "./github.ts";
import readChangesetState from "./readChangesetState.ts";
import { runPublish, runVersion } from "./run.ts";
import {
  getOptionalInput,
  getRequiredInput,
  throwOnRemovedCommitModeInput,
  throwOnRenamedInputs,
  validateChangesetsCliVersion,
} from "./utils.ts";

(async () => {
  const cwd = getOptionalInput("cwd") || process.cwd();
  await validateChangesetsCliVersion(cwd);

  throwOnRenamedInputs({
    publish: "publish-script",
    version: "version-script",
    commit: "commit-mesage",
    title: "pr-title",
    branch: "pr-base-branch",
    prDraft: "pr-draft",
    createGithubReleases: "create-github-releases",
  });
  throwOnRemovedCommitModeInput();

  const githubToken = getRequiredInput("github-token");
  if (process.env.GITHUB_TOKEN && process.env.GITHUB_TOKEN !== githubToken) {
    throw new Error(
      'The GITHUB_TOKEN environment variable is set and does not match the "github-token" input. ' +
        'Please pass the custom GitHub token to the "github-token" input and ' +
        "remove the GITHUB_TOKEN environment variable to avoid conflicts.",
    );
  }

  const pushWithGitCli = core.getBooleanInput("push-with-git-cli");
  const prDraft = getOptionalInput("pr-draft");
  if (prDraft !== undefined && prDraft !== "always" && prDraft !== "create") {
    core.setFailed(`Invalid pr-draft: ${prDraft}`);
    return;
  }
  const github = new GitHub({
    cwd,
    githubToken,
    pushWithGitCli,
  });

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
