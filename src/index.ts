import * as core from "@actions/core";
import fs from "fs-extra";
import * as gitUtils from "./gitUtils";
import { runPublish, runVersion } from "./run";
import readChangesetState from "./readChangesetState";

const getOptionalInput = (name: string) => core.getInput(name) || undefined;

(async () => {
  let githubToken = process.env.GITHUB_TOKEN;

  if (!githubToken) {
    core.setFailed("Please add the GITHUB_TOKEN to the changesets action");
    return;
  }

  const inputCwd = core.getInput("cwd");
  if (inputCwd) {
    console.log("changing directory to the one given as the input");
    process.chdir(inputCwd);
  }

  let setupGitUser = core.getBooleanInput("setupGitUser");

  if (setupGitUser) {
    console.log("setting git user");
    await gitUtils.setupUser();
  }

  console.log("setting GitHub credentials");
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
      console.log("No changesets found");
      return;
    case !hasChangesets && hasPublishScript: {
      console.log(
        "No changesets found, attempting to publish any unpublished packages to npm"
      );

      const result = await runPublish({
        script: publishScript,
        githubToken,
        createGithubReleases: core.getBooleanInput("createGithubReleases"),
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
      console.log("All changesets are empty; not creating PR");
      return;
    case hasChangesets:
      const { pullRequestNumber } = await runVersion({
        script: getOptionalInput("version"),
        githubToken,
        prTitle: getOptionalInput("title"),
        commitMessage: getOptionalInput("commit"),
        hasPublishScript,
      });

      core.setOutput("pullRequestNumber", String(pullRequestNumber));

      return;
  }
})().catch((err) => {
  console.error(err);
  core.setFailed(err.message);
});
