import * as core from "@actions/core";
import { exec, getExecOutput } from "@actions/exec";
import * as github from "@actions/github";
import { commitChangesFromRepo } from "@changesets/ghcommit/git";
import { Octokit } from "./octokit";

const push = async (branch: string, { force }: { force?: boolean } = {}) => {
  await exec(
    "git",
    ["push", "origin", `HEAD:${branch}`, force && "--force"].filter<string>(
      Boolean as any
    )
  );
};

const switchToMaybeExistingBranch = async (branch: string) => {
  let { stderr } = await getExecOutput("git", ["checkout", branch], {
    ignoreReturnCode: true,
  });
  let isCreatingBranch = !stderr
    .toString()
    .includes(`Switched to a new branch '${branch}'`);
  if (isCreatingBranch) {
    await exec("git", ["checkout", "-b", branch]);
  }
};

const reset = async (
  pathSpec: string,
  mode: "hard" | "soft" | "mixed" = "hard"
) => {
  await exec("git", ["reset", `--${mode}`, pathSpec]);
};

const commitAll = async (message: string) => {
  await exec("git", ["add", "."]);
  await exec("git", ["commit", "-m", message]);
};

const checkIfClean = async (): Promise<boolean> => {
  const { stdout } = await getExecOutput("git", ["status", "--porcelain"]);
  return !stdout.length;
};

export class Git {
  octokit;
  constructor(octokit?: Octokit) {
    this.octokit = octokit;
  }

  async setupUser() {
    if (this.octokit) {
      return;
    }
    await exec("git", ["config", "user.name", `"github-actions[bot]"`]);
    await exec("git", [
      "config",
      "user.email",
      `"41898282+github-actions[bot]@users.noreply.github.com"`,
    ]);
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
    await exec("git", ["push", "origin", tag]);
  }

  async prepareBranch(branch: string) {
    if (this.octokit) {
      // Preparing a new local branch is not necessary when using the API
      return;
    }
    await switchToMaybeExistingBranch(branch);
    await reset(github.context.sha);
  }

  async pushChanges({ branch, message }: { branch: string; message: string }) {
    if (this.octokit) {
      /** 
       * Only add files form the current working directory
       * 
       * This will emulate the behavior of `git add .`,
       * used in {@link commitAll}.
       */
      const addFromDirectory = process.cwd();
      return commitChangesFromRepo({
        octokit: this.octokit,
        ...github.context.repo,
        branch,
        message,
        base: {
          commit: github.context.sha,
        },
        addFromDirectory,
        force: true,
      });
    }
    if (!(await checkIfClean())) {
      await commitAll(message);
    }
    await push(branch, { force: true });
  }
}
