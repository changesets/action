import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import artifact from "@actions/artifact";
import * as core from "@actions/core";
import { getExecOutput } from "@actions/exec";
import { context } from "@actions/github";
import { getPackages, type Package } from "@manypkg/get-packages";
import type { GitHub } from "./github.ts";
import { createRelease, type NpmStageEvent } from "./run.ts";
import { downloadArtifact } from "./utils.ts";

export const STAGED_RELEASE_VERSION = 1;
export const STAGED_RELEASE_FILENAME = "staged-release.json";
const STAGE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type StagedReleaseEntry = Omit<NpmStageEvent, "type">;

export type StagedReleaseHandoff = {
  version: typeof STAGED_RELEASE_VERSION;
  repository: string;
  runId: number;
  sha: string;
  releases: StagedReleaseEntry[];
};

type HandoffIdentity = {
  repository: string;
  runId: number;
  sha: string;
};

function currentIdentity(): HandoffIdentity {
  return {
    repository: `${context.repo.owner}/${context.repo.repo}`,
    runId: context.runId,
    sha: context.sha,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isHttpNotFound(error: unknown) {
  return (
    isObject(error) &&
    (error.status === 404 || error.code === 404 || error.code === "404")
  );
}

function isStagedReleaseEntry(value: unknown): value is StagedReleaseEntry {
  return (
    isObject(value) &&
    typeof value.packageName === "string" &&
    value.packageName.length > 0 &&
    typeof value.version === "string" &&
    value.version.length > 0 &&
    typeof value.tag === "string" &&
    value.tag.length > 0 &&
    typeof value.gitTag === "string" &&
    value.gitTag.length > 0 &&
    typeof value.stageId === "string" &&
    STAGE_ID_PATTERN.test(value.stageId)
  );
}

export function createStagedReleaseHandoff(
  events: readonly NpmStageEvent[],
  identity: HandoffIdentity = currentIdentity(),
): StagedReleaseHandoff {
  return {
    version: STAGED_RELEASE_VERSION,
    ...identity,
    releases: events.map(({ type: _, ...event }) => event),
  };
}

export function formatStageCommand(
  events: readonly NpmStageEvent[],
  operation: "approve" | "reject",
) {
  return `changeset stage ${operation} ${events
    .map((event) => event.stageId)
    .join(" ")}`;
}

export async function uploadStagedRelease(
  events: readonly NpmStageEvent[],
  operation: "approve" | "reject",
): Promise<number> {
  const verb = operation === "approve" ? "Approve" : "Reject";
  core.info(`${verb} the staged packages in this order:
${formatStageCommand(events, operation)}`);
  core.info(
    "This command uses the default registry. For custom or multiple registries, split the IDs and pass --registry to each command.",
  );

  const tmpDir = process.env.RUNNER_TEMP ?? (await fs.realpath(os.tmpdir()));
  const outDir = path.join(tmpDir, `changeset-staged-release-${Date.now()}`);
  const handoffPath = path.join(outDir, STAGED_RELEASE_FILENAME);
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(
    handoffPath,
    `${JSON.stringify(createStagedReleaseHandoff(events), null, 2)}\n`,
  );

  const result = await artifact.uploadArtifact(
    `changeset-staged-release-${context.runId}-${Date.now()}`,
    [handoffPath],
    outDir,
    { skipArchive: true, retentionDays: 30 },
  );
  if (result.id === undefined) {
    throw new Error("Staged release artifact upload did not return an id");
  }

  return result.id;
}

function expectedGitTag(
  tool: Awaited<ReturnType<typeof getPackages>>["tool"],
  entry: StagedReleaseEntry,
) {
  return tool.type === "root"
    ? `v${entry.version}`
    : `${entry.packageName}@${entry.version}`;
}

export async function validateStagedReleaseHandoff(
  value: unknown,
  cwd: string,
  identity: HandoffIdentity = currentIdentity(),
): Promise<{
  handoff: StagedReleaseHandoff;
  packagesByName: Map<string, Package>;
}> {
  if (
    !isObject(value) ||
    value.version !== STAGED_RELEASE_VERSION ||
    value.repository !== identity.repository ||
    value.runId !== identity.runId ||
    value.sha !== identity.sha ||
    !Array.isArray(value.releases) ||
    value.releases.length === 0 ||
    !value.releases.every(isStagedReleaseEntry)
  ) {
    throw new Error(
      "Invalid staged release artifact: version, origin, or release entries do not match this workflow run",
    );
  }

  const handoff = value as StagedReleaseHandoff;
  const uniqueFields: Array<keyof StagedReleaseEntry> = [
    "packageName",
    "gitTag",
    "stageId",
  ];
  for (const field of uniqueFields) {
    const values = handoff.releases.map((entry) => entry[field]);
    if (new Set(values).size !== values.length) {
      throw new Error(
        `Invalid staged release artifact: duplicate ${field} value`,
      );
    }
  }

  const { packages, rootPackage, tool } = await getPackages(cwd);
  const packagesByName = new Map(
    [...packages, ...(rootPackage ? [rootPackage] : [])].map((pkg) => [
      pkg.packageJson.name,
      pkg,
    ]),
  );
  for (const entry of handoff.releases) {
    const pkg = packagesByName.get(entry.packageName);
    if (!pkg || pkg.packageJson.version !== entry.version) {
      throw new Error(
        `Invalid staged release artifact: ${entry.packageName}@${entry.version} does not match the checked-out manifest`,
      );
    }
    if (entry.gitTag !== expectedGitTag(tool, entry)) {
      throw new Error(
        `Invalid staged release artifact: unexpected Git tag ${entry.gitTag}`,
      );
    }
  }

  return { handoff, packagesByName };
}

export async function downloadAndValidateStagedRelease(
  artifactId: number,
  cwd: string,
) {
  const tmpDir = process.env.RUNNER_TEMP ?? (await fs.realpath(os.tmpdir()));
  const artifactDir = await downloadArtifact(
    tmpDir,
    artifactId,
    "changeset-staged-release",
  );
  const handoffPath = path.join(artifactDir, STAGED_RELEASE_FILENAME);
  let value: unknown;
  try {
    value = JSON.parse(await fs.readFile(handoffPath, "utf8"));
  } catch (error) {
    throw new Error(`Failed to read staged release artifact ${artifactId}`, {
      cause: error,
    });
  }
  return validateStagedReleaseHandoff(value, cwd);
}

function outputContainsVersion(output: string, version: string) {
  const values: unknown[] = [];
  for (const line of output.split("\n")) {
    if (!line.trim()) continue;
    try {
      values.push(JSON.parse(line));
    } catch {
      continue;
    }
  }

  const contains = (value: unknown): boolean => {
    if (value === version) return true;
    if (Array.isArray(value)) return value.some(contains);
    if (isObject(value)) return Object.values(value).some(contains);
    return false;
  };
  return values.some(contains);
}

async function isPublished(
  cwd: string,
  tool: Awaited<ReturnType<typeof getPackages>>["tool"],
  entry: StagedReleaseEntry,
) {
  const spec = `${entry.packageName}@${entry.version}`;
  const command =
    tool.type === "pnpm" ? "pnpm" : tool.type === "yarn" ? "yarn" : "npm";
  const args =
    tool.type === "yarn"
      ? ["npm", "info", spec, "--fields", "version", "--json"]
      : ["view", spec, "version", "--json"];
  const result = await getExecOutput(command, args, {
    cwd,
    ignoreReturnCode: true,
    silent: true,
    env: process.env as Record<string, string>,
  });
  return (
    result.exitCode === 0 && outputContainsVersion(result.stdout, entry.version)
  );
}

export async function verifyPublished(
  releases: readonly StagedReleaseEntry[],
  cwd: string,
  options: { timeoutMs?: number; intervalMs?: number } = {},
) {
  const timeoutMs = options.timeoutMs ?? 120_000;
  const intervalMs = options.intervalMs ?? 5_000;
  const deadline = Date.now() + timeoutMs;
  const { tool } = await getPackages(cwd);

  while (true) {
    const results = await Promise.all(
      releases.map((release) => isPublished(cwd, tool, release)),
    );
    if (results.every(Boolean)) return;
    if (Date.now() >= deadline) {
      const missing = releases
        .filter((_, index) => !results[index])
        .map((release) => `${release.packageName}@${release.version}`);
      throw new Error(
        `Timed out waiting for approved packages to become visible: ${missing.join(", ")}`,
      );
    }
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(intervalMs, deadline - Date.now())),
    );
  }
}

