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
  let hasPublishScript = !!publishScript;

  let skipPublish = core.getBooleanInput("skipPublish");

  core.setOutput("published", "false");
  core.setOutput("publishedPackages", "[]");
  core.setOutput("hasChangesets", String(hasChangesets));

  switch (true) {
    case !hasChangesets && !hasPublishScript:
      console.log("No changesets found");
      return;
    case !hasChangesets && hasPublishScript && skipPublish: {
      console.log(
        "No changesets found, but skipped publish any unpublished packages to npm as requested"
      );
    }
    case !hasChangesets && hasPublishScript: {
      console.log(
        "No changesets found, attempting to publish any unpublished packages to npm"
      );

      let userNpmrcPath = `${process.env.HOME}/.npmrc`;
      if (fs.existsSync(userNpmrcPath)) {
        console.log("Found existing user .npmrc file");
        const userNpmrcContent = await fs.readFile(userNpmrcPath, "utf8");
        const authLine = userNpmrcContent.split("\n").find((line) => {
          // check based on https://github.com/npm/cli/blob/8f8f71e4dd5ee66b3b17888faad5a7bf6c657eed/test/lib/adduser.js#L103-L105
          return /^\s*\/\/registry\.npmjs\.org\/:[_-]authToken=/i.test(line);
        });
        if (authLine) {
          console.log(
            "Found existing auth token for the npm registry in the user .npmrc file"
          );
        } else {
          console.log(
            "Didn't find existing auth token for the npm registry in the user .npmrc file, creating one"
          );
          fs.appendFileSync(
            userNpmrcPath,
            `\n//registry.npmjs.org/:_authToken=${process.env.NPM_TOKEN}\n`
          );
        }
      } else {
        console.log("No user .npmrc file found, creating one");
        fs.writeFileSync(
          userNpmrcPath,
          `//registry.npmjs.org/:_authToken=${process.env.NPM_TOKEN}\n`
        );
      }

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
    case hasChangesets:
      await runVersion({
        script: getOptionalInput("version"),
        githubToken,
        prTitle: getOptionalInput("title"),
        commitMessage: getOptionalInput("commit"),
        hasPublishScript,
      });
      return;
  }
})().catch((err) => {
  console.error(err);
  core.setFailed(err.message);
});
