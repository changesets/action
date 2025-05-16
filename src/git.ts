import * as core from "@actions/core";
import { exec, getExecOutput } from "@actions/exec";
import * as github from "@actions/github";
import { commitChangesFromRepo } from "@changesets/ghcommit/git";
import { Octokit } from "./octokit";

type GitOptions = {
  cwd: string;
};

const push = async (branch: string, options: GitOptions) => {
  await exec("git", ["push", "origin", `HEAD:${branch}`, "--force"], options);
};

const switchToMaybeExistingBranch = async (
  branch: string,
  options: GitOptions
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
    options
  );
  return !stdout.length;
};

export class Git {
  readonly octokit: Octokit | null;
  readonly cwd: string;

  constructor(args: { octokit?: Octokit; cwd: string }) {
    this.octokit = args.octokit ?? null;
    this.cwd = args.cwd;
  }

  async setupUser() {
    if (this.octokit) {
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
      }
    );
  }

  async pushTag(tag: string) {
    if (this.octokit) {
      return this.octokit.rest.git
        .createRef({
          ...github.context.repo,
          ref: `refs/tags/${tag}`,
          sha: github.context.sha,
        })
        .catch((err) => {
          // Assuming tag was manually pushed in custom publish script
          core.warning(`Failed to create tag ${tag}: ${err.message}`);
        });
    }
    await exec("git", ["push", "origin", tag], { cwd: this.cwd });
  }

  async prepareBranch(branch: string) {
    if (this.octokit) {
      // Preparing a new local branch is not necessary when using the API
      return;
    }
    await switchToMaybeExistingBranch(branch, { cwd: this.cwd });
    await reset(github.context.sha, { cwd: this.cwd });
  }

  async pushChanges({ branch, message }: { branch: string; message: string }) {
    if (this.octokit) {
      /**
       * Only add files form the current working directory
       *
       * This will emulate the behavior of `git add .`,
       * used in {@link commitAll}.
       */
      const addFromDirectory = this.cwd;
      return commitChangesFromRepo({
        octokit: this.octokit,
        ...github.context.repo,
        branch,
        message,
        base: {
          commit: github.context.sha,
        },
        cwd: this.cwd,
        force: true,
      });
    }
    if (!(await checkIfClean({ cwd: this.cwd }))) {
      await commitAll(message, { cwd: this.cwd });
    }
    await push(branch, { cwd: this.cwd });
  }
}
