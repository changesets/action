import { exec, getExecOutput } from "@actions/exec";
import { GitHub, getOctokitOptions } from "@actions/github/lib/utils.js";
import * as github from "@actions/github";
import * as core from "@actions/core";
import fs from "fs-extra";
import { getPackages, Package } from "@manypkg/get-packages";
import path from "path";
import * as semver from "semver";
import { PreState } from "@changesets/types";
import {
  getChangelogEntry,
  getChangedPackages,
  sortTheThings,
  getVersionsByDirectory,
} from "./utils.js";
import * as gitUtils from "./gitUtils.js";
import readChangesetState from "./readChangesetState.js";
import resolveFrom from "resolve-from";
import { throttling } from "@octokit/plugin-throttling";

// GitHub Issues/PRs messages have a max size limit on the
// message body payload.
// `body is too long (maximum is 65536 characters)`.
// To avoid that, we ensure to cap the message to 60k chars.
const MAX_CHARACTERS_PER_MESSAGE = 60000;

function setupOctokit(githubToken: string) {
  return new (GitHub.plugin(throttling))(
    getOctokitOptions(githubToken, {
      throttle: {
        onRateLimit: (retryAfter, options: any, octokit, retryCount) => {
          core.warning(
            `Request quota exhausted for request ${options.method} ${options.url}`
          );

          if (retryCount <= 2) {
            core.info(`Retrying after ${retryAfter} seconds!`);
            return true;
          }
        },
        onSecondaryRateLimit: (
          retryAfter,
          options: any,
          octokit,
          retryCount
        ) => {
          core.warning(
            `SecondaryRateLimit detected for request ${options.method} ${options.url}`
          );

          if (retryCount <= 2) {
            core.info(`Retrying after ${retryAfter} seconds!`);
            return true;
          }
        },
      },
    })
  );
}

async function createRelease(
  octokit: ReturnType<typeof setupOctokit>,
  { pkg, tagName }: { pkg: Package; tagName: string }
) {
  const changelogFileName = path.join(pkg.dir, "CHANGELOG.md");
  const changelog = await fs.readFile(changelogFileName, "utf8");
  const changelogEntry = getChangelogEntry(changelog, pkg.packageJson.version);

  if (!changelogEntry) {
    // we can find a changelog but not the entry for this version
    // if this is true, something has probably gone wrong
    throw new Error(
      `Could not find changelog entry for ${pkg.packageJson.name}@${pkg.packageJson.version}`
    );
  }
  try {
    await octokit.rest.repos.createRelease({
      name: tagName,
      tag_name: tagName,
      body: changelogEntry.content,
      prerelease: pkg.packageJson.version.includes("-"),
      ...github.context.repo,
    });
  } catch (err) {
    // if we can't find a changelog, the user has probably disabled changelogs
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      err.code !== "ENOENT"
    ) {
      throw err;
    }
  }
}

type PublishOptions = {
  script: string;
  githubToken: string;
  createGithubReleases: boolean;
  cwd?: string;
};

type PublishedPackage = { name: string; version: string };

type PublishResult =
  | {
      published: true;
      publishedPackages: PublishedPackage[];
    }
  | {
      published: false;
    };

