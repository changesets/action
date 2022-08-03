import * as core from "@actions/core";
import fs from "fs-extra";
import * as github from "@actions/github";

import { runPublish, runVersion } from "./run";
import readChangesetState from "./readChangesetState";
import { configureNpmRc, execWithOutput, setupGitUser } from "./utils";
import { upsertComment } from "./github";

(async () => {
  let githubToken = process.env.GITHUB_TOKEN;
  let npmToken = process.env.NPM_TOKEN;

  if (!githubToken) {
    core.setFailed("Please add the GITHUB_TOKEN to the changesets action");
    return;
  }

  if (!npmToken) {
    core.setFailed("Please add the NPM_TOKEN to the changesets action");
    return;
  }

  const inputCwd = core.getInput("cwd");

  if (inputCwd) {
    console.log("changing directory to the one given as the input: ", inputCwd);
    process.chdir(inputCwd);
  }

  let shouldeSetupGitUser = core.getBooleanInput("setupGitUser");

  if (shouldeSetupGitUser) {
    console.log("setting git user");
    await setupGitUser();
  }

  await configureNpmRc(npmToken);

  console.log("setting GitHub credentials");
  await fs.writeFile(
    `${process.env.HOME}/.netrc`,
    `machine github.com\nlogin github-actions[bot]\npassword ${githubToken}`
  );

  let { changesets } = await readChangesetState(inputCwd);
  let hasChangesets = changesets.length !== 0;

  core.setOutput("published", "false");
  core.setOutput("publishedPackages", "[]");
  core.setOutput("hasChangesets", String(hasChangesets));

  if (!hasChangesets) {
    console.log("No changesets found");
    return;
  }

  let tagName = core.getInput("tag");

  if (!tagName) {
    core.setFailed(
      "Please configure the 'tag' name you wish to use for the release."
    );

    return;
  }

  await runVersion({
    tagName,
    cwd: inputCwd,
  });

  let prepareScript = core.getInput("prepareScript");

  if (prepareScript) {
    console.log(`Running user prepare script...`);
    let [publishCommand, ...publishArgs] = prepareScript.split(/\s+/);

    let userPrepareScriptOutput = await execWithOutput(
      publishCommand,
      publishArgs,
      { cwd: inputCwd }
    );

    if (userPrepareScriptOutput.code !== 0) {
      throw new Error("Failed to run 'prepareScript' command");
    }
  }

  const result = await runPublish({
    tagName,
    cwd: inputCwd,
  });

  console.log("Publish result:", JSON.stringify(result));

  if (result.published) {
    core.setOutput("published", "true");
    core.setOutput(
      "publishedPackages",
      JSON.stringify(result.publishedPackages)
    );
  }

  try {
    await upsertComment({
      token: githubToken,
      publishResult: result,
      tagName,
    });
  } catch (e) {
    core.info(`Failed to create/update github comment.`);
    core.warning(e as Error);
  }
})().catch((err) => {
  console.error(err);
  core.setFailed(err.message);
});
