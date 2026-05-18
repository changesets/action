import * as core from "@actions/core";
import * as github from "@actions/github";
import { setupOctokit } from "../octokit.ts";
import { commentMarker } from "./constants.ts";
import { getCommentMessage } from "./message.ts";

type Octokit = ReturnType<typeof setupOctokit>;
type CreateCommentParams = NonNullable<
  Parameters<Octokit["rest"]["issues"]["createComment"]>[0]
>;
type UpdateCommentParams = NonNullable<
  Parameters<Octokit["rest"]["issues"]["updateComment"]>[0]
>;

(async () => {
  const context = github.context.payload.pull_request;
  if (!context) {
    core.error("This action should only be run on pull_request_target events");
    return;
  }

  // Construct the comment message first
  const commentBody = await getCommentMessage(context);
  const commentParam: CreateCommentParams | UpdateCommentParams = {
    repo: context.base.repo.name,
    owner: context.base.repo.owner,
    issue_number: context.number,
    body: commentBody,
  };
  core.setOutput("commentBody", commentBody);

  const githubToken = core.getInput("github-token", { required: true });
  const octokit = setupOctokit(githubToken);

  const existingCommentId = await octokit.rest.issues
    .listComments({
      repo: context.base.repo.name,
      owner: context.base.repo.owner,
      issue_number: context.number,
    })
    .then((res) => {
      const comment = res.data.find((c) => c.body?.includes(commentMarker));
      return comment?.id;
    });

  if (existingCommentId) {
    core.setOutput("commentId", existingCommentId.toString());
    await octokit.rest.issues.updateComment({
      ...commentParam,
      comment_id: existingCommentId,
    });
  } else {
    const result = await octokit.rest.issues.createComment(commentParam);
    core.setOutput("commentId", result.data.id.toString());
  }
})().catch((err) => {
  core.error(err);
  core.setFailed(err.message);
});