async function ensureTag(github: GitHub, tag: string, sha: string) {
  try {
    const existing = await github.octokit.rest.git.getRef({
      ...context.repo,
      ref: `tags/${tag}`,
    });
    if (existing.data.object.sha !== sha) {
      throw new Error(
        `Git tag ${tag} already exists at ${existing.data.object.sha}, expected ${sha}`,
      );
    }
    return;
  } catch (error) {
    if (!isHttpNotFound(error)) {
      throw error;
    }
  }
  await github.octokit.rest.git.createRef({
    ...context.repo,
    ref: `refs/tags/${tag}`,
    sha,
  });
}

async function ensureRelease(github: GitHub, pkg: Package, tagName: string) {
  try {
    await github.octokit.rest.repos.getReleaseByTag({
      ...context.repo,
      tag: tagName,
    });
    return;
  } catch (error) {
    if (!isHttpNotFound(error)) {
      throw error;
    }
  }
  await createRelease(github.octokit, { pkg, tagName });
}

export async function finalizeStagedRelease(options: {
  github: GitHub;
  handoff: StagedReleaseHandoff;
  packagesByName: Map<string, Package>;
  cwd: string;
  verify: boolean;
}) {
  if (options.verify) {
    await verifyPublished(options.handoff.releases, options.cwd);
  }

  for (const entry of options.handoff.releases) {
    const pkg = options.packagesByName.get(entry.packageName)!;
    await ensureTag(options.github, entry.gitTag, options.handoff.sha);
    await ensureRelease(options.github, pkg, entry.gitTag);
  }
}
