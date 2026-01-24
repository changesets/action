import unified from "unified";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import fs from "node:fs/promises";
import type { Root } from "mdast";
// @ts-ignore
import mdastToString from "mdast-util-to-string";
import { getPackages, type Package } from "@manypkg/get-packages";
import { getExecOutput } from "@actions/exec";
import semverGte from "semver/functions/gte.js";

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
  previousVersions: Map<string, string>
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
  let ast = unified().use(remarkParse).parse(changelog) as Root;

  let highestLevel: number = BumpLevels.dep;

  let nodes = ast.children;
  let headingStartInfo:
    | {
        index: number;
        depth: number;
      }
    | undefined;
  let endIndex: number | undefined;

  for (let i = 0; i < nodes.length; i++) {
    let node = nodes[i];
    if (node.type === "heading") {
      let stringified: string = mdastToString(node);
      let match = stringified.toLowerCase().match(/(major|minor|patch)/);
      if (match !== null) {
        let level = BumpLevels[match[0] as "major" | "minor" | "patch"];
        highestLevel = Math.max(level, highestLevel);
      }
      if (headingStartInfo === undefined && stringified === version) {
        headingStartInfo = {
          index: i,
          depth: node.depth,
        };
        continue;
      }
      if (
        endIndex === undefined &&
        headingStartInfo !== undefined &&
        headingStartInfo.depth === node.depth
      ) {
        endIndex = i;
        break;
      }
    }
  }
  if (headingStartInfo) {
    ast.children = ast.children.slice(headingStartInfo.index + 1, endIndex);
  }
  return {
    content: unified().use(remarkStringify).stringify(ast),
    highestLevel: highestLevel,
  };
}

export function sortTheThings(
  a: { private: boolean; highestLevel: number },
  b: { private: boolean; highestLevel: number }
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
    () => false
  );
}

export async function validateOidcEnvironment(): Promise<void> {
  // Check npm version
  const { stdout } = await getExecOutput("npm", ["--version"]);
  const npmVersion = stdout.trim();

  if (!semverGte(npmVersion, "11.5.1")) {
    throw new Error(
      `npm version ${npmVersion} detected. npm 11.5.1+ required for OIDC.\n` +
        `Add step to your workflow:\n` +
        `  - run: npm install -g npm@latest`
    );
  }

  // Check for id-token permission
  if (!process.env.ACTIONS_ID_TOKEN_REQUEST_URL) {
    throw new Error(
      `id-token: write permission not detected.\n` +
        `Add to your workflow:\n` +
        `permissions:\n` +
        `  contents: write\n` +
        `  id-token: write`
    );
  }

  // Check that NPM_TOKEN is not set (conflicting auth methods)
  if (process.env.NPM_TOKEN) {
    throw new Error(
      `NPM_TOKEN is set but oidcAuth: true.\n` +
        `Remove NPM_TOKEN secret or set oidcAuth: false`
    );
  }
}

/**
 * Sets up npm authentication by either validating OIDC environment or validating NPM_TOKEN.
 * This function should be called early in the workflow, before reading changesets.
 */
export async function setupNpmAuth(oidcAuth: boolean): Promise<void> {
  if (oidcAuth) {
    await validateOidcEnvironment();
  } else {
    // Legacy NPM_TOKEN authentication
    if (!process.env.NPM_TOKEN) {
      throw new Error(
        "NPM_TOKEN environment variable is required when not using OIDC authentication. " +
          "Either set the NPM_TOKEN secret or enable OIDC by setting oidcAuth: true"
      );
    }
  }
}

/**
 * Creates or updates .npmrc file with NPM_TOKEN authentication.
 * This should only be called in legacy mode (when oidcAuth is false).
 */
export async function createNpmrcFile(): Promise<void> {
  if (!process.env.NPM_TOKEN) {
    throw new Error("NPM_TOKEN is required to create .npmrc file");
  }

  const userNpmrcPath = `${process.env.HOME}/.npmrc`;
  
  if (await fileExists(userNpmrcPath)) {
    const userNpmrcContent = await fs.readFile(userNpmrcPath, "utf8");
    const authLine = userNpmrcContent.split("\n").find((line) => {
      // check based on https://github.com/npm/cli/blob/8f8f71e4dd5ee66b3b17888faad5a7bf6c657eed/test/lib/adduser.js#L103-L105
      return /^\s*\/\/registry\.npmjs\.org\/:[_-]authToken=/i.test(line);
    });
    if (!authLine) {
      await fs.appendFile(
        userNpmrcPath,
        `\n//registry.npmjs.org/:_authToken=${process.env.NPM_TOKEN}\n`
      );
    }
  } else {
    await fs.writeFile(
      userNpmrcPath,
      `//registry.npmjs.org/:_authToken=${process.env.NPM_TOKEN}\n`
    );
  }
}