export async function runPublish({
  script,
  githubToken,
  createGithubReleases,
  cwd = process.cwd(),
}: PublishOptions): Promise<PublishResult> {
  const octokit = setupOctokit(githubToken);

  let [publishCommand, ...publishArgs] = script.split(/\s+/);

  if (!publishCommand) throw new Error("No publish command provided");
  let changesetPublishOutput = await getExecOutput(
    publishCommand,
    publishArgs,
    { cwd }
  );

  await gitUtils.pushTags();

  let { packages, tool } = await getPackages(cwd);
  let releasedPackages: Package[] = [];

  if (tool !== "root") {
    let newTagRegex = /New tag:\s+(@[^/]+\/[^@]+|[^/]+)@([^\s]+)/;
    let packagesByName = new Map(packages.map((x) => [x.packageJson.name, x]));

    for (let line of changesetPublishOutput.stdout.split("\n")) {
      let match = line.match(newTagRegex);
      if (match === null) {
        continue;
      }
      let pkgName = match[1];
      if (!pkgName)
        throw new Error("No package name found in changeset output");
      let pkg = packagesByName.get(pkgName);
      if (pkg === undefined) {
        throw new Error(
          `Package "${pkgName}" not found.` +
            "This is probably a bug in the action, please open an issue"
        );
      }
      releasedPackages.push(pkg);
    }

    if (createGithubReleases) {
      await Promise.all(
        releasedPackages.map((pkg) =>
          createRelease(octokit, {
            pkg,
            tagName: `${pkg.packageJson.name}@${pkg.packageJson.version}`,
          })
        )
      );
    }
  } else {
    if (packages.length === 0) {
      throw new Error(
        `No package found.` +
          "This is probably a bug in the action, please open an issue"
      );
    }
    let pkg = packages[0];
    let newTagRegex = /New tag:/;

    for (let line of changesetPublishOutput.stdout.split("\n")) {
      let match = line.match(newTagRegex);

      if (match) {
        if (!pkg) throw new Error("No package found in root publish");
        releasedPackages.push(pkg);
        if (createGithubReleases) {
          await createRelease(octokit, {
            pkg,
            tagName: `v${pkg.packageJson.version}`,
          });
        }
        break;
      }
    }
  }

  if (releasedPackages.length) {
    return {
      published: true,
      publishedPackages: releasedPackages.map((pkg) => ({
        name: pkg.packageJson.name,
        version: pkg.packageJson.version,
      })),
    };
  }

  return { published: false };
}

const requireChangesetsCliPkgJson = (cwd: string) => {
  try {
    return require(resolveFrom(cwd, "@changesets/cli/package.json"));
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      err.code === "MODULE_NOT_FOUND"
    ) {
      throw new Error(
        `Have you forgotten to install \`@changesets/cli\` in "${cwd}"?`
      );
    }
    throw err;
  }
};

type GetMessageOptions = {
  hasPublishScript: boolean;
  branch: string;
  changedPackagesInfo: {
    highestLevel: number;
    private: boolean;
    content: string;
    header: string;
  }[];
  prBodyMaxCharacters: number;
  preState?: PreState;
};

