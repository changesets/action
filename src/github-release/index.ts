import * as core from "@actions/core";
import { GitHub } from "../github.ts";
import {
  downloadAndValidateStagedRelease,
  finalizeStagedRelease,
} from "../staged-release.ts";
import { getOptionalBooleanInput, getRequiredInput } from "../utils.ts";

try {
  await main();
} catch (error) {
  core.setFailed((error as Error).message);
}

async function main() {
  const cwd = process.cwd();
  const github = new GitHub({
    cwd,
    githubToken: getRequiredInput("github-token"),
    commitMode: "github-api",
  });
  const artifactId = Number(getRequiredInput("staged-release-artifact-id"));
  const verify = getOptionalBooleanInput("verify-published") ?? true;
  const { handoff, packagesByName } = await downloadAndValidateStagedRelease(
    artifactId,
    cwd,
  );

  await finalizeStagedRelease({
    github,
    handoff,
    packagesByName,
    cwd,
    verify,
  });

  core.setOutput(
    "released-packages",
    JSON.stringify(
      handoff.releases.map((release) => ({
        name: release.packageName,
        version: release.version,
      })),
    ),
  );
}
