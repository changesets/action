import path from "node:path";
import { getExecOutput } from "@actions/exec";
import assembleReleasePlan from "@changesets/assemble-release-plan";
import { parse as parseConfig } from "@changesets/config";
import parseChangeset from "@changesets/parse";
import type {
  Config,
  NewChangeset,
  PackageJSON,
  PreState,
  ReleasePlan,
  WrittenConfig,
} from "@changesets/types";
import type { Package, Packages, Tool } from "@manypkg/get-packages";
import yaml from "js-yaml";
import micromatch from "micromatch";

type WorkspacePackageJson = PackageJSON & {
  workspaces?: ReadonlyArray<string> | { packages: ReadonlyArray<string> };
  bolt?: { workspaces: ReadonlyArray<string> };
};

type PnpmWorkspace = {
  packages?: ReadonlyArray<string>;
};

async function git(
  cwd: string,
  args: string[],
  { ignoreReturnCode = false }: { ignoreReturnCode?: boolean } = {},
) {
  const result = await getExecOutput("git", args, {
    cwd,
    ignoreReturnCode,
    silent: true,
  });

  if (!ignoreReturnCode && result.exitCode !== 0) {
    throw new Error(result.stderr || `git ${args.join(" ")} failed`);
  }

  return result;
}

async function getRepoRoot(cwd: string) {
  const { stdout } = await git(cwd, ["rev-parse", "--show-toplevel"]);
  return stdout.trim();
}

