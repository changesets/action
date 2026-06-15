import * as core from "@actions/core";
import readChangesetState from "../readChangesetState.ts";

try {
  await main();
} catch (err) {
  core.setFailed((err as Error).message);
}

async function main() {
  const mode = await getMode();
  core.setOutput("mode", mode);
}

async function getMode(): Promise<"version" | "publish" | "none"> {
  const { changesets } = await readChangesetState();

  if (changesets.length > 0) {
    const hasNonEmptyChangesets = changesets.some(
      (changeset) => changeset.releases.length > 0,
    );
    if (hasNonEmptyChangesets) {
      return "version";
    } else {
      return "none";
    }
  } else {
    return "publish";
  }
}
