import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import artifact from "@actions/artifact";
import * as core from "@actions/core";
import {
  exec,
  getExecOutput,
  type ExecOptions as ActionsExecOptions,
  type ExecOutput,
} from "@actions/exec";
import { getPackages, type Package } from "@manypkg/get-packages";
import major from "semver/functions/major.js";
import subset from "semver/ranges/subset.js";

const require = createRequire(import.meta.url);

export const BumpLevels = {
  dep: 0,
  patch: 1,
  minor: 2,
  major: 3,
} as const;

export async function getVersionsByDirectory(cwd: string) {
  let { packages } = await getPackages(cwd);
  return new Map(packages.map((x) => [x.dir, x.packageJson.version]));
}

export async function getChangedPackages(
  cwd: string,
  previousVersions: Map<string, string>,
) {
  let { packages } = await getPackages(cwd);
  let changedPackages = new Set<Package>();

  for (let pkg of packages) {
    const previousVersion = previousVersions.get(pkg.dir);
    if (previousVersion !== pkg.packageJson.version) {
      changedPackages.add(pkg);
    }
  }

  return [...changedPackages];
}

export function getChangelogEntry(changelog: string, version: string) {
  let highestLevel: number = BumpLevels.dep;
  let headingStartInfo: { index: number; depth: number } | undefined;
  let endIndex: number | undefined;

  // Iterate through each headings and code blocks (for skipping its contents)
  const regex = /^(#{1,6})\s(.*)$|^(`{3,})/gm;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(changelog)) != null) {
    // Skip over code blocks so we don't match any headings inside of them
    if (match[3]) {
      const endOfCodeBlockRegex = new RegExp(`^${match[3]}`, "gm");
      endOfCodeBlockRegex.lastIndex = regex.lastIndex;
      const endMatch = endOfCodeBlockRegex.exec(changelog);
      if (endMatch) {
        // Start next search for headings after the end of the code block
        regex.lastIndex = endOfCodeBlockRegex.lastIndex;
        continue;
      } else {
        // Can't find end of code block, probably malformed
        break;
      }
    }

    const headingDepth = match[1].length;
    const headingText = match[2].trim();

    // Search for the highest bump level in the entire changelog
    const levelMatch = /(major|minor|patch)/.exec(headingText.toLowerCase());
    if (levelMatch != null) {
      const level = BumpLevels[levelMatch[0] as "major" | "minor" | "patch"];
      highestLevel = Math.max(level, highestLevel);
    }

    // Search for heading of the entry
    if (headingText === version) {
      headingStartInfo = { index: regex.lastIndex, depth: headingDepth };
      continue;
    }

    // If we've found the entry heading, search for the closing heading with the same depth
    if (headingStartInfo && headingDepth === headingStartInfo.depth) {
      endIndex = match.index;
      break;
    }
  }

  return {
    content: changelog.slice(headingStartInfo?.index, endIndex).trim(),
    highestLevel,
  };
}

export function sortTheThings(
  a: { private: boolean; highestLevel: number },
  b: { private: boolean; highestLevel: number },
) {
  if (a.private === b.private) {
    return b.highestLevel - a.highestLevel;
  }
  if (a.private) {
    return 1;
  }
  return -1;
}

export function isErrorWithCode(err: unknown, code: string) {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    err.code === code
  );
}

export function fileExists(filePath: string) {
  return fs.access(filePath, fs.constants.F_OK).then(
    () => true,
    () => false,
  );
}

export function getOptionalInput(name: string) {
  // normalize empty string default return value of `core.getInput` to undefined
  return core.getInput(name) || undefined;
}

export function getRequiredInput(name: string) {
  // it's just a small utility wrapper, mainly introduced for usage parity with our custom `getOptionalInput`
  // note: `core.getBooleanInput` gets used directly as it already normalizes the return value nicely
  return core.getInput(name, { required: true });
}

export function throwOnRenamedInputs(renames: Record<string, string>) {
  const references: Record<string, string> = {};

  for (const [oldInput, newInput] of Object.entries(renames)) {
    if (core.getInput(oldInput)) {
      references[oldInput] = newInput;
    }
  }

  if (Object.keys(references).length > 0) {
    const list = Object.entries(references)
      .map(([oldInput, newInput]) => `- "${oldInput}" -> "${newInput}"`)
      .join("\n");
    throw new Error(
      `The following inputs have been renamed:\n${list}\nPlease update your workflow file.`,
    );
  }
}

const changesetsCliCompatibilityError =
  "This version of the Changesets action is designed to work with Changesets CLI v3. " +
  "Changesets CLI v2 is not supported; use Changesets action v1 instead, which is compatible with CLI v2.";

export async function validateChangesetsCliVersion(cwd: string) {
  const { rootPackage } = await getPackages(cwd);
  const packageJson = rootPackage?.packageJson;
  const declaredVersion =
    packageJson?.devDependencies?.["@changesets/cli"] ??
    packageJson?.dependencies?.["@changesets/cli"];

  if (typeof declaredVersion === "string") {
    const range = declaredVersion.startsWith("workspace:")
      ? declaredVersion.slice("workspace:".length)
      : declaredVersion;

    let isV2 = false;

    try {
      isV2 = subset(range, ">=2.0.0-0 <3.0.0-0", {
        includePrerelease: true,
      });
    } catch {
      // it could be a non-semver protocol
    }

    if (isV2) {
      throw new Error(changesetsCliCompatibilityError);
    }
  }

  let cliPackageJson;

  try {
    cliPackageJson = require(
      require.resolve("@changesets/cli/package.json", { paths: [cwd] }),
    );
  } catch {
    return;
  }

  if (
    typeof cliPackageJson.version === "string" &&
    major(cliPackageJson.version) === 2
  ) {
    throw new Error(changesetsCliCompatibilityError);
  }
}

function resolveChangesetsCli(cwd: string) {
  return require.resolve("@changesets/cli/bin.js", {
    paths: [cwd],
  });
}

interface ExecOptions extends Omit<ActionsExecOptions, "env"> {
  env?: Record<string, string | undefined>;
}

export function execChangesetsCli(args: string[], options?: ExecOptions) {
  return exec(
    "node",
    [resolveChangesetsCli(options?.cwd ?? process.cwd()), ...args],
    options as ActionsExecOptions,
  );
}

export function getExecOutputChangesetsCli(
  args: string[],
  options?: ExecOptions,
): Promise<ExecOutput> {
  return getExecOutput(
    "node",
    [resolveChangesetsCli(options?.cwd ?? process.cwd()), ...args],
    options as ActionsExecOptions,
  );
}

export async function downloadArtifact(
  tmpDir: string,
  artifactId: number,
  name: string,
) {
  if (!Number.isInteger(artifactId) || artifactId <= 0) {
    throw new Error(
      `Invalid ${JSON.stringify(name)} artifact id: ${artifactId}`,
    );
  }

  const downloadPath = path.join(tmpDir, `${name}-${artifactId}-${Date.now()}`);
  const result = await artifact.downloadArtifact(artifactId, {
    path: downloadPath,
  });

  if (!result.downloadPath) {
    throw new Error(
      `${JSON.stringify(name)} artifact download did not return a path for artifact ${artifactId}`,
    );
  }

  return result.downloadPath;
}
