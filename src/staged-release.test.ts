import * as path from "node:path";
import { getExecOutput } from "@actions/exec";
import type { Package } from "@manypkg/get-packages";
import { createFixture } from "fs-fixture";
import { describe, expect, it, vi } from "vitest";
import type { GitHub } from "./github.ts";
import {
  createStagedReleaseHandoff,
  finalizeStagedRelease,
  formatStageCommand,
  validateStagedReleaseHandoff,
  verifyPublished,
  type StagedReleaseEntry,
} from "./staged-release.ts";

vi.mock("@actions/github", () => ({
  context: {
    repo: { owner: "changesets", repo: "action" },
    runId: 123,
    sha: "abc123",
  },
}));
vi.mock("@actions/exec", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@actions/exec")>()),
  getExecOutput: vi.fn(),
}));

const entry: StagedReleaseEntry = {
  packageName: "pkg-a",
  version: "1.0.0",
  tag: "latest",
  gitTag: "pkg-a@1.0.0",
  stageId: "1de6f3db-2ed9-4d72-b3dd-8f0e2b474a2f",
};

async function createProject() {
  return createFixture({
    "package.json": JSON.stringify({
      name: "repo",
      private: true,
      workspaces: ["packages/*"],
    }),
    "package-lock.json": "",
    "packages/pkg-a/package.json": JSON.stringify({
      name: "pkg-a",
      version: "1.0.0",
    }),
    "packages/pkg-b/package.json": JSON.stringify({
      name: "pkg-b",
      version: "1.0.0",
    }),
  });
}

describe("staged release handoff", () => {
  it("prints stage ids in their topological event order", () => {
    expect(
      formatStageCommand(
        [
          { type: "npm-stage", ...entry, stageId: "stage-b" },
          { type: "npm-stage", ...entry, stageId: "stage-a" },
        ],
        "approve",
      ),
    ).toBe("changeset stage approve stage-b stage-a");
  });

  it("prints rejection recovery for a partial publish failure", () => {
    expect(
      formatStageCommand(
        [{ type: "npm-stage", ...entry, stageId: "stage-a" }],
        "reject",
      ),
    ).toBe("changeset stage reject stage-a");
  });

  it("validates origin, manifests, tags, and preserves order", async () => {
    await using fixture = await createProject();
    const handoff = createStagedReleaseHandoff(
      [
        { type: "npm-stage", ...entry },
        {
          type: "npm-stage",
          ...entry,
          packageName: "pkg-b",
          gitTag: "pkg-b@1.0.0",
          stageId: "2de6f3db-2ed9-4d72-b3dd-8f0e2b474a2f",
        },
      ],
      { repository: "changesets/action", runId: 123, sha: "abc123" },
    );
    const result = await validateStagedReleaseHandoff(handoff, fixture.path, {
      repository: "changesets/action",
      runId: 123,
      sha: "abc123",
    });
    expect(result.handoff.releases.map((release) => release.stageId)).toEqual([
      "1de6f3db-2ed9-4d72-b3dd-8f0e2b474a2f",
      "2de6f3db-2ed9-4d72-b3dd-8f0e2b474a2f",
    ]);
  });

  it("rejects a handoff from another workflow run", async () => {
    await using fixture = await createProject();
    const handoff = createStagedReleaseHandoff(
      [{ type: "npm-stage", ...entry }],
      { repository: "changesets/action", runId: 122, sha: "abc123" },
    );

    await expect(
      validateStagedReleaseHandoff(handoff, fixture.path, {
        repository: "changesets/action",
        runId: 123,
        sha: "abc123",
      }),
    ).rejects.toThrow("do not match this workflow run");
  });

  it("verifies an exact version through the configured package manager", async () => {
    await using fixture = await createProject();
    vi.mocked(getExecOutput).mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify("1.0.0"),
      stderr: "",
    } as never);

    await verifyPublished([entry], fixture.path, { timeoutMs: 0 });

    expect(getExecOutput).toHaveBeenCalledWith(
      "npm",
      ["view", "pkg-a@1.0.0", "version", "--json"],
      expect.objectContaining({ cwd: fixture.path }),
    );
  });

  it("accepts existing correct tags and releases without writes", async () => {
    const getRef = vi.fn().mockResolvedValue({
      data: { object: { sha: "abc123" } },
    });
    const createRef = vi.fn();
    const getReleaseByTag = vi.fn().mockResolvedValue({ data: { id: 1 } });
    const createRelease = vi.fn();
    const github = {
      octokit: {
        rest: {
          git: { getRef, createRef },
          repos: { getReleaseByTag, createRelease },
        },
      },
    } as unknown as GitHub;
    const pkg = {
      dir: path.join("/repo", "packages/pkg-a"),
      relativeDir: "packages/pkg-a",
      packageJson: { name: "pkg-a", version: "1.0.0" },
    } satisfies Package;

    await finalizeStagedRelease({
      github,
      handoff: {
        version: 1,
        repository: "changesets/action",
        runId: 123,
        sha: "abc123",
        releases: [entry],
      },
      packagesByName: new Map([["pkg-a", pkg]]),
      cwd: "/repo",
      verify: false,
    });

    expect(createRef).not.toHaveBeenCalled();
    expect(createRelease).not.toHaveBeenCalled();
  });

  it("rejects an existing tag at another commit", async () => {
    const github = {
      octokit: {
        rest: {
          git: {
            getRef: vi.fn().mockResolvedValue({
              data: { object: { sha: "wrong" } },
            }),
            createRef: vi.fn(),
          },
          repos: {
            getReleaseByTag: vi.fn(),
            createRelease: vi.fn(),
          },
        },
      },
    } as unknown as GitHub;

    await expect(
      finalizeStagedRelease({
        github,
        handoff: {
          version: 1,
          repository: "changesets/action",
          runId: 123,
          sha: "abc123",
          releases: [entry],
        },
        packagesByName: new Map([
          [
            "pkg-a",
            {
              dir: "/repo/pkg-a",
              relativeDir: "pkg-a",
              packageJson: { name: "pkg-a", version: "1.0.0" },
            } satisfies Package,
          ],
        ]),
        cwd: "/repo",
        verify: false,
      }),
    ).rejects.toThrow("expected abc123");
  });
});
