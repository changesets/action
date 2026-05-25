import { pathToFileURL } from "node:url";
import getReleasePlan from "@changesets/get-release-plan";
import { createFixture } from "fs-fixture";
import { exec } from "tinyexec";
import { describe, expect, it } from "vitest";
import { withPullRequestWorktree } from "./worktree.ts";

async function git(cwd: string, args: string[]) {
  const output = await exec("git", args, { nodeOptions: { cwd } });
  return output.stdout.trim();
}

describe("withPullRequestWorktree", () => {
  it("fetches a PR branch into a detached worktree and keeps the main checkout untouched", async () => {
    // Local source repo
    await using sourceRepoFixture = await createFixture({
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
    const sourceRepo = sourceRepoFixture.path;
    await git(sourceRepo, ["init", "-b", "main"]);
    await git(sourceRepo, ["add", "."]);
    await git(sourceRepo, ["commit", "-m", "base"]);

    // Simulate remote bare git server
    await using originBareFixture = await createFixture();
    const originBare = originBareFixture.path;
    await git(originBare, ["clone", "--bare", sourceRepo, originBare]);

    // Simulate checkout PR in github action
    await using checkoutRepoFixture = await createFixture();
    const checkoutRepo = checkoutRepoFixture.path;
    await git(checkoutRepo, [
      "clone",
      "--depth",
      "1",
      "--branch",
      "main",
      pathToFileURL(originBare).toString(),
      checkoutRepo,
    ]);

    // Simulate remote fork bare git server
    await using forkBareFixture = await createFixture();
    const forkBare = forkBareFixture.path;
    await git(forkBare, ["clone", "--bare", originBare, forkBare]);

    await using forkRepoFixture = await createFixture();
    const forkRepo = forkRepoFixture.path;
    await git(forkRepo, [
      "clone",
      "--depth",
      "1",
      "--branch",
      "main",
      pathToFileURL(forkBare).toString(),
      forkRepo,
    ]);
    await git(forkRepo, ["config", "user.name", "Test User"]);
    await git(forkRepo, ["config", "user.email", "test@example.com"]);
    await git(forkRepo, ["checkout", "-b", "feature"]);

    await forkRepoFixture.mkdir("packages/pkg-a/src");
    await forkRepoFixture.writeFile(
      "packages/pkg-a/src/index.ts",
      "export const value = 1;\n",
    );
    await forkRepoFixture.writeFile(
      ".changeset/add-pkg-a.md",
      `\
---
"pkg-a": patch
---

Add pkg-a
`,
    );

    await git(forkRepo, ["add", "."]);
    await git(forkRepo, ["commit", "-m", "feature"]);
    await git(forkRepo, ["push", "origin", "feature"]);

    // Run tests
    const originalHead = await git(checkoutRepo, ["rev-parse", "HEAD"]);
    const context = {
      number: 123,
      base: {
        ref: "main",
      },
      head: {
        ref: "feature",
        repo: {
          clone_url: pathToFileURL(forkBare).toString(),
        },
      },
    } as any;

    const result = await withPullRequestWorktree(
      context,
      async ({ cwd, baseRef }) => {
        const releasePlan = await getReleasePlan(cwd, baseRef);
        return {
          currentHead: await git(cwd, ["rev-parse", "HEAD"]),
          currentBranch: await git(cwd, ["branch", "--show-current"]),
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
    expect(await git(checkoutRepo, ["rev-parse", "HEAD"])).toBe(originalHead);
    expect(await git(checkoutRepo, ["branch", "--show-current"])).toBe("main");
  });
});
