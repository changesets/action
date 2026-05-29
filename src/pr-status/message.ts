import * as github from "@actions/github";
import getReleasePlan from "@changesets/get-release-plan";
import type {
  ComprehensiveRelease,
  ReleasePlan,
  VersionType,
} from "@changesets/types";
import { markdownTable } from "markdown-table";
import {
  getNewChangesetTemplateContent,
  getNewChangesetUrl,
} from "./template.ts";
import { getPullRequestWorktree } from "./worktree.ts";

type PullRequestContext = NonNullable<
  typeof github.context.payload.pull_request
>;

export async function getCommentMessage(context: PullRequestContext) {
  await using worktree = await getPullRequestWorktree(context);

  const releasePlan = await getReleasePlan(worktree.cwd, worktree.baseRef);
  const templateContent = await getNewChangesetTemplateContent(
    worktree.cwd,
    worktree.baseRef,
    context.title,
  );

  const newChangesetUrl = getNewChangesetUrl(
    context.head.repo.html_url,
    context.head.ref,
    templateContent,
  );

  if (releasePlan.changesets.length > 0) {
    return getApproveMessage(context.head.sha, newChangesetUrl, releasePlan);
  } else {
    return getAbsentMessage(context.head.sha, newChangesetUrl, releasePlan);
  }
}

function getApproveMessage(
  commitSha: string,
  newChangesetUrl: string,
  releasePlan: ReleasePlan,
) {
  return `\
### 🦋 Changeset detected

Latest commit: ${commitSha}

**The changes in this PR will be included in the next version bump.**

${getReleasePlanMessage(releasePlan)}

Not sure what this means? [Click here to learn what changesets are](https://github.com/changesets/changesets/blob/main/docs/adding-a-changeset.md).

[Click here if you're a maintainer who wants to add another changeset to this PR](${newChangesetUrl})`;
}

function getAbsentMessage(
  commitSha: string,
  newChangesetUrl: string,
  releasePlan: ReleasePlan,
) {
  return `\
### ⚠️ No Changeset found

Latest commit: ${commitSha}

Merging this PR will not cause a version bump for any packages. If these changes should not result in a new version, you're good to go. **If these changes should result in a version bump, you need to add a changeset.**

${getReleasePlanMessage(releasePlan)}

[Click here to learn what changesets are, and how to add one](https://github.com/changesets/changesets/blob/main/docs/adding-a-changeset.md).

[Click here if you're a maintainer who wants to add a changeset to this PR](${newChangesetUrl})`;
}

function getReleasePlanMessage(releasePlan: ReleasePlan) {
  const publishableReleases = releasePlan.releases.filter(
    (r) => r.type !== "none",
  ) as (ComprehensiveRelease & { type: Exclude<VersionType, "none"> })[];

  const table = markdownTable([
    ["Name", "Type"],
    ...publishableReleases.map((release) => {
      return [
        release.name,
        {
          major: "Major",
          minor: "Minor",
          patch: "Patch",
        }[release.type],
      ];
    }),
  ]);

  let summary = "This PR includes ";
  if (releasePlan.changesets.length === 0) {
    summary += "no changesets";
  } else {
    summary += `changesets to release ${publishableReleases.length} package`;
    if (publishableReleases.length !== 1) {
      summary += "s";
    }
  }

  return `\
<details>
<summary>${summary}</summary>

${
  publishableReleases.length > 0
    ? table
    : "When changesets are added to this PR, you'll see the packages that this PR includes changesets for and the associated semver types"
}

</details>`;
}
