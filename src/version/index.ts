import * as core from "@actions/core";
import { Git } from "../git.ts";
import { setupOctokit } from "../octokit.ts";
import { runVersion } from "../run.ts";
import { getOptionalInput } from "../utils.ts";

try {
  await main();
} catch (err) {
  core.setFailed((err as Error).message);
}

async function main() {
  const githubToken = core.getInput("github-token", { required: true });
  const script = getOptionalInput("script");
  const commitMessage = core.getInput("commit-message", { required: true });
  const prTitle = core.getInput("pr-title", { required: true });
  const prDraft = getOptionalInput("pr-draft");
  const prBaseBranch = getOptionalInput("pr-base-branch");
  const commitMode = getOptionalInput("commit-mode") ?? "git-cli";
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
    commitMessage,
    // TODO: Use neutral message for PR description
    hasPublishScript: true,
    prDraft,
    branch: prBaseBranch,
  });

  core.setOutput("pr-number", String(pullRequestNumber));
}
