import * as core from "@actions/core";
import { GitHub } from "../github.ts";
import { runVersion } from "../run.ts";
import { getOptionalInput, getRequiredInput } from "../utils.ts";

try {
  await main();
} catch (err) {
  core.setFailed((err as Error).message);
}

async function main() {
  const githubToken = getRequiredInput("github-token");
  const script = getOptionalInput("script");
  const commitMessage = getRequiredInput("commit-message");
  const prTitle = getRequiredInput("pr-title");
  const prDraft = getOptionalInput("pr-draft");
  const prBaseBranch = getOptionalInput("pr-base-branch");
  const commitMode = getOptionalInput("commit-mode") ?? "git-cli";
  const setupGitUser = core.getBooleanInput("setup-git-user");

  // Validations
  if (prDraft !== undefined && prDraft !== "always" && prDraft !== "create") {
    throw new Error(`Invalid pr-draft input: ${prDraft}`);
  }
  if (commitMode !== "git-cli" && commitMode !== "github-api") {
    throw new Error(`Invalid commit-mode input: ${commitMode}`);
  }

  // If the user needs to change the cwd, set `working-directory` in the step instead
  const cwd = process.cwd();

  const github = new GitHub({
    cwd,
    githubToken,
    commitMode,
  });

  if (setupGitUser) {
    core.info("setting git user");
    await github.setupUser();
  }

  const { pullRequestNumber } = await runVersion({
    script,
    github,
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
