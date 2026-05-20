import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { getPullRequestSnapshotInfo } from "./git-snapshot.ts";

const tempDirs: string[] = [];

function runGit(cwd: string, args: string[]) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
  }).trim();
}

async function createRepoFixture(files: Record<string, string>) {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "changesets-action-"));
  tempDirs.push(cwd);

  for (const [filePath, contents] of Object.entries(files)) {
    const absolutePath = path.join(cwd, filePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, contents);
  }

  runGit(cwd, ["init", "-b", "main"]);
  runGit(cwd, ["config", "user.name", "Test User"]);
  runGit(cwd, ["config", "user.email", "test@example.com"]);
  runGit(cwd, ["add", "."]);
  runGit(cwd, ["commit", "-m", "base"]);

  return cwd;
}

async function writeFile(cwd: string, filePath: string, contents: string) {
  const absolutePath = path.join(cwd, filePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, contents);
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((cwd) =>
      fs.rm(cwd, { recursive: true, force: true }),
    ),
  );
});

describe("getPullRequestSnapshotInfo", () => {
  it("builds a release plan from the target commit without checkout", async () => {
    const cwd = await createRepoFixture({
      ".changeset/config.json": JSON.stringify({}),
      "package.json": JSON.stringify({
        name: "repo",
        private: true,
        workspaces: ["packages/*"],
      }),
      "packages/pkg-a/package.json": JSON.stringify({
        name: "pkg-a",
        version: "1.0.0",
      }),
    });

    runGit(cwd, ["checkout", "-b", "feature"]);
    await writeFile(cwd, "packages/pkg-a/src/index.ts", "export const value = 1;\n");
    await writeFile(
      cwd,
      ".changeset/add-pkg-a.md",
      `---
"pkg-a": patch
---

Add pkg-a
`,
    );
    runGit(cwd, ["add", "."]);
    runGit(cwd, ["commit", "-m", "feature"]);

    const targetRef = runGit(cwd, ["rev-parse", "HEAD"]);
    const info = await getPullRequestSnapshotInfo({
      cwd,
      targetRef,
      sinceRef: "main",
    });

    expect(info.changedPackages.map((pkg) => pkg.packageJson.name)).toEqual([
      "pkg-a",
    ]);
    expect(info.releasePlan.changesets.map((changeset) => changeset.id)).toEqual([
      "add-pkg-a",
    ]);
    expect(
      info.releasePlan.releases.map((release) => ({
        name: release.name,
        type: release.type,
        newVersion: release.newVersion,
      })),
    ).toEqual([
      {
        name: "pkg-a",
        type: "patch",
        newVersion: "1.0.1",
      },
    ]);
  });

  it("discovers packages that only exist in the target commit", async () => {
    const cwd = await createRepoFixture({
      ".changeset/config.json": JSON.stringify({}),
      "package.json": JSON.stringify({
        name: "repo",
        private: true,
        workspaces: ["packages/*"],
      }),
      "packages/pkg-a/package.json": JSON.stringify({
        name: "pkg-a",
        version: "1.0.0",
      }),
    });

    runGit(cwd, ["checkout", "-b", "feature"]);
    await writeFile(
      cwd,
      "packages/pkg-b/package.json",
      JSON.stringify({
        name: "pkg-b",
        version: "1.0.0",
      }),
    );
    await writeFile(cwd, "packages/pkg-b/src/index.ts", "export const value = 2;\n");
    await writeFile(
      cwd,
      ".changeset/add-pkg-b.md",
      `---
"pkg-b": minor
---

Add pkg-b
`,
    );
    runGit(cwd, ["add", "."]);
    runGit(cwd, ["commit", "-m", "add package"]);

    const targetRef = runGit(cwd, ["rev-parse", "HEAD"]);
    const info = await getPullRequestSnapshotInfo({
      cwd,
      targetRef,
      sinceRef: "main",
    });

    expect(info.changedPackages.map((pkg) => pkg.packageJson.name)).toEqual([
      "pkg-b",
    ]);
    expect(
      info.releasePlan.releases.find((release) => release.name === "pkg-b"),
    ).toMatchObject({
      name: "pkg-b",
      type: "minor",
      newVersion: "1.1.0",
    });
  });
});
