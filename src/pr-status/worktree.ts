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

type TinyexecOptions = Parameters<typeof exec>[2];

function git(cwd: string, args: string[], opts: TinyexecOptions = {}) {
  return exec("git", args, {
    nodeOptions: { cwd, ...opts.nodeOptions },
    throwOnError: true,
    ...opts,
  });
}

interface Ref {
  fetchSource: string;
  local: string;
  remote: string;
}

function getRefs(context: PullRequestContext): Record<"base" | "head", Ref> {
  const suffix = `${context.number}-${randomUUID()}`;
  return {
    base: {
      fetchSource: "origin",
      local: `refs/changesets-action-pr-status/base/${suffix}`,
      remote: `refs/heads/${context.base.ref}`,
    },
    head: {
      fetchSource: context.head.repo.clone_url,
      local: `refs/changesets-action-pr-status/head/${suffix}`,
      remote: `refs/heads/${context.head.ref}`,
    },
  };
}

async function deepenRef(cwd: string, ref: Ref, deepenBy: number) {
  await git(cwd, [
    "fetch",
    "--no-tags",
    `--deepen=${deepenBy}`,
    ref.fetchSource,
    `${ref.remote}:${ref.local}`,
  ]);
}

async function ensureMergeBase(args: {
  cwd: string;
  refs: ReturnType<typeof getRefs>;
  deepenBy?: number;
}) {
  const { cwd, refs, deepenBy = 50 } = args;

  while (true) {
    const mergeBase = await git(cwd, ["merge-base", refs.base.local, "HEAD"], {
      throwOnError: false,
    });

    if (mergeBase.exitCode === 0) {
      return mergeBase.stdout.trim();
    }

    if (!(await isRepoShallow({ cwd }))) {
      throw new Error(
        `Failed to find merge base between "${refs.base.local}" and HEAD, and the repository is no longer shallow.`,
      );
    }

    await deepenRef(cwd, refs.base, deepenBy);
    await deepenRef(cwd, refs.head, deepenBy);
  }
}

async function mkdtemp(prefix: string) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));

  return {
    dir,
    async [Symbol.asyncDispose]() {
      await fs.rm(dir, { recursive: true, force: true });
    },
  };
}

async function tempRef(cwd: string, ref: Ref) {
  await git(cwd, [
    "fetch",
    "--no-tags",
    "--depth=1",
    ref.fetchSource,
    `${ref.remote}:${ref.local}`,
  ]);
  return {
    async [Symbol.asyncDispose]() {
      await git(cwd, ["update-ref", "-d", ref.local], { throwOnError: false });
    },
  };
}

async function tempWorktree(cwd: string, dir: string, ref: Ref) {
  await git(cwd, ["worktree", "add", "--detach", dir, ref.local]);

  return {
    async [Symbol.asyncDispose]() {
      await git(cwd, ["worktree", "remove", "--force", dir], {
        throwOnError: false,
      });
    },
  };
}

type WithAsyncDispose<T> = T & {
  [Symbol.asyncDispose](): Promise<void>;
};

function moveDisposable<T extends object>(
  stack: AsyncDisposableStack,
  value: T,
): WithAsyncDispose<T> {
  const moved = stack.move();
  return Object.assign(value, {
    async [Symbol.asyncDispose]() {
      await moved.disposeAsync();
    },
  });
}

export async function getPullRequestWorktree(
  context: PullRequestContext,
  cwd: string = process.cwd(),
): Promise<WithAsyncDispose<WorktreeInfo>> {
  await using stack = new AsyncDisposableStack();
  const worktreeDir = stack.use(
    await mkdtemp("changesets-action-pr-status-"),
  ).dir;

  const refs = getRefs(context);

  stack.use(await tempRef(cwd, refs.base));
  stack.use(await tempRef(cwd, refs.head));
  stack.use(await tempWorktree(cwd, worktreeDir, refs.head));

  await ensureMergeBase({
    cwd: worktreeDir,
    refs,
  });

  return moveDisposable(stack, {
    baseRef: refs.base.local,
    cwd: worktreeDir,
  });
}
