import * as core from "@actions/core";
import fs from "fs-extra";
import * as gitUtils from "./gitUtils.js";
import { runPublish, runVersion } from "./run.js";
import readChangesetState from "./readChangesetState.js";

const getOptionalInput = (name: string) => core.getInput(name) || undefined;

(async () => {
  try {
    await main();
  } catch (err) {
    handleError(err);
  }
})();

async function main() {
  const githubToken = process.env.GITHUB_TOKEN || "";
  if (!githubToken) {
    core.setFailed("Please add the GITHUB_TOKEN to the changesets action");
    return;
  }

  const inputCwd = core.getInput("cwd");
  if (inputCwd) {
    process.chdir(inputCwd);
    core.info("Changing directory to the one given as the input");
  }

  const setupGitUser = core.getBooleanInput("setupGitUser");
  if (setupGitUser) {
    await gitUtils.setupUser();
    core.info("Setting git user");
  }

  await setGitHubCredentials(githubToken);

  const { changesets } = await readChangesetState();
  const publishScript = core.getInput("publish");
  const hasChangesets = changesets.length !== 0;
  const hasNonEmptyChangesets = changesets.some(
    (changeset) => changeset.releases.length > 0
  );
  const hasPublishScript = !!publishScript;

  core.setOutput("published", "false");
  core.setOutput("publishedPackages", "[]");
  core.setOutput("hasChangesets", String(hasChangesets));

  await handleChangesetCases(
    hasChangesets,
    hasNonEmptyChangesets,
    hasPublishScript,
    publishScript,
    githubToken
  );
}

async function handleChangesetCases(
  hasChangesets: boolean,
  hasNonEmptyChangesets: boolean,
  hasPublishScript: boolean,
  publishScript: string,
  githubToken: string
) {
  if (!hasChangesets && !hasPublishScript) {
    await handleNoChangesetsNoPublishScript();
  } else if (!hasChangesets && hasPublishScript) {
    await handleNoChangesetsHasPublishScript(publishScript, githubToken);
  } else if (hasChangesets && !hasNonEmptyChangesets) {
    await handleEmptyChangesets();
  } else if (hasChangesets) {
    await handleHasChangesets(githubToken, hasPublishScript);
  }
}

async function handleNoChangesetsNoPublishScript() {
  core.info("No changesets found");
}

async function handleNoChangesetsHasPublishScript(
  publishScript: string,
  githubToken: string
) {
  core.info(
    "No changesets found, attempting to publish any unpublished packages to npm"
  );
  await setupNpmrc();
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
}

async function handleEmptyChangesets() {
  core.info("All changesets are empty; not creating PR");
}

async function handleHasChangesets(
  githubToken: string,
  hasPublishScript: boolean
) {
  const versionResult = await runVersion({
    script: getOptionalInput("version"),
    githubToken,
    prTitle: getOptionalInput("title"),
    commitMessage: getOptionalInput("commit"),
    hasPublishScript,
    branch: getOptionalInput("branch"),
  });

  core.setOutput("pullRequestNumber", String(versionResult.pullRequestNumber));
}

async function setGitHubCredentials(githubToken: string) {
  core.info("Setting GitHub credentials");
  await fs.writeFile(
    `${process.env.HOME}/.netrc`,
    `machine github.com\nlogin github-actions[bot]\npassword ${githubToken}`
  );
}

function handleError(err: unknown) {
  if (err instanceof Error) {
    core.error(err);
    core.setFailed(err.message);
  }
}

async function setupNpmrc() {
  const userNpmrcPath = `${process.env.HOME}/.npmrc`;
  const registry = core.getInput("registry");
  if (fs.existsSync(userNpmrcPath)) {
    await processExisting(userNpmrcPath, registry);
  } else {
    createNpmrcFile(userNpmrcPath, registry);
  }
}

async function processExisting(userNpmrcPath: string, registry: string) {
  const userNpmrcContent = await fs.readFile(userNpmrcPath, "utf8");
  const authLine = userNpmrcContent
    .split("\n")
    .find((line) =>
      new RegExp(`^\\s*//${registry}/:[_-]authToken=`, "i").test(line)
    );
  if (!authLine) {
    core.info(
      "Didn't find existing auth token for the npm registry in the user .npmrc file, creating one"
    );
    fs.appendFileSync(
      userNpmrcPath,
      `\n//${registry}/:_authToken=${process.env.NPM_TOKEN}\n`
    );
  } else {
    core.info(
      "Found existing auth token for the npm registry in the user .npmrc file"
    );
  }
}

function createNpmrcFile(userNpmrcPath: string, registry: string) {
  core.info("No user .npmrc file found, creating one");
  fs.writeFileSync(
    userNpmrcPath,
    `//${registry}/:_authToken=${process.env.NPM_TOKEN}\n`
  );
}