export async function getVersionPrBody({
  hasPublishScript,
  preState,
  changedPackagesInfo,
  prBodyMaxCharacters,
  branch,
}: GetMessageOptions) {
  let messageHeader = `This PR was opened by the [Changesets release](https://github.com/changesets/action) GitHub action. When you're ready to do a release, you can merge this and ${
    hasPublishScript
      ? `the packages will be published to npm automatically`
      : `publish to npm yourself or [setup this action to publish automatically](https://github.com/changesets/action#with-publishing)`
  }. If you're not ready to do a release yet, that's fine, whenever you add more changesets to ${branch}, this PR will be updated.
`;
  let messagePrestate = !!preState
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
  githubToken,
  cwd = process.cwd(),
  prTitle = "Version Packages",
  commitMessage = "Version Packages",
  hasPublishScript = false,
  prBodyMaxCharacters = MAX_CHARACTERS_PER_MESSAGE,
  branch,
}: VersionOptions): Promise<RunVersionResult> {
  const octokit = setupOctokit(githubToken);
  branch = branch ?? github.context.ref.replace("refs/heads/", "");
  const versionBranch = `changeset-release/${branch}`;

  await setupEnvironment(cwd, versionBranch);

  const versionsByDirectory = await getVersionsByDirectory(cwd);
  await executeVersionScript(cwd, script, versionsByDirectory);

  const { preState } = await readChangesetState(cwd);
  const changedPackages = await getChangedPackages(cwd, versionsByDirectory);
  const changedPackagesInfo = await getChangedPackagesInfo(changedPackages);

  const finalPrTitle = getFinalPrTitle(prTitle, preState);
  if (!(await gitUtils.checkIfClean())) {
    await commitChanges(commitMessage, preState);
  }

  await gitUtils.push(versionBranch, { force: true });

  const existingPullRequests = await getExistingPullRequests(
    octokit,
    versionBranch,
    branch
  );
  const prBody = await getVersionPrBody({
    hasPublishScript,
    preState,
    branch,
    changedPackagesInfo,
    prBodyMaxCharacters,
  });

  return await handlePullRequest(
    octokit,
    existingPullRequests,
    versionBranch,
    branch,
    finalPrTitle,
    prBody
  );
}

async function setupEnvironment(cwd: string, versionBranch: string) {
  await gitUtils.switchToMaybeExistingBranch(versionBranch);
  await gitUtils.reset(github.context.sha);
}

async function executeVersionScript(
  cwd: string,
  script: string | undefined,
  versionsByDirectory: any
) {
  if (script) {
    const [versionCommand, ...versionArgs] = script.split(/\s+/);
    if (!versionCommand) throw new Error("No version command provided");
    await exec(versionCommand, versionArgs, { cwd });
  } else {
    await runDefaultVersionCommand(cwd);
  }
}

async function runDefaultVersionCommand(cwd: string) {
  const changesetsCliPkgJson = requireChangesetsCliPkgJson(cwd);
  const cmd = semver.lt(changesetsCliPkgJson.version, "2.0.0")
    ? "bump"
    : "version";
  await exec("node", [resolveFrom(cwd, "@changesets/cli/bin.js"), cmd], {
    cwd,
  });
}

async function getChangedPackagesInfo(changedPackages: Package[]) {
  const results = await Promise.all(
    changedPackages.map(async (pkg) => {
      const changelogContents = await fs.readFile(path.join(pkg.dir, "CHANGELOG.md"), "utf8");
      const entry = getChangelogEntry(changelogContents, pkg.packageJson.version);
      return {
        highestLevel: entry.highestLevel,
        private: !!pkg.packageJson.private,
        content: entry.content,
        header: `## ${pkg.packageJson.name}@${pkg.packageJson.version}`,
      };
    })
  );
  return results.filter(Boolean).sort(sortTheThings);
}

function getFinalPrTitle(prTitle: string, preState?: any) {
  return `${prTitle}${!!preState ? ` (${preState.tag})` : ""}`;
}

async function commitChanges(commitMessage: string, preState?: any) {
  const finalCommitMessage = `${commitMessage}${
    !!preState ? ` (${preState.tag})` : ""
  }`;
  await gitUtils.commitAll(finalCommitMessage);
}

async function getExistingPullRequests(
  octokit: OctokitInstance,
  versionBranch: string,
  branch: string
) {
  const response = await octokit.rest.pulls.list({
    ...github.context.repo,
    state: "open",
    head: `${github.context.repo.owner}:${versionBranch}`,
    base: branch,
  });
  core.info(JSON.stringify(response.data, null, 2));
  return response.data;
}

async function handlePullRequest(
  octokit: OctokitInstance,
  existingPullRequests: any[],
  versionBranch: string,
  branch: string,
  finalPrTitle: string,
  prBody: string
): Promise<RunVersionResult> {
  if (existingPullRequests.length === 0) {
    core.info("creating pull request");
    const { data: newPullRequest } = await octokit.rest.pulls.create({
      base: branch,
      head: versionBranch,
      title: finalPrTitle,
      body: prBody,
      ...github.context.repo,
    });
    return { pullRequestNumber: newPullRequest.number };
  } else {
    const [pullRequest] = existingPullRequests;
    core.info(`updating found pull request #${pullRequest.number}`);
    await octokit.rest.pulls.update({
      pull_number: pullRequest.number,
      title: finalPrTitle,
      body: prBody,
      ...github.context.repo,
      state: "open",
    });
    return { pullRequestNumber: pullRequest.number };
  }
}

type VersionOptions = {
  script?: string;
  githubToken: string;
  cwd?: string;
  prTitle?: string;
  commitMessage?: string;
  hasPublishScript?: boolean;
  prBodyMaxCharacters?: number;
  branch?: string;
};

type RunVersionResult = {
  pullRequestNumber: number;
};

type OctokitInstance = ReturnType<typeof setupOctokit>;
