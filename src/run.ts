import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as core from "@actions/core";
import {
  exec,
  getExecOutput,
  type ExecOptions,
  type ExecOutput,
} from "@actions/exec";
import { context } from "@actions/github";
import { type Package, getPackages } from "@manypkg/get-packages";
import type { GitHub } from "./github.ts";
import type { Octokit } from "./octokit.ts";
import readChangesetState from "./readChangesetState.ts";
import type {
  GetVersionPrBodyProps,
  RunVersionProps,
  RunVersionResult,
} from "./run.types.ts";
import {
  execChangesetsCli,
  getChangedPackages,
  getChangelogEntry,
  getExecOutputChangesetsCli,
  getVersionsByDirectory,
  isErrorWithCode,
  sortTheThings,
  isObject,
  isString,
} from "./utils.ts";

// GitHub Issues/PRs messages have a max size limit on the
// message body payload.
// `body is too long (maximum is 65536 characters)`.
// To avoid that, we ensure to cap the message to 60k chars.
const MAX_CHARACTERS_PER_MESSAGE = 60000;

const createRelease = async (
  octokit: Octokit,
  { pkg, tagName }: { pkg: Package; tagName: string },
) => {
  let changelog;
  try {
    changelog = await fs.readFile(path.join(pkg.dir, "CHANGELOG.md"), "utf8");
  } catch (err) {
    if (isErrorWithCode(err, "ENOENT")) {
      // if we can't find a changelog, the user has probably disabled changelogs
      return;
    }
    throw err;
  }
  let changelogEntry = getChangelogEntry(changelog, pkg.packageJson.version);
  if (!changelogEntry) {
    // we can find a changelog but not the entry for this version
    // if this is true, something has probably gone wrong
    throw new Error(
      `Could not find changelog entry for ${pkg.packageJson.name}@${pkg.packageJson.version}`,
    );
  }

  await octokit.rest.repos.createRelease({
    name: tagName,
    tag_name: tagName,
    body: changelogEntry.content,
    prerelease: pkg.packageJson.version.includes("-"),
    ...context.repo,
  });
};

type PublishOptions = {
  script?: string;
  fromPackDir?: string;
  createGithubReleases: boolean;
  pushGitTags: boolean;
  github: GitHub;
  cwd: string;
};

type PublishedPackage = { name: string; version: string };
type ChangesetsOutputEvent = {
  type: "git-tag";
  tag: string;
  packageName: string;
};

class ChangesetsOutputReadError extends Error {}

type PublishResult =
  | {
      published: true;
      publishedPackages: PublishedPackage[];
      exitCode: number;
    }
  | {
      published: false;
      exitCode: number;
    };

function isChangesetsOutputEvent(
  value: unknown,
): value is ChangesetsOutputEvent {
  return (
    isObject(value) &&
    "type" in value &&
    value.type === "git-tag" &&
    "tag" in value &&
    typeof value.tag === "string" &&
    "packageName" in value &&
    typeof value.packageName === "string"
  );
}

async function readChangesetsOutput(outputPath: string) {
  let rawOutput: string;
  try {
    rawOutput = await fs.readFile(outputPath, "utf8");
  } catch (err) {
    throw new ChangesetsOutputReadError(
      `Failed to read changesets output at ${outputPath}`,
      { cause: err },
    );
  }

  const events: ChangesetsOutputEvent[] = [];

  let lineStart = 0;
  while (lineStart <= rawOutput.length) {
    let lineEnd = rawOutput.indexOf("\n", lineStart);
    if (lineEnd === -1) {
      lineEnd = rawOutput.length;
    }
    const line = rawOutput.slice(lineStart, lineEnd);
    lineStart = lineEnd + 1;

    if (/^\s*$/.test(line)) {
      continue;
    }

    let event: unknown;
    try {
      event = JSON.parse(line);
    } catch (err) {
      throw new Error(`Failed to parse changesets output event: ${line}`, {
        cause: err,
      });
    }

    if (!isChangesetsOutputEvent(event)) {
      continue;
    }

    events.push(event);
  }

  return events;
}

