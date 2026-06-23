import fs from "node:fs/promises";
import os from "node:os";
import * as core from "@actions/core";
import { Git } from "../git.ts";
import { setupOctokit } from "../octokit.ts";
import { runPublish } from "../run.ts";
import {
  downloadArtifact,
  getOptionalInput,
  getRequiredInput,
} from "../utils.ts";

try {
  await main();
} catch (err) {
  core.setFailed((err as Error).message);
}

async function main() {
  const githubToken = getRequiredInput("github-token");
  const script = getOptionalInput("script");
  const packDirArtifactId = getOptionalInput("pack-dir-artifact-id");
  const createGithubReleases = core.getBooleanInput("create-github-releases");

  // If the user needs to change the cwd, set `working-directory` in the step instead
  const cwd = process.cwd();

  const octokit = setupOctokit(githubToken);
  // NOTE: Always pass octokit here as publish does not need a commit-mode
  const git = new Git({ octokit, cwd });

  const fromPackDir = packDirArtifactId
    ? await downloadArtifact(
        process.env.RUNNER_TEMP ?? (await fs.realpath(os.tmpdir())),
        Number(packDirArtifactId),
        "changeset-pack",
      )
    : undefined;

  const result = await runPublish({
    script,
    githubToken,
    git,
    octokit,
    createGithubReleases,
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
