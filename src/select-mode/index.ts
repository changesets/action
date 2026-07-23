import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import artifact from "@actions/artifact";
import * as core from "@actions/core";
import readChangesetState from "../readChangesetState.ts";
import { execChangesetsCli, validateChangesetsCliVersion } from "../utils.ts";

type ModeResult =
  | {
      mode: "none";
    }
  | {
      mode: "version";
    }
  | {
      mode: "publish";
      publishPlanPath: string;
    };

type PublishPlan = unknown[];

try {
  await main();
} catch (err) {
  core.setFailed((err as Error).message);
}

async function main() {
  const cwd = process.cwd();
  await validateChangesetsCliVersion(cwd);

  const result = await getMode(cwd);
  core.setOutput("mode", result.mode);
  if (result.mode === "publish") {
    const publishPlanArtifact = await artifact.uploadArtifact(
      path.basename(result.publishPlanPath, ".json"),
      [result.publishPlanPath],
      path.dirname(result.publishPlanPath),
      {
        skipArchive: true,
        retentionDays: 30,
      },
    );
    if (publishPlanArtifact.id === undefined) {
      throw new Error(
        "Publish plan artifact upload did not return an artifact id",
      );
    }
    core.setOutput("publish-plan-artifact-id", String(publishPlanArtifact.id));
  }
}

async function getMode(cwd: string): Promise<ModeResult> {
  const { changesets } = await readChangesetState(cwd);

  if (changesets.length > 0) {
    const hasNonEmptyChangesets = changesets.some(
      (changeset) => changeset.releases.length > 0,
    );
    if (hasNonEmptyChangesets) {
      return { mode: "version" };
    }
    return { mode: "none" };
  }

  const publishPlanPath = path.join(
    process.env.RUNNER_TEMP ?? (await fs.realpath(os.tmpdir())),
    `changeset-publish-plan-${Date.now()}`,
    // we need a stable filename here (in a unique dirname) so the artifact download can find this cleanly
    "publish-plan.json",
  );
  await execChangesetsCli(["publish-plan", "--output", publishPlanPath], {
    cwd,
    env: process.env,
  });

  const publishPlan = await readPublishPlan(publishPlanPath);
  if (publishPlan.length === 0) {
    return { mode: "none" };
  }

  return {
    mode: "publish",
    publishPlanPath,
  };
}

async function readPublishPlan(publishPlanPath: string): Promise<PublishPlan> {
  let rawPlan: string;
  try {
    rawPlan = await fs.readFile(publishPlanPath, "utf8");
  } catch (err) {
    throw new Error(`Failed to read publish plan at ${publishPlanPath}`, {
      cause: err,
    });
  }

  let plan: unknown;
  try {
    plan = JSON.parse(rawPlan);
  } catch (err) {
    throw new Error(`Failed to parse publish plan at ${publishPlanPath}`, {
      cause: err,
    });
  }

  if (
    typeof plan !== "object" ||
    plan === null ||
    !("version" in plan) ||
    typeof plan.version !== "number" ||
    !("plan" in plan) ||
    !Array.isArray(plan.plan)
  ) {
    throw new Error(
      `Invalid publish plan at ${publishPlanPath}: expected { version: number; plan: unknown[] }`,
    );
  }
  return plan.plan;
}