export async function runPublish({
  script,
  fromPackDir,
  github,
  createGithubReleases,
  pushGitTags,
  cwd,
}: PublishOptions): Promise<PublishResult> {
  const { octokit } = github;
  // Changesets creates annotated tags locally, including when the action pushes those tags through the GitHub API.
  // It might also be important for custom publish scripts to have a valid git user configured.
  await github.ensureGitUser();

  let changesetPublishOutput: ExecOutput;
  const outputFile = path.join(
    process.env.RUNNER_TEMP ?? (await fs.realpath(os.tmpdir())),
    `changesets-output-${randomUUID()}.ndjson`,
  );
  const execOptions: ExecOptions = {
    cwd,
    ignoreReturnCode: true,
    env: {
      ...process.env,
      GITHUB_TOKEN: github.getToken(),
      CHANGESETS_OUTPUT: outputFile,
    },
  };

  if (script) {
    changesetPublishOutput = await getExecOutput(
      script,
      undefined,
      execOptions,
    );
  } else {
    const args = ["publish"];
    if (fromPackDir) {
      args.push("--from-pack-dir", fromPackDir);
    }
    changesetPublishOutput = await getExecOutputChangesetsCli(
      args,
      execOptions,
    );
  }

  let { packages, tool } = await getPackages(cwd);
  let packagesByName = new Map(packages.map((x) => [x.packageJson.name, x]));
  let output: ChangesetsOutputEvent[];
  try {
    output = await readChangesetsOutput(outputFile);
  } catch (err) {
    if (!script || !(err instanceof ChangesetsOutputReadError)) {
      throw err;
    }
    core.warning(
      `${err.message}. GitHub releases and git tags cannot be created without this output. Ensure the custom publish script passes CHANGESETS_OUTPUT to the Changesets CLI.`,
    );
    output = [];
  }
  let releases = output.map((event) => {
    let pkg = packagesByName.get(event.packageName);
    if (pkg === undefined) {
      throw new Error(
        `Package "${event.packageName}" not found.` +
          "This is probably a bug in the action, please open an issue",
      );
    }
    return { pkg, tag: event.tag };
  });

  if (tool.type === "root" && packages.length === 0) {
    throw new Error(
      `No package found.` +
        "This is probably a bug in the action, please open an issue",
    );
  }

  if (createGithubReleases || pushGitTags) {
    await Promise.all(
      releases.map(async ({ pkg, tag }) => {
        if (pushGitTags) {
          await github.pushTag(tag);
        }
        if (createGithubReleases) {
          await createRelease(octokit, { pkg, tagName: tag });
        }
      }),
    );
  }

  if (releases.length) {
    return {
      published: true,
      publishedPackages: releases.map(({ pkg }) => ({
        name: pkg.packageJson.name,
        version: pkg.packageJson.version,
      })),
      exitCode: changesetPublishOutput.exitCode,
    };
  }

  return { published: false, exitCode: changesetPublishOutput.exitCode };
}

export async function getVersionPrBody({
  hasPublishScript,
  preState,
  changedPackagesInfo,
  prBody,
  prBodyMaxCharacters,
  branch,
}: GetVersionPrBodyProps): Promise<string> {
  if (isString(prBody)) {
    const packagesInfo: string = changedPackagesInfo
      .map(({ header, content }) => `${header}\n\n${content}`)
      .join("\n");

    const prBodyText = prBody.replace("{PACKAGES_INFO}", packagesInfo);

    return prBodyText.length > prBodyMaxCharacters
      ? "This PR Body content exceeds the size limit."
      : prBodyText;
  }

  let messageHeader = `This PR was opened by the [Changesets release](https://github.com/changesets/action) GitHub action. When you're ready to do a release, you can merge this and ${
    hasPublishScript
      ? `the packages will be published to npm automatically`
      : `publish to npm yourself or [setup this action to publish automatically](https://github.com/changesets/action#with-publishing)`
  }. If you're not ready to do a release yet, that's fine, whenever you add more changesets to ${branch}, this PR will be updated.
`;
  let messagePrestate = isObject(preState)
    ? `⚠️⚠️⚠️⚠️⚠️⚠️

\`${branch}\` is currently in **pre mode** so this branch has prereleases rather than normal releases. If you want to exit prereleases, run \`changeset pre exit\` on \`${branch}\`.

⚠️⚠️⚠️⚠️⚠️⚠️
`
    : "";
  let messageReleasesHeading = `# Releases`;

  let fullMessage = [
    messageHeader,
    messagePrestate,
    messageReleasesHeading,
    ...changedPackagesInfo.map((info) => `${info.header}\n\n${info.content}`),
  ].join("\n");

  // Check that the message does not exceed the size limit.
  // If not, omit the changelog entries of each package.
  if (fullMessage.length > prBodyMaxCharacters) {
    fullMessage = [
      messageHeader,
      messagePrestate,
      messageReleasesHeading,
      `\n> The changelog information of each package has been omitted from this message, as the content exceeds the size limit.\n`,
      ...changedPackagesInfo.map((info) => `${info.header}\n\n`),
    ].join("\n");
  }

  // Check (again) that the message is within the size limit.
  // If not, omit all release content this time.
  if (fullMessage.length > prBodyMaxCharacters) {
    fullMessage = [
      messageHeader,
      messagePrestate,
      messageReleasesHeading,
      `\n> All release information have been omitted from this message, as the content exceeds the size limit.`,
    ].join("\n");
  }

  return fullMessage;
}

