import * as core from "@actions/core";
import { Git } from "../git.ts";
import { setupOctokit } from "../octokit.ts";
import { runVersion } from "../run.ts";

try {
  await main();
} catch (err) {
  core.setFailed((err as Error).message);
}

async function main() {
  const githubToken = core.getInput("github-token", { required: true });
  const script = core.getInput("script");
  const prTitle = core.getInput("pr-title", { required: true });
  const prCommit = core.getInput("pr-commit", { required: true });
  const prBranch = core.getInput("pr-branch");
  const prDraft = core.getInput("pr-draft") ?? undefined;
  const commitMode = core.getInput("commit-mode") || "git-cli";
  const setupGitUser = core.getBooleanInput("setup-git-user");

  // Validations
  if (prDraft !== undefined && prDraft !== "always" && prDraft !== "create") {
    throw new Error(`Invalid pr-draft input: ${prDraft}`);
  }

  // If the user needs to change the cwd, set `working-directory` in the step instead
  const cwd = process.cwd();

  const octokit = setupOctokit(githubToken);
  const git = new Git({
    octokit: commitMode === "github-api" ? octokit : undefined,
    cwd,
  });

  if (setupGitUser) {
    core.info("setting git user");
    await git.setupUser();
  }

  const { pullRequestNumber } = await runVersion({
    script,
    githubToken,
    git,
    octokit,
    cwd,
    prTitle,
    commitMessage: prCommit,
    // TODO: Use neutral message for PR description
    hasPublishScript: true,
    prDraft,
    branch: prBranch,
  });

  core.setOutput("pr-number", String(pullRequestNumber));
}
