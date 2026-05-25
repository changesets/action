import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type * as github from "@actions/github";
import { isRepoShallow } from "@changesets/git";
import { exec } from "tinyexec";

type PullRequestContext = NonNullable<
  typeof github.context.payload.pull_request
>;

type WorktreeInfo = {
  baseRef: string;
  cwd: string;
};

function getRefNames(context: PullRequestContext) {
  const suffix = `${context.number}-${randomUUID()}`;
  return {
    baseLocalRef: `refs/changesets-action-pr-status-comment/base/${suffix}`,
    baseRemoteRef: `refs/heads/${context.base.ref}`,
    headLocalRef: `refs/changesets-action-pr-status-comment/head/${suffix}`,
    headRemoteRef: `refs/heads/${context.head.ref}`,
  };
}

async function deleteRef(cwd: string, ref: string) {
  await exec("git", ["update-ref", "-d", ref], { nodeOptions: { cwd } });
}

async function ensureMergeBase(args: {
  cwd: string;
  refs: ReturnType<typeof getRefNames>;
  headRemoteUrl: string;
  deepenBy?: number;
}) {
  const { cwd, refs, headRemoteUrl, deepenBy = 50 } = args;

  while (true) {
    const mergeBase = await exec(
      "git",
      ["merge-base", refs.baseLocalRef, "HEAD"],
      { nodeOptions: { cwd } },
    );

    if (mergeBase.exitCode === 0) {
      return mergeBase.stdout.trim();
    }

    if (!(await isRepoShallow({ cwd }))) {
      throw new Error(
        `Failed to find merge base between "${refs.baseLocalRef}" and HEAD, and the repository is no longer shallow.`,
      );
    }

    await exec(
      "git",
      [
        "fetch",
        "--no-tags",
        `--deepen=${deepenBy}`,
        "origin",
        `${refs.baseRemoteRef}:${refs.baseLocalRef}`,
      ],
      { nodeOptions: { cwd } },
    );
    await exec(
      "git",
      [
        "fetch",
        "--no-tags",
        `--deepen=${deepenBy}`,
        headRemoteUrl,
        `${refs.headRemoteRef}:${refs.headLocalRef}`,
      ],
      { nodeOptions: { cwd } },
    );
  }
}

export async function withPullRequestWorktree<T>(
  context: PullRequestContext,
  fn: (worktree: WorktreeInfo) => Promise<T>,
  repoCwd: string = process.cwd(),
) {
  const worktreeDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "changesets-action-pr-status-comment-"),
  );
  const refs = getRefNames(context);

  try {
    await exec(
      "git",
      [
        "fetch",
        "--no-tags",
        "--depth=1",
        "origin",
        `${refs.baseRemoteRef}:${refs.baseLocalRef}`,
      ],
      { nodeOptions: { cwd: repoCwd } },
    );
    await exec(
      "git",
      [
        "fetch",
        "--no-tags",
        "--depth=1",
        context.head.repo.clone_url,
        `${refs.headRemoteRef}:${refs.headLocalRef}`,
      ],
      { nodeOptions: { cwd: repoCwd } },
    );
    await exec(
      "git",
      ["worktree", "add", "--detach", worktreeDir, refs.headLocalRef],
      { nodeOptions: { cwd: repoCwd } },
    );
    await ensureMergeBase({
      cwd: worktreeDir,
      refs,
      headRemoteUrl: context.head.repo.clone_url,
    });

    return await fn({
      baseRef: refs.baseLocalRef,
      cwd: worktreeDir,
    });
  } finally {
    await exec("git", ["worktree", "remove", "--force", worktreeDir], {
      nodeOptions: { cwd: repoCwd },
    });
    await Promise.all([
      deleteRef(repoCwd, refs.baseLocalRef),
      deleteRef(repoCwd, refs.headLocalRef),
    ]);
    await fs.rm(worktreeDir, { recursive: true, force: true });
  }
}
