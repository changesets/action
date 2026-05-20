import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getExecOutput } from "@actions/exec";
import { isRepoShallow } from "@changesets/git";
import type * as github from "@actions/github";

type PullRequestContext = NonNullable<
  typeof github.context.payload.pull_request
>;

type WorktreeInfo = {
  baseRef: string;
  cwd: string;
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

function getRefNames(context: PullRequestContext) {
  const suffix = `${context.number}-${randomUUID()}`;
  return {
    baseRef: `refs/changesets-action/base/${suffix}`,
    headRef: `refs/changesets-action/head/${suffix}`,
  };
}

async function deleteRef(cwd: string, ref: string) {
  await git(cwd, ["update-ref", "-d", ref], { ignoreReturnCode: true });
}

async function ensureMergeBase(args: {
  cwd: string;
  baseRef: string;
  baseRemoteRef: string;
  headRemoteUrl: string;
  headRemoteRef: string;
  headRef: string;
  deepenBy?: number;
}) {
  const {
    cwd,
    baseRef,
    baseRemoteRef,
    headRemoteUrl,
    headRemoteRef,
    headRef,
    deepenBy = 50,
  } = args;

  while (true) {
    const mergeBase = await git(
      cwd,
      ["merge-base", baseRef, "HEAD"],
      { ignoreReturnCode: true },
    );

    if (mergeBase.exitCode === 0) {
      return mergeBase.stdout.trim();
    }

    if (!(await isRepoShallow({ cwd }))) {
      throw new Error(
        `Failed to find merge base between "${baseRef}" and HEAD, and the repository is no longer shallow.`,
      );
    }

    await git(cwd, [
      "fetch",
      "--no-tags",
      `--deepen=${deepenBy}`,
      "origin",
      `${baseRemoteRef}:${baseRef}`,
    ]);
    await git(cwd, [
      "fetch",
      "--no-tags",
      `--deepen=${deepenBy}`,
      headRemoteUrl,
      `${headRemoteRef}:${headRef}`,
    ]);
  }
}

export async function withPullRequestWorktree<T>(
  context: PullRequestContext,
  fn: (worktree: WorktreeInfo) => Promise<T>,
  repoCwd: string = process.cwd(),
) {
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "changesets-action-pr-status-"),
  );
  const worktreeDir = path.join(tempDir, "repo");
  const refs = getRefNames(context);
  const baseRemoteRef = `refs/heads/${context.base.ref}`;
  const headRemoteRef = `refs/heads/${context.head.ref}`;

  try {
    await git(repoCwd, [
      "fetch",
      "--no-tags",
      "--depth=1",
      "origin",
      `${baseRemoteRef}:${refs.baseRef}`,
    ]);
    await git(repoCwd, [
      "fetch",
      "--no-tags",
      "--depth=1",
      context.head.repo.clone_url,
      `${headRemoteRef}:${refs.headRef}`,
    ]);
    await git(repoCwd, ["worktree", "add", "--detach", worktreeDir, refs.headRef]);
    await ensureMergeBase({
      cwd: worktreeDir,
      baseRef: refs.baseRef,
      baseRemoteRef,
      headRemoteUrl: context.head.repo.clone_url,
      headRemoteRef,
      headRef: refs.headRef,
    });

    return await fn({
      baseRef: refs.baseRef,
      cwd: worktreeDir,
    });
  } finally {
    await git(repoCwd, ["worktree", "remove", "--force", worktreeDir], {
      ignoreReturnCode: true,
    });
    await Promise.all([deleteRef(repoCwd, refs.baseRef), deleteRef(repoCwd, refs.headRef)]);
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}
