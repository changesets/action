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

  async #getCliAuthEnv(): Promise<Record<string, string>> {
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
    // `git push origin` may use remote.origin.pushurl instead of the fetch URL,
    // and Git supports multiple push URLs. Ask Git for the effective targets so
    // the URL-specific auth below applies to every HTTP destination.
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

    // Git chooses HTTP config by URL specificity. The host key handles the
    // extraheader normally installed by actions/checkout, while an exact push
    // URL also outranks any inherited path-specific extraheader. Only the most
    // specific matching subsection contributes, so these do not duplicate it.
    const extraHeaderKeys = new Set([`http.${serverUrl}/.extraheader`]);
    for (const remoteUrl of stdout.split(/\r?\n/)) {
      const httpUrl = getHttpUrl(remoteUrl);
      if (httpUrl !== undefined) {
        extraHeaderKeys.add(`http.${httpUrl}.extraheader`);
      }
    }
    const authHeader = `AUTHORIZATION: basic ${basic}`;
    const env: Record<string, string> = {
      GIT_CONFIG_COUNT: String(gitConfigCount + extraHeaderKeys.size * 2),
    };

    // GIT_CONFIG_COUNT/KEY_n/VALUE_n add command-scoped config. Preserve any
    // existing entries and append ours. `http.extraHeader` is multi-valued, so
    // merely adding our Authorization header would make Git send both tokens.
    // An empty value resets the list; the following value adds only our token.
    //
    // In v1, `github-token` lived in ~/.netrc. When checkout had already
    // supplied Authorization through an extraheader, that header took
    // precedence and ~/.netrc was effectively a fallback. These entries
    // intentionally make `github-token` win for pushes.
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

  async setupUser() {
    if (this.commitMode === "github-api") {
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
        ...(await this.#getCliAuthEnv()),
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
        ...(await this.#getCliAuthEnv()),
      } as Record<string, string>,
    });
  }
}
