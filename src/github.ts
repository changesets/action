import { Buffer } from "node:buffer";
import * as core from "@actions/core";
import { exec, getExecOutput } from "@actions/exec";
import { context } from "@actions/github";
import { commitChangesSinceBase } from "@changesets/ghcommit";
import { setupOctokit, type Octokit } from "./octokit.ts";

export type CommitMode = "git-cli" | "github-api";

type GitOptions = {
  cwd: string;
  env?: Record<string, string>;
};

const push = async (branch: string, options: GitOptions) => {
  await exec("git", ["push", "origin", `HEAD:${branch}`, "--force"], options);
};

const switchToMaybeExistingBranch = async (
  branch: string,
  options: GitOptions,
) => {
  let { stderr } = await getExecOutput("git", ["checkout", branch], {
    ignoreReturnCode: true,
    ...options,
  });
  let isCreatingBranch = !stderr
    .toString()
    .includes(`Switched to a new branch '${branch}'`);
  if (isCreatingBranch) {
    await exec("git", ["checkout", "-b", branch], options);
  }
};

const reset = async (pathSpec: string, options: GitOptions) => {
  await exec("git", ["reset", `--hard`, pathSpec], options);
};

const commitAll = async (message: string, options: GitOptions) => {
  await exec("git", ["add", "."], options);
  await exec("git", ["commit", "-m", message], options);
};

const checkIfClean = async (options: GitOptions): Promise<boolean> => {
  const { stdout } = await getExecOutput(
    "git",
    ["status", "--porcelain"],
    options,
  );
  return !stdout.length;
};

export class GitHub {
  readonly #githubToken: string;
  readonly octokit: Octokit;
  readonly cwd: string;
  readonly commitMode: CommitMode;

  constructor(options: {
    githubToken: string;
    cwd: string;
    commitMode?: CommitMode;
  }) {
    this.#githubToken = options.githubToken;
    this.cwd = options.cwd;
    this.commitMode = options.commitMode ?? "git-cli";
    this.octokit = setupOctokit(options.githubToken);
  }

  getToken() {
    return this.#githubToken;
  }

  #getCliAuthEnv(): Record<string, string> {
    const basic = Buffer.from(`x-access-token:${this.#githubToken}`).toString(
      "base64",
    );
    const serverUrl = (
      context.serverUrl ??
      process.env.GITHUB_SERVER_URL ??
      "https://github.com"
    ).replace(/\/+$/, "");
    const gitConfigCount = Number(process.env.GIT_CONFIG_COUNT ?? 0);
    if (!Number.isInteger(gitConfigCount) || gitConfigCount < 0) {
      throw new Error(
        `Invalid GIT_CONFIG_COUNT value: ${process.env.GIT_CONFIG_COUNT}`,
      );
    }
    return {
      GIT_CONFIG_COUNT: String(gitConfigCount + 1),
      [`GIT_CONFIG_KEY_${gitConfigCount}`]: `http.${serverUrl}/.extraheader`,
      [`GIT_CONFIG_VALUE_${gitConfigCount}`]: `AUTHORIZATION: basic ${basic}`,
    };
  }

  async setupUser() {
    if (this.commitMode === "github-api") {
      return;
    }
    // Check the exact identities that Git would use for commits without
    // allowing Git to fall back to auto-detected values like user@hostname.
    // This covers explicit GIT_AUTHOR_* / GIT_COMMITTER_* env vars, local
    // config, and global config. A partial identity, with only a name or only
    // an email, does not pass this check. If either identity is missing, set
    // our default bot user so CLI commits don't fail or use host-derived data.
    const authorIdentity = await getExecOutput(
      "git",
      ["-c", "user.useConfigOnly=true", "var", "GIT_AUTHOR_IDENT"],
      {
        cwd: this.cwd,
        ignoreReturnCode: true,
      },
    );
    const committerIdentity = await getExecOutput(
      "git",
      ["-c", "user.useConfigOnly=true", "var", "GIT_COMMITTER_IDENT"],
      {
        cwd: this.cwd,
        ignoreReturnCode: true,
      },
    );
    if (authorIdentity.exitCode === 0 && committerIdentity.exitCode === 0) {
      return;
    }
    await exec("git", ["config", "user.name", `"github-actions[bot]"`], {
      cwd: this.cwd,
    });
    await exec(
      "git",
      [
        "config",
        "user.email",
        `"41898282+github-actions[bot]@users.noreply.github.com"`,
      ],
      {
        cwd: this.cwd,
      },
    );
  }

  async pushTag(tag: string) {
    if (this.commitMode === "github-api") {
      return this.octokit.rest.git
        .createRef({
          ...context.repo,
          ref: `refs/tags/${tag}`,
          sha: context.sha,
        })
        .catch((err) => {
          // Assuming tag was manually pushed in custom publish script
          core.warning(`Failed to create tag ${tag}: ${err.message}`);
        });
    }
    await exec("git", ["push", "origin", tag], {
      cwd: this.cwd,
      env: {
        ...process.env,
        ...this.#getCliAuthEnv(),
      } as Record<string, string>,
    });
  }

  async prepareBranch(branch: string) {
    if (this.commitMode === "github-api") {
      // Preparing a new local branch is not necessary when using the API
      return;
    }
    await switchToMaybeExistingBranch(branch, { cwd: this.cwd });
    await reset(context.sha, { cwd: this.cwd });
  }

  async pushChanges({ branch, message }: { branch: string; message: string }) {
    if (this.commitMode === "github-api") {
      await commitChangesSinceBase({
        octokit: this.octokit,
        ...context.repo,
        branch,
        message,
        base: {
          commit: context.sha,
        },
        cwd: this.cwd,
      });
      return;
    }
    if (!(await checkIfClean({ cwd: this.cwd }))) {
      await commitAll(message, { cwd: this.cwd });
    }
    await push(branch, {
      cwd: this.cwd,
      env: {
        ...process.env,
        ...this.#getCliAuthEnv(),
      } as Record<string, string>,
    });
  }
}
