import { Buffer } from "node:buffer";
import * as core from "@actions/core";
import { exec, getExecOutput } from "@actions/exec";
import { context } from "@actions/github";
import { commitChangesSinceBase } from "@changesets/ghcommit";
import { setupOctokit, type Octokit } from "./octokit.ts";

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

function getHttpUrl(remoteUrl: string): string | undefined {
  try {
    const url = new URL(remoteUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return;
    }

    // Git includes the username when deciding which URL-specific config is
    // most specific, so retain it. Password, query, and fragment do not
    // participate in matching; strip them before copying the URL into the env.
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.href;
  } catch {
    return;
  }
}

function isAlreadyExistingRefError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    "message" in error &&
    typeof error.status === "number" &&
    typeof error.message === "string" &&
    error.status === 422 &&
    error.message.includes("Reference already exists")
  );
}

export class GitHub {
  readonly #githubToken: string;
  readonly octokit: Octokit;
  readonly cwd: string;
  readonly pushWithGitCli: boolean;
  readonly serverUrl: string;

  constructor(options: {
    githubToken: string;
    cwd: string;
    pushWithGitCli?: boolean;
    serverUrl?: string;
  }) {
    this.#githubToken = options.githubToken;
    this.cwd = options.cwd;
    this.pushWithGitCli = options.pushWithGitCli ?? false;
    this.serverUrl = (
      options.serverUrl ??
      context.serverUrl ??
      process.env.GITHUB_SERVER_URL ??
      "https://github.com"
    ).replace(/\/+$/, "");
    this.octokit = setupOctokit(options.githubToken);
  }

  getToken() {
    return this.#githubToken;
  }

  async #getCliAuthEnv(): Promise<Record<string, string>> {
    // Make `github-token` authoritative for CLI pushes without changing the
    // repository config. Git may otherwise use checkout's persisted header or
    // credentials embedded in a remote URL, so we need to install command-scoped
    // `http.extraHeader` overrides for every push destination.
    //
    // Historical context: v1 put `github-token` in ~/.netrc, where checkout's
    // extraheader took precedence. This setup with reset + authHeader
    // deliberately makes `github-token` win for pushes.
    const basic = Buffer.from(`x-access-token:${this.#githubToken}`).toString(
      "base64",
    );

    // The environment may already contain command-scoped Git config. Append
    // our KEY_n/VALUE_n entries so those existing settings stay active.
    const gitConfigCount = Number(process.env.GIT_CONFIG_COUNT ?? 0);
    if (!Number.isInteger(gitConfigCount) || gitConfigCount < 0) {
      throw new Error(
        `Invalid GIT_CONFIG_COUNT value: ${process.env.GIT_CONFIG_COUNT}`,
      );
    }

    // `git push origin` prefers remote.origin.pushurl over the fetch URL and
    // supports more than one push URL, so inspect every effective destination.
    const { stdout } = await getExecOutput(
      "git",
      ["remote", "get-url", "--push", "--all", "origin"],
      {
        cwd: this.cwd,
        ignoreReturnCode: true,
        // A user-configured remote can contain credentials.
        silent: true,
      },
    );

    // Git reads `http.extraHeader` from the most specific matching URL section.
    // The host key replaces checkout's usual persisted header; an exact key for
    // each destination outranks path- or username-specific inherited config.
    // Git selects only one URL section, so these keys do not duplicate headers.
    const extraHeaderKeys = new Set([`http.${this.serverUrl}/.extraheader`]);
    for (const remoteUrl of stdout.split(/\r?\n/)) {
      const httpUrl = getHttpUrl(remoteUrl);
      if (httpUrl !== undefined) {
        extraHeaderKeys.add(`http.${httpUrl}.extraheader`);
      }
    }
    const authHeader = `AUTHORIZATION: basic ${basic}`;

    // Each URL key needs two new command-scoped config entries: one to reset
    // the inherited header list and one to install our Authorization header.
    const env: Record<string, string> = {
      GIT_CONFIG_COUNT: String(gitConfigCount + extraHeaderKeys.size * 2),
    };

    // `http.extraHeader` is multi-valued, so merely appending our header could
    // make Git send both tokens. An empty value resets inherited values; the
    // following value adds only ours.
    let index = 0;
    for (const extraHeaderKey of extraHeaderKeys) {
      const resetIndex = gitConfigCount + index * 2;
      const authIndex = resetIndex + 1;
      env[`GIT_CONFIG_KEY_${resetIndex}`] = extraHeaderKey;
      env[`GIT_CONFIG_VALUE_${resetIndex}`] = "";
      env[`GIT_CONFIG_KEY_${authIndex}`] = extraHeaderKey;
      env[`GIT_CONFIG_VALUE_${authIndex}`] = authHeader;
      index++;
    }

    return env;
  }

  async ensureGitUser() {
    // Check the exact identities that Git would use for commits without
    // allowing Git to fall back to auto-detected values like user@hostname.
    // This covers explicit GIT_AUTHOR_* / GIT_COMMITTER_* env vars, local
    // config, and global config. A partial identity, with only a name or only
    // an email, does not pass this check. If either identity is missing,
    // configure our default bot user as a fallback.
    const authorIdentity = await getExecOutput(
      "git",
      ["-c", "user.useConfigOnly=true", "var", "GIT_AUTHOR_IDENT"],
      {
        cwd: this.cwd,
        ignoreReturnCode: true,
        silent: true,
      },
    );
    const committerIdentity = await getExecOutput(
      "git",
      ["-c", "user.useConfigOnly=true", "var", "GIT_COMMITTER_IDENT"],
      {
        cwd: this.cwd,
        ignoreReturnCode: true,
        silent: true,
      },
    );
    if (authorIdentity.exitCode === 0 && committerIdentity.exitCode === 0) {
      return;
    }
    core.info("Setting Git user to github-actions[bot]");
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
    if (!this.pushWithGitCli) {
      try {
        const { data: tagObject } = await this.octokit.rest.git.createTag({
          ...context.repo,
          tag,
          message: tag,
          object: context.sha,
          type: "commit",
        });
        await this.octokit.rest.git.createRef({
          ...context.repo,
          ref: `refs/tags/${tag}`,
          sha: tagObject.sha,
        });
      } catch (err) {
        if (isAlreadyExistingRefError(err)) {
          // The tag was likely pushed by a custom publish script.
          core.info(`Tag ${tag} already exists`);
          return;
        }
        throw err;
      }
      return;
    }
    await exec("git", ["push", "origin", tag], {
      cwd: this.cwd,
      env: {
        ...process.env,
        ...(await this.#getCliAuthEnv()),
      } as Record<string, string>,
    });
  }

  async prepareBranch(branch: string) {
    if (!this.pushWithGitCli) {
      // Preparing a new local branch is not necessary when using the API
      return;
    }
    await switchToMaybeExistingBranch(branch, { cwd: this.cwd });
    await reset(context.sha, { cwd: this.cwd });
  }

  async pushChanges({ branch, message }: { branch: string; message: string }) {
    if (!this.pushWithGitCli) {
      await commitChangesSinceBase({
        octokit: this.octokit,
        ...context.repo,
        branch,
        message,
        base: {
          commit: context.sha,
        },
        force: true,
        cwd: this.cwd,
      });
      return;
    }
    if (!(await checkIfClean({ cwd: this.cwd }))) {
      await this.ensureGitUser();
      await commitAll(message, { cwd: this.cwd });
    }
    await push(branch, {
      cwd: this.cwd,
      env: {
        ...process.env,
        ...(await this.#getCliAuthEnv()),
      } as Record<string, string>,
    });
  }
}
