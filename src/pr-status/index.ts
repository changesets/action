import * as core from "@actions/core";
import * as github from "@actions/github";
import { getCommentMessage } from "./message.ts";

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

  core.info("Creating comment message...");
  const commentBody = await getCommentMessage(context);
  core.setOutput("comment-body", commentBody);
  core.info("Done!");
}
