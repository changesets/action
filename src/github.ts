import * as github from "@actions/github";

import { PublishedPackage, PublishResult } from "./run";

const SNAPSHOT_COMMENT_IDENTIFIER = `<!-- changesetsSnapshotPrCommentKey -->`;

function formatTable(packages: PublishedPackage[]): string {
  const header = `| Package | Version | Info |\n|------|---------|----|`;

  return `${header}\n${packages
    .map(
      (t) =>
        `| \`${t.name}\` | \`${t.version}\` | [npm ↗︎](https://www.npmjs.com/package/${t.name}/v/${t.version}) [unpkg ↗︎](https://unpkg.com/browse/${t.name}@${t.version}/) |`
    )
    .join("\n")}`;
}

export async function upsertComment(options: {
  tagName: string;
  token: string;
  publishResult: PublishResult;
}) {
  const octokit = github.getOctokit(options.token);
  const issueContext = github.context.issue;

  if (!issueContext?.number) {
    console.log(
      `Failed to locate a PR associated with the Action context, skipping Snapshot info comment...`
    );
  }

  let commentBody =
    options.publishResult.published === true
      ? `### 🚀 Snapshot Release (\`${
          options.tagName
        }\`)\n\nThe latest changes of this PR are available as \`${
          options.tagName
        }\` on npm (based on the declared \`changesets\`):\n${formatTable(
          options.publishResult.publishedPackages
        )}`
      : `The latest changes of this PR are not available as \`${options.tagName}\`, since there are no linked \`changesets\` for this PR.`;

  commentBody = `${SNAPSHOT_COMMENT_IDENTIFIER}\n${commentBody}`;

  const existingComments = await octokit.rest.issues.listComments({
    ...github.context.repo,
    issue_number: issueContext.number,
    per_page: 100,
  });

  const existingComment = existingComments.data.find((v) =>
    v.body?.startsWith(SNAPSHOT_COMMENT_IDENTIFIER)
  );

  if (existingComment) {
    console.info(
      `Found an existing comment, doing a comment update...`,
      existingComment
    );

    const response = await octokit.rest.issues.updateComment({
      ...github.context.repo,
      body: commentBody,
      comment_id: existingComment.id,
    });

    console.log(`GitHub API response:`, response.status);
  } else {
    console.info(`Did not found an existing comment, creating comment..`);

    const response = await octokit.rest.issues.createComment({
      ...github.context.repo,
      body: commentBody,
      issue_number: issueContext.number,
    });

    console.log(`GitHub API response:`, response.status);
  }
}