async function listTreePaths(cwd: string, ref: string) {
  const { stdout } = await git(cwd, ["ls-tree", "-r", "--name-only", ref]);
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

async function readTextFileAtRef(cwd: string, ref: string, filePath: string) {
  const { stdout, exitCode } = await git(
    cwd,
    ["show", `${ref}:${filePath}`],
    { ignoreReturnCode: true },
  );

  if (exitCode !== 0) {
    return undefined;
  }

  return stdout;
}

async function readJsonFileAtRef<T>(
  cwd: string,
  ref: string,
  filePath: string,
): Promise<T | undefined> {
  const contents = await readTextFileAtRef(cwd, ref, filePath);
  if (contents === undefined) {
    return undefined;
  }
  return JSON.parse(contents) as T;
}

async function getChangedFilesBetween(
  cwd: string,
  baseRef: string,
  targetRef: string,
  diffFilter?: string,
) {
  const { stdout: mergeBaseStdout } = await git(cwd, [
    "merge-base",
    baseRef,
    targetRef,
  ]);
  const mergeBase = mergeBaseStdout.trim();
  const diffArgs = ["diff", "--name-only", "--no-relative"];

  if (diffFilter) {
    diffArgs.push(`--diff-filter=${diffFilter}`);
  }

  diffArgs.push(mergeBase, targetRef);

  const { stdout } = await git(cwd, diffArgs);
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function getWorkspaceTool(
  rootPackageJson: WorkspacePackageJson,
  pnpmWorkspace: PnpmWorkspace | undefined,
  lernaJson: { packages?: string[] } | undefined,
):
  | {
      tool: Tool;
      globs: ReadonlyArray<string>;
    }
  | undefined {
  if (rootPackageJson.workspaces) {
    if (Array.isArray(rootPackageJson.workspaces)) {
      return {
        tool: "yarn",
        globs: rootPackageJson.workspaces,
      };
    }

    if (!rootPackageJson.workspaces.packages) {
      throw new Error("Expected workspaces.packages to be defined");
    }

    return {
      tool: "yarn",
      globs: rootPackageJson.workspaces.packages,
    };
  }

  if (rootPackageJson.bolt?.workspaces) {
    return {
      tool: "bolt",
      globs: rootPackageJson.bolt.workspaces,
    };
  }

  if (pnpmWorkspace?.packages) {
    return {
      tool: "pnpm",
      globs: pnpmWorkspace.packages,
    };
  }

  if (lernaJson) {
    return {
      tool: "lerna",
      globs: lernaJson.packages ?? ["packages/*"],
    };
  }
}

function assertValidPackageName(packageJson: PackageJSON, packageJsonPath: string) {
  if (!packageJson.name) {
    throw new Error(`Package at "${packageJsonPath}" is missing a "name" field`);
  }
}

async function getPackagesAtRef(cwd: string, ref: string): Promise<Packages> {
  const [repoRoot, treePaths, rootPackageJson, lernaJson] = await Promise.all([
    getRepoRoot(cwd),
    listTreePaths(cwd, ref),
    readJsonFileAtRef<WorkspacePackageJson>(cwd, ref, "package.json"),
    readJsonFileAtRef<{ packages?: string[] }>(cwd, ref, "lerna.json"),
  ]);

  if (!rootPackageJson) {
    throw new Error(`Could not read package.json at ref "${ref}"`);
  }

  assertValidPackageName(rootPackageJson, "package.json");

  const pnpmWorkspaceContents = treePaths.includes("pnpm-workspace.yaml")
    ? await readTextFileAtRef(cwd, ref, "pnpm-workspace.yaml")
    : undefined;

  const pnpmWorkspace = pnpmWorkspaceContents
    ? (yaml.load(pnpmWorkspaceContents) as PnpmWorkspace)
    : undefined;

  const tool = getWorkspaceTool(rootPackageJson, pnpmWorkspace, lernaJson);
  const root: Package = {
    dir: repoRoot,
    packageJson: rootPackageJson,
  };

  if (!tool) {
    return {
      tool: "root",
      root,
      packages: [root],
    };
  }

  const packageDirectories = treePaths
    .filter((treePath) => path.posix.basename(treePath) === "package.json")
    .map((treePath) => path.posix.dirname(treePath))
    .filter((dir) => dir !== ".")
    .sort();

  const matches = micromatch(packageDirectories, tool.globs);
  const packages = (
    await Promise.all(
      matches.map(async (dir) => {
        const packageJsonPath = path.posix.join(dir, "package.json");
        const packageJson = await readJsonFileAtRef<PackageJSON>(
          cwd,
          ref,
          packageJsonPath,
        );

        if (!packageJson) {
          return null;
        }

        assertValidPackageName(packageJson, packageJsonPath);
        return {
          dir: path.join(repoRoot, dir),
          packageJson,
        } satisfies Package;
      }),
    )
  ).filter((pkg): pkg is Package => pkg !== null);

  return {
    tool: tool.tool,
    root,
    packages,
  };
}

async function getPreStateAtRef(cwd: string, ref: string) {
  return readJsonFileAtRef<PreState>(cwd, ref, ".changeset/pre.json");
}

async function getConfigAtRef(cwd: string, ref: string, packages: Packages) {
  const config = await readJsonFileAtRef<WrittenConfig>(
    cwd,
    ref,
    ".changeset/config.json",
  );

  if (!config) {
    throw new Error(`Could not read .changeset/config.json at ref "${ref}"`);
  }

  return parseConfig(config, packages);
}

async function getChangesetsAtRef(cwd: string, ref: string, sinceRef: string) {
  const changedFiles = await getChangedFilesBetween(cwd, sinceRef, ref, "d");

  return Promise.all(
    changedFiles
      .filter(
        (filePath) =>
          filePath.startsWith(".changeset/") &&
          filePath.endsWith(".md") &&
          filePath !== ".changeset/README.md",
      )
      .map(async (filePath) => {
        const contents = await readTextFileAtRef(cwd, ref, filePath);

        if (contents === undefined) {
          throw new Error(`Could not read ${filePath} at ref "${ref}"`);
        }

        const id = path.posix.basename(filePath, ".md");
        return {
          ...parseChangeset(contents),
          id,
        } satisfies NewChangeset;
      }),
  );
}

function isSubdir(parentDir: string, filePath: string) {
  const relative = path.relative(parentDir, filePath);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function getChangedPackagesFromFiles(
  packages: Packages,
  repoRoot: string,
  changedFiles: string[],
) {
  const remainingChangedFiles = changedFiles.map((filePath) =>
    path.join(repoRoot, filePath),
  );

  return [...packages.packages]
    .sort((pkgA, pkgB) => pkgB.dir.length - pkgA.dir.length)
    .filter((pkg) => {
      const changedPackageFiles: string[] = [];

      for (let index = remainingChangedFiles.length - 1; index >= 0; index--) {
        const filePath = remainingChangedFiles[index];

        if (isSubdir(pkg.dir, filePath)) {
          remainingChangedFiles.splice(index, 1);
          changedPackageFiles.push(filePath);
        }
      }

      return changedPackageFiles.length > 0;
    });
}

export async function getPullRequestSnapshotInfo(args: {
  cwd: string;
  targetRef: string;
  sinceRef: string;
}) {
  const { cwd, targetRef, sinceRef } = args;
  const [repoRoot, packages, changedFiles] = await Promise.all([
    getRepoRoot(cwd),
    getPackagesAtRef(cwd, targetRef),
    getChangedFilesBetween(cwd, sinceRef, targetRef),
  ]);

  const [config, preState, changesets] = await Promise.all([
    getConfigAtRef(cwd, targetRef, packages),
    getPreStateAtRef(cwd, targetRef),
    getChangesetsAtRef(cwd, targetRef, sinceRef),
  ]);

  return {
    changedPackages: getChangedPackagesFromFiles(packages, repoRoot, changedFiles),
    releasePlan: assembleReleasePlan(changesets, packages, config, preState),
  };
}