export async function runVersion({
  script,
  github,
  cwd = process.cwd(),
  prTitle = "Version Packages",
  prBody = undefined,
  commitMessage = "Version Packages",
  hasPublishScript = false,
  prBodyMaxCharacters = MAX_CHARACTERS_PER_MESSAGE,
  branch = context.ref.replace("refs/heads/", ""),
  prDraft,
}: RunVersionProps): Promise<RunVersionResult> {
  const { octokit } = github;
  const versionBranch = `changeset-release/${branch}`;

  const { preState } = await readChangesetState(cwd);

  await github.prepareBranch(versionBranch);

  const versionsByDirectory = await getVersionsByDirectory(cwd);

  const env = { ...process.env, GITHUB_TOKEN: github.getToken() };

  if (script) {
    await exec(script, undefined, { cwd, env });
  } else {
    await execChangesetsCli(["version"], { cwd, env });
  }

  const changedPackages = await getChangedPackages(cwd, versionsByDirectory);
  const changedPackagesInfoPromises = Promise.all(
    changedPackages.map(async (pkg) => {
      const changelogContents = await fs.readFile(
        path.join(pkg.dir, "CHANGELOG.md"),
        "utf8",
      );

      const entry = getChangelogEntry(
        changelogContents,
        pkg.packageJson.version,
      );
      return {
        highestLevel: entry.highestLevel,
        private: !!pkg.packageJson.private,
        content: entry.content,
        header: `## ${pkg.packageJson.name}@${pkg.packageJson.version}`,
      };
    }),
  );

  const isPreState = isObject(preState);
  const finalPreState = isPreState ? ` (${preState.tag})` : "";
  const finalPrTitle = `${prTitle}${finalPreState}`;
  const finalCommitMessage = `${commitMessage}${finalPreState}`;

  const existingPullRequests = await octokit.rest.pulls.list({
    ...context.repo,
    state: "open",
    head: `${context.repo.owner}:${versionBranch}`,
    base: branch,
  });
  core.info(
    `Existing pull requests: ${JSON.stringify(
      existingPullRequests.data,
      null,
      2,
    )}`,
  );

  await github.pushChanges({
    branch: versionBranch,
    message: finalCommitMessage,
  });

  const changedPackagesInfo = (await changedPackagesInfoPromises)
    .filter(Boolean)
    .sort(sortTheThings);

  const finalPrBody = await getVersionPrBody({
    hasPublishScript,
    preState,
    branch,
    changedPackagesInfo,
    prBody,
    prBodyMaxCharacters,
  });

  if (existingPullRequests.data.length === 0) {
    core.info("creating pull request");
    const { data: newPullRequest } = await octokit.rest.pulls.create({
      base: branch,
      head: versionBranch,
      title: finalPrTitle,
      body: finalPrBody,
      draft: prDraft !== undefined,
      ...context.repo,
    });

    return {
      pullRequestNumber: newPullRequest.number,
    };
  } else {
    const [pullRequest] = existingPullRequests.data;

    core.info(`updating found pull request #${pullRequest.number}`);
    const convertPullRequestToDraftMutation =
      prDraft === "always"
        ? `
        convertPullRequestToDraft(
          input: {
            pullRequestId: $pullRequestId
          }
        ) {
          pullRequest {
            id
          }
        }`
        : "";
    const updatePullRequestMutation = `
      mutation UpdatePullRequest(
        $pullRequestId: ID!
        $title: String!
        $body: String!
      ) {
        ${convertPullRequestToDraftMutation}

        updatePullRequest(
          input: {
            pullRequestId: $pullRequestId
            title: $title
            body: $body
            state: OPEN
          }
        ) {
          pullRequest {
            id
          }
        }
      }
    `;

    await octokit.graphql(updatePullRequestMutation, {
      pullRequestId: pullRequest.node_id,
      title: finalPrTitle,
      body: finalPrBody,
    });

    return {
      pullRequestNumber: pullRequest.number,
    };
  }
}
