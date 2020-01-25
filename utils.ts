import unified from "unified";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
// @ts-ignore
import mdastToString from "mdast-util-to-string";
import { exec } from "@actions/exec";
import * as core from "@actions/core";
import getWorkspaces, { Workspace } from "get-workspaces";
import path from "path";

export const BumpLevels = {
  dep: 0,
  patch: 1,
  minor: 2,
  major: 3
} as const;

export async function getChangedPackages(cwd: string) {
  let workspaces = await getWorkspaces({
    cwd,
    tools: ["yarn", "bolt", "pnpm", "root"]
  });

  if (!workspaces) {
    core.setFailed("Could not find workspaces");
    return process.exit(1);
  }

  let workspacesByDirectory = new Map(workspaces.map(x => [x.dir, x]));

  let output = await execWithOutput("git", ["diff", "--name-only"], { cwd });
  let names = output.stdout.split("\n");
  let changedWorkspaces = new Set<Workspace>();
  for (let name of names) {
    if (name === "") continue;
    let dirname = path.resolve(cwd, path.dirname(name));
    let workspace = workspacesByDirectory.get(dirname);
    if (workspace !== undefined) {
      changedWorkspaces.add(workspace);
    }
  }

  return [...changedWorkspaces];
}

export function getChangelogEntry(changelog: string, version: string) {
  let ast = unified()
    .use(remarkParse)
    .parse(changelog);

  let highestLevel: number = BumpLevels.dep;

  let nodes = ast.children as Array<any>;
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
          depth: node.depth
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
    ast.children = (ast.children as any).slice(
      headingStartInfo.index + 1,
      endIndex
    );
  }
  return {
    content: unified()
      .use(remarkStringify)
      .stringify(ast),
    highestLevel: highestLevel
  };
}

export async function execWithOutput(
  command: string,
  args?: string[],
  options?: { ignoreReturnCode?: boolean; cwd?: string }
) {
  let myOutput = "";
  let myError = "";

  return {
    code: await exec(command, args, {
      listeners: {
        stdout: (data: Buffer) => {
          myOutput += data.toString();
        },
        stderr: (data: Buffer) => {
          myError += data.toString();
        }
      },

      ...options
    }),
    stdout: myOutput,
    stderr: myError
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
