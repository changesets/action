import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import artifact from "@actions/artifact";
import * as core from "@actions/core";
import { execChangesetsCli } from "../utils.ts";

try {
  await main();
} catch (err) {
  core.setFailed((err as Error).message);
}

async function main() {
  const publishPlanArtifactId = core.getInput("publish-plan-artifact-id");

  // If the user needs to change the cwd, set `working-directory` in the step instead
  const cwd = process.cwd();
  const tmpDir = process.env.RUNNER_TEMP ?? (await fs.realpath(os.tmpdir()));
  const outDir = path.join(tmpDir, `changeset-pack-${Date.now()}`);

  await pack(cwd, {
    outDir,
    publishPlanPath: publishPlanArtifactId
      ? await downloadPublishPlanArtifact(tmpDir, Number(publishPlanArtifactId))
      : undefined,
  });

  const packedArtifact = await artifact.uploadArtifact(
    `changeset-pack-${Date.now()}`,
    await getFiles(outDir),
    outDir,
  );
  if (packedArtifact.id === undefined) {
    throw new Error("Packed artifact upload did not return an artifact id");
  }
  core.setOutput("packed-artifact-id", String(packedArtifact.id));
}

async function pack(
  cwd: string,
  args: {
    outDir: string;
    publishPlanPath?: string;
  },
) {
  const cliArgs = ["pack", "--out-dir", args.outDir];
  if (args.publishPlanPath) {
    cliArgs.push("--from-plan", args.publishPlanPath);
  }

  await execChangesetsCli(cliArgs, {
    cwd,
    env: process.env,
  });
}

async function downloadPublishPlanArtifact(tmpDir: string, artifactId: number) {
  if (!Number.isInteger(artifactId) || artifactId <= 0) {
    throw new Error(`Invalid publish plan artifact id: ${artifactId}`);
  }

  const downloadPath = path.join(
    tmpDir,
    `changeset-publish-plan-${artifactId}-${Date.now()}`,
  );
  const result = await artifact.downloadArtifact(artifactId, {
    path: downloadPath,
  });

  if (!result.downloadPath) {
    throw new Error(
      `Publish plan artifact download did not return a path for artifact ${artifactId}`,
    );
  }

  return path.join(result.downloadPath, "publish-plan.json");
}

async function getFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return getFiles(entryPath);
      }
      return [entryPath];
    }),
  );
  return files.flat();
}
