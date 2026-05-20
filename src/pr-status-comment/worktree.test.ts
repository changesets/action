import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import getReleasePlan from "@changesets/get-release-plan";
import { afterEach, describe, expect, it } from "vitest";
import { withPullRequestWorktree } from "./worktree.ts";

const tempDirs: string[] = [];

function runGit(cwd: string, args: string[]) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
  }).trim();
}

async function makeTempDir(prefix: string) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

async function makeTempPath(prefix: string, leaf: string) {
  const parent = await makeTempDir(prefix);
  return path.join(parent, leaf);
}

async function writeFile(cwd: string, filePath: string, contents: string) {
  const absolutePath = path.join(cwd, filePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, contents);
}

function toFileUrl(filePath: string) {
  return `file://${filePath}`;
}

async function createRepo(cwd: string) {
  runGit(cwd, ["init", "-b", "main"]);
  runGit(cwd, ["config", "user.name", "Test User"]);
  runGit(cwd, ["config", "user.email", "test@example.com"]);
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((cwd) =>
      fs.rm(cwd, { recursive: true, force: true }),
    ),
  );
});

describe("withPullRequestWorktree", () => {
  it("fetches a PR branch into a detached worktree and keeps the main checkout untouched", async () => {
    const sourceRepo = await makeTempDir("changesets-action-source-");
    await createRepo(sourceRepo);
    await writeFile(sourceRepo, ".changeset/config.json", JSON.stringify({}));
    await writeFile(
      sourceRepo,
      "package.json",
      JSON.stringify({
        name: "repo",
        private: true,
        workspaces: ["packages/*"],
      }),
    );
    await writeFile(
      sourceRepo,
      "packages/pkg-a/package.json",
      JSON.stringify({
        name: "pkg-a",
        version: "1.0.0",
      }),
    );
    runGit(sourceRepo, ["add", "."]);
    runGit(sourceRepo, ["commit", "-m", "base"]);

    const originBare = await makeTempPath("changesets-action-origin-", "origin.git");
    runGit(path.dirname(originBare), ["clone", "--bare", sourceRepo, originBare]);

    const checkoutRepo = await makeTempPath("changesets-action-checkout-", "checkout");
    runGit(path.dirname(checkoutRepo), [
      "clone",
      "--depth",
      "1",
      "--branch",
      "main",
      toFileUrl(originBare),
      checkoutRepo,
    ]);

    const forkBare = await makeTempPath("changesets-action-fork-bare-", "fork.git");
    runGit(path.dirname(forkBare), ["clone", "--bare", originBare, forkBare]);

    const forkRepo = await makeTempPath("changesets-action-fork-", "fork");
    runGit(path.dirname(forkRepo), [
      "clone",
      "--depth",
      "1",
      "--branch",
      "main",
      toFileUrl(forkBare),
      forkRepo,
    ]);
    runGit(forkRepo, ["config", "user.name", "Test User"]);
    runGit(forkRepo, ["config", "user.email", "test@example.com"]);
    runGit(forkRepo, ["checkout", "-b", "feature"]);
    await writeFile(forkRepo, "packages/pkg-a/src/index.ts", "export const value = 1;\n");
    await writeFile(
      forkRepo,
      ".changeset/add-pkg-a.md",
      `---
"pkg-a": patch
---

Add pkg-a
`,
    );
    runGit(forkRepo, ["add", "."]);
    runGit(forkRepo, ["commit", "-m", "feature"]);
    runGit(forkRepo, ["push", "origin", "feature"]);

    const originalHead = runGit(checkoutRepo, ["rev-parse", "HEAD"]);
    const context = {
      number: 123,
      base: {
        ref: "main",
      },
      head: {
        ref: "feature",
        repo: {
          clone_url: toFileUrl(forkBare),
        },
      },
    } as any;

    const result = await withPullRequestWorktree(
      context,
      async ({ cwd, baseRef }) => {
        const releasePlan = await getReleasePlan(cwd, baseRef);
        return {
          currentHead: runGit(cwd, ["rev-parse", "HEAD"]),
          currentBranch: runGit(cwd, ["branch", "--show-current"]),
          releases: releasePlan.releases.map((release) => ({
            name: release.name,
            type: release.type,
            newVersion: release.newVersion,
          })),
        };
      },
      checkoutRepo,
    );

    expect(result.currentHead).not.toBe(originalHead);
    expect(result.currentBranch).toBe("");
    expect(result.releases).toEqual([
      {
        name: "pkg-a",
        type: "patch",
        newVersion: "1.0.1",
      },
    ]);
    expect(runGit(checkoutRepo, ["rev-parse", "HEAD"])).toBe(originalHead);
    expect(runGit(checkoutRepo, ["branch", "--show-current"])).toBe("main");
  });
});
