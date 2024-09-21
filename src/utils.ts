import unified from "unified";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
// @ts-ignore
import { toString as mdastToString } from "mdast-util-to-string";
import { getPackages, Package } from "@manypkg/get-packages";
import { Node, Parent } from "unist";
import { Heading } from "mdast";
import {
  assertIsReleaseLevelIndex,
  checkForLevelsInString,
  getHigherIndex,
  ReleaseLevelIndex,
} from "./releaseLevels.js";

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
  const ast = parseChangelog(changelog);
  const { headingStartInfo, endIndex, highestLevel } = findVersionSection(
    ast,
    version
  );
  const content = extractContent(ast, headingStartInfo, endIndex);
  return { content, highestLevel };
}

function parseChangelog(changelog: string): Parent {
  return unified().use(remarkParse).parse(changelog) as Parent;
}

function isTargetVersion(node: Node, version: string) {
  return mdastToString(node).toLowerCase() === version;
}

function findVersionSection(ast: Parent, version: string) {
  const nodes: Node[] = ast.children;
  let highestLevel: ReleaseLevelIndex = 0;
  let headingStartInfo: { index: number; depth: number } | undefined;
  let endIndex: number | undefined;
  
  for (const [index, node] of nodes.entries()) {
    if(endIndex) {
      break;
    } else {
      processTheNode(node,index);
    }
  }
  return { headingStartInfo, endIndex, highestLevel };

  function processTheNode(node: Node, index: number) {
    const nodeString: string = mdastToString(node);
    if (isHeading(node)) {
      if (isTargetVersion(node, version)) {
        headingStartInfo = { index, depth: node.depth };
      } else {
        if (isEndOfSection(node, headingStartInfo, endIndex)) {
          endIndex = index;
          return;
        }
      }
    }
    if (headingStartInfo && containsReleaseLevel(node)) {
      extractAndUpdateLevel(nodeString);
    }
  }
  function extractAndUpdateLevel(nodeString: string) {
    const bumpLevel = getBumpLevel(nodeString);
    highestLevel = getHigherIndex(bumpLevel, highestLevel);
  }
}

function getBumpLevel(nodeString: string): ReleaseLevelIndex {
  const matches = checkForLevelsInString(nodeString);
  let highest = -1;
  // return the highest level
  if (matches !== null) {
    for (let { index } of matches) {
      highest = index > highest ? index : highest;
    }
  }
  assertIsReleaseLevelIndex(highest);
  return highest;
}

function isEndOfSection(
  node: Heading,
  headingStartInfo:
    | {
        index: number;
        depth: number;
      }
    | undefined,
  endIndex: number | undefined
) {
  return (
    haventFoundTheEnd() && haveAStart() && thisHeadingHasSameDepthAsStart()
  );

  function haventFoundTheEnd() {
    return endIndex === undefined;
  }

  function haveAStart() {
    return headingStartInfo !== undefined;
  }

  function thisHeadingHasSameDepthAsStart() {
    return headingStartInfo?.depth === node.depth;
  }
}

function extractContent(
  ast: Parent,
  headingStartInfo:
    | {
        index: number;
        depth: number;
      }
    | undefined,
  endIndex: number | undefined
) {
  if (headingStartInfo) {
    ast.children = (ast.children as any).slice(
      headingStartInfo.index + 1,
      endIndex
    );
  }
  return unified().use(remarkStringify).stringify(ast);
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

function isHeading(x: unknown): x is Heading {
  return (x as Heading).type === "heading";
}

function containsReleaseLevel(node: Node) {
  const nodeString: string = mdastToString(node);
  return nodeString.toLowerCase().match(/(major|minor|patch)/) !== null;
}
