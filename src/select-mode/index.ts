import fs from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import artifact from "@actions/artifact";
import * as core from "@actions/core";
import { exec } from "tinyexec";
import readChangesetState from "../readChangesetState.ts";

const require = createRequire(import.meta.url);

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

type PublishPlan = {
  version: number;
  plan: unknown[];
};

try {
  await main();
} catch (err) {
  core.setFailed((err as Error).message);
}

async function main() {
  const result = await getMode();
  core.setOutput("mode", result.mode);
  if (result.mode === "publish") {
    const publishPlanArtifact = await artifact.uploadArtifact(
      path.basename(result.publishPlanPath, ".json"),
      [result.publishPlanPath],
      path.dirname(result.publishPlanPath),
      {
        skipArchive: true,
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

async function getMode(): Promise<ModeResult> {
  const { changesets } = await readChangesetState();

  if (changesets.length > 0) {
    const hasNonEmptyChangesets = changesets.some(
      (changeset) => changeset.releases.length > 0,
    );
    if (hasNonEmptyChangesets) {
      return { mode: "version" };
    }
    return { mode: "none" };
  }

  const cwd = process.cwd();
  const publishPlanPath = path.join(
    process.env.RUNNER_TEMP ?? (await fs.realpath(os.tmpdir())),
    `changeset-publish-plan-${Date.now()}.json`,
  );
  const changesetsCliBin = require.resolve("@changesets/cli/bin.js", {
    paths: [cwd],
  });

  await exec(
    "node",
    [changesetsCliBin, "publish-plan", "--output", publishPlanPath],
    {
      throwOnError: true,
      nodeOptions: { cwd, env: process.env },
    },
  );

  const publishPlan = await readPublishPlan(publishPlanPath);
  if (publishPlan.plan.length === 0) {
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
  return {
    version: plan.version,
    plan: plan.plan,
  };
}
