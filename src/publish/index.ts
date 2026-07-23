import fs from "node:fs/promises";
import os from "node:os";
import * as core from "@actions/core";
import { GitHub } from "../github.ts";
import { runPublish } from "../run.ts";
import {
  downloadArtifact,
  getOptionalInput,
  getRequiredInput,
  validateChangesetsCliVersion,
} from "../utils.ts";

try {
  await main();
} catch (err) {
  core.setFailed((err as Error).message);
}

async function main() {
  // If the user needs to change the cwd, set `working-directory` in the step instead
  const cwd = process.cwd();
  await validateChangesetsCliVersion(cwd);

  const githubToken = getRequiredInput("github-token");
  const script = getOptionalInput("script");
  const packDirArtifactId = getOptionalInput("pack-dir-artifact-id");
  const createGithubReleases = core.getBooleanInput("create-github-releases");
  const pushGitTags = core.getBooleanInput("push-git-tags");

  if (createGithubReleases && !pushGitTags) {
    throw new Error(
      "The input 'create-github-releases' is set to true, but 'push-git-tags' is set to false. " +
        "Creating GitHub releases requires pushing git tags. Please set 'push-git-tags' to true " +
        "or set 'create-github-releases' to false.",
    );
  }

  // NOTE: Always use API mode here as publish does not need a commit-mode.
  const github = new GitHub({ cwd, githubToken, commitMode: "github-api" });

  const fromPackDir = packDirArtifactId
    ? await downloadArtifact(
        process.env.RUNNER_TEMP ?? (await fs.realpath(os.tmpdir())),
        Number(packDirArtifactId),
        "changeset-pack",
      )
    : undefined;

  const result = await runPublish({
    script,
    github,
    createGithubReleases,
    pushGitTags,
    cwd,
    fromPackDir,
  });

  if (result.published) {
    core.setOutput("published", "true");
    core.setOutput(
      "published-packages",
      JSON.stringify(result.publishedPackages),
    );
  } else {
    core.setOutput("published", "false");
  }

  if (result.exitCode !== 0) {
    throw new Error(
      `Publish command exited with code ${result.exitCode}${
        result.published
          ? `, but some packages were published: ${result.publishedPackages
              .map((p) => `${p.name}@${p.version}`)
              .join(", ")}`
          : ""
      }`,
    );
  }
}
