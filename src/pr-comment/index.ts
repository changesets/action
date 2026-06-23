import * as core from "@actions/core";
import * as github from "@actions/github";
import { getOptionalInput } from "../utils.ts";

type Octokit = ReturnType<typeof github.getOctokit>;
type CreateCommentParams = NonNullable<
  Parameters<Octokit["rest"]["issues"]["createComment"]>[0]
>;
type UpdateCommentParams = NonNullable<
  Parameters<Octokit["rest"]["issues"]["updateComment"]>[0]
>;

try {
  await main();
} catch (err) {
  core.setFailed((err as Error).message);
}

async function main() {
  const context = github.context.payload.pull_request;
  if (!context) {
    throw new Error(
      "This action should only be run on `pull_request_target` or `pull_request` events",
    );
  }

  const githubToken = core.getInput("github-token", { required: true });
  const body = core.getInput("body", { required: true });
  const updateId = getOptionalInput("update-id");

  const commentMarker = updateId ? getCommentMarker(updateId) : null;
  const commentBody = commentMarker ? `${commentMarker}\n\n${body}` : body;
  const commentParam: CreateCommentParams | UpdateCommentParams = {
    repo: context.base.repo.name,
    owner: context.base.repo.owner.login,
    issue_number: context.number,
    body: commentBody,
  };

  const octokit = github.getOctokit(githubToken);

  let existingCommentId: number | undefined;
  if (commentMarker) {
    core.info("Checking for existing comment...");
    existingCommentId = await octokit.rest.issues
      .listComments({
        repo: context.base.repo.name,
        owner: context.base.repo.owner.login,
        issue_number: context.number,
      })
      .then((res) => {
        const comment = res.data.find((c) => c.body?.includes(commentMarker));
        return comment?.id;
      });
  }

  if (existingCommentId) {
    core.info(`Updating existing comment (id: ${existingCommentId})...`);
    await octokit.rest.issues.updateComment({
      ...commentParam,
      comment_id: existingCommentId,
    });
    core.setOutput("comment-id", existingCommentId);
  } else {
    core.info("Creating new comment...");
    const result = await octokit.rest.issues.createComment(commentParam);
    core.setOutput("comment-id", result.data.id);
  }

  core.info("Done!");
}

function getCommentMarker(updateId: string) {
  const prefix = "changesets-action-pr-comment";
  return prefix === updateId
    ? `<!-- ${prefix} -->`
    : `<!-- ${prefix}:${updateId} -->`;
}
