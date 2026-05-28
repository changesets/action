import * as core from "@actions/core";
import * as github from "@actions/github";
import { getCommentMessage } from "./message.ts";

(async () => {
  const context = github.context.payload.pull_request;
  if (!context) {
    core.error(
      "This action should only be run on `pull_request_target` or `pull_request` events",
    );
    return;
  }

  core.info("Creating comment message...");
  const commentBody = await getCommentMessage(context);
  core.setOutput("comment-body", commentBody);
  core.info("Done!");
})().catch((err) => {
  core.error(err);
  core.setFailed(err.message);
});
