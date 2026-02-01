import * as core from "@actions/core";
import { exec, getExecOutput } from "@actions/exec";
import * as github from "@actions/github";
import type { PreState } from "@changesets/types";
import { type Package, getPackages } from "@manypkg/get-packages";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import semverLt from "semver/functions/lt.js";
import { Git } from "./git.ts";
import type { Octokit } from "./octokit.ts";
import readChangesetState from "./readChangesetState.ts";
import {
  getChangedPackages,
  getChangelogEntry,
  getVersionsByDirectory,
  isErrorWithCode,
  sortTheThings,
} from "./utils.ts";

const require = createRequire(import.meta.url);

// GitHub Issues/PRs messages have a max size limit on the
// message body payload.
// `body is too long (maximum is 65536 characters)`.
// To avoid that, we ensure to cap the message to 60k chars.
const MAX_CHARACTERS_PER_MESSAGE = 60000;

const createRelease = async (
  octokit: Octokit,
  { pkg, tagName }: { pkg: Package; tagName: string }
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
      `Could not find changelog entry for ${pkg.packageJson.name}@${pkg.packageJson.version}`
    );
  }

  await octokit.rest.repos.createRelease({
    name: tagName,
    tag_name: tagName,
    body: changelogEntry.content,
    prerelease: pkg.packageJson.version.includes("-"),
    ...github.context.repo,
  });
};

/**
 * Creates a combined release for all packages that have been released
 * in the current run.
 * @param octokit The octokit instance to use for creating the release.
 * @param options The options for creating the release.
 * @returns A promise that resolves when the release has been created.
 */
const createCombinedRelease = async (
  octokit: Octokit,
  { packages, tagName }: { packages: Package[], tagName: string }
) => {
  let finalChangelog: string | undefined;
  const isPrerelease = packages.some(
    (pkg) => pkg.packageJson.version.includes("-")
  );
  const isStable = packages.some(
    (pkg) => !pkg.packageJson.version.includes("-")
  );

  // If we have a mix of stable and prerelease versions, we throw an error
  // otherwise there's not reason to create a combined release
  if (isPrerelease && isStable) {
    throw new Error('Cannot create a combined release with both stable and prerelease versions.');
  }

  try {
    // we collect the changelog of all packages
     finalChangelog = await Promise.all(
      packages.map((pkg) => {
        const changelog = fs.readFile(path.join(pkg.dir, "CHANGELOG.md"), "utf8")
        const changelogEntry = getChangelogEntry(changelog, pkg.packageJson.version);
        const content = changelogEntry.content;

        // First we'll replace all ## versions with level 3 headings
        content.replace(/^(## )/gm, "### ");

        // Second we'll replace all ### change heaadings with level 4 headings
        content.replace(/^(### )/gm, "#### ");

        // now we'll replace the changelog heading with the package name
        content.replace(/^# (.*)$/gm, `## ${pkg.packageJson.name}`);

        if (!changelogEntry) {
          // we can find a changelog but not the entry for this version
          // if this is true, something has probably gone wrong
          throw new Error(
            `Could not find changelog entry for ${pkg.packageJson.name}@${pkg.packageJson.version}`
          );
        }
        return changelogEntry.content;
      })
    ).then((changelogs) => changelogs.join("\n\n"));

    // Now lets add back the main heading via prepending it
    finalChangelog = `# ${tagName}\n\n${finalChangelog}`;

    await octokit.rest.repos.createRelease({
      name: tagName,
      tag_name: tagName,
      body: finalChangelog,
      prerelease: isPrerelease,
      ...github.context.repo,
    })
  } catch (err) {
    if (isErrorWithCode(err, "ENOENT")) {
      // if we can't find a changelog, the user has probably disabled changelogs
      return;
    }
    throw err;
  }
}

type PublishOptions = {
  script: string;
  githubToken: string;
  octokit: Octokit;
  createGithubReleases: boolean;
  combineReleases?: boolean;
  git: Git;
  cwd: string;
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
  git,
  octokit,
  createGithubReleases,
  combineReleases = false,
  cwd,
}: PublishOptions): Promise<PublishResult> {
  let [publishCommand, ...publishArgs] = script.split(/\s+/);

  let changesetPublishOutput = await getExecOutput(
    publishCommand,
    publishArgs,
    { cwd, env: { ...process.env, GITHUB_TOKEN: githubToken } }
  );

  let { packages, tool } = await getPackages(cwd) as { packages: Package[]; tool: string };
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
      if (combineReleases && releasedPackages.length > 1) {
        // we'll collect all packages with the same release version
        const packagesByVersion = packages.reduce((acc: Record<string, Package[]>, pkg: Package) => {
          const version = pkg.packageJson.version;
          if (!acc[version]) {
            acc[version] = [];
          }
          acc[version].push(pkg);
          return acc;
        }, {})

        if (Object.keys(packagesByVersion).length === 0) {
          throw new Error(
            `No packages found with a version to release.` +
              "This is probably a bug in the action, please open an issue"
          );
        }

        // in the case the user is combining releases but has different package versions
        // in the mono repo, we will warn them about it
        if (Object.keys(packagesByVersion).length > 1) {
          console.warn(
            `Multiple package versions found: ${Object.keys(packagesByVersion).join(", ")}. ` +
              "Creating combined releases for each version.\n" +
              "This is a workaround to avoid issues when multiple package versions are released from the same changeset.\n" + 
              "This can lead to issues should different versions start overlapping in the future."
          );
        }

        // for each version we'll create a combined release
        // this is a bandaid to avoid issues when for whatever reason multiple package versions are released
        // from the same changeset
        await Promise.all(
          Object.entries(packagesByVersion).map(async ([version, versionPackages]) => {
            const tagName = `v${version}`;
            await git.pushTag(tagName);
            await createCombinedRelease(octokit, { packages: versionPackages, tagName });
          })
        );
      } else {
        await Promise.all(
          releasedPackages.map(async (pkg) => {
            const tagName = `${pkg.packageJson.name}@${pkg.packageJson.version}`;
            await git.pushTag(tagName);
            await createRelease(octokit, { pkg, tagName });
          })
        );
      }
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
        releasedPackages.push(pkg);
        if (createGithubReleases) {
          const tagName = `v${pkg.packageJson.version}`;
          await git.pushTag(tagName);
          await createRelease(octokit, { pkg, tagName });
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
    return require(require.resolve("@changesets/cli/package.json", {
      paths: [cwd],
    }));
  } catch (err) {
    if (isErrorWithCode(err, "MODULE_NOT_FOUND")) {
      throw new Error(
        `Have you forgotten to install \`@changesets/cli\` in "${cwd}"?`,
        { cause: err }
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

type VersionOptions = {
  script?: string;
  githubToken: string;
  git: Git;
  octokit: Octokit;
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

export async function runVersion({
  script,
  githubToken,
  git,
  octokit,
  cwd = process.cwd(),
  prTitle = "Version Packages",
  commitMessage = "Version Packages",
  hasPublishScript = false,
  prBodyMaxCharacters = MAX_CHARACTERS_PER_MESSAGE,
  branch = github.context.ref.replace("refs/heads/", ""),
}: VersionOptions): Promise<RunVersionResult> {
  let versionBranch = `changeset-release/${branch}`;

  let { preState } = await readChangesetState(cwd);

  await git.prepareBranch(versionBranch);

  let versionsByDirectory = await getVersionsByDirectory(cwd);

  const env = { ...process.env, GITHUB_TOKEN: githubToken };

  if (script) {
    let [versionCommand, ...versionArgs] = script.split(/\s+/);
    await exec(versionCommand, versionArgs, { cwd, env });
  } else {
    let changesetsCliPkgJson = requireChangesetsCliPkgJson(cwd);
    let cmd = semverLt(changesetsCliPkgJson.version, "2.0.0")
      ? "bump"
      : "version";
    await exec(
      "node",
      [
        require.resolve("@changesets/cli/bin.js", {
          paths: [cwd],
        }),
        cmd,
      ],
      {
        cwd,
        env,
      }
    );
  }

  let changedPackages = await getChangedPackages(cwd, versionsByDirectory);
  let changedPackagesInfoPromises = Promise.all(
    changedPackages.map(async (pkg) => {
      let changelogContents = await fs.readFile(
        path.join(pkg.dir, "CHANGELOG.md"),
        "utf8"
      );

      let entry = getChangelogEntry(changelogContents, pkg.packageJson.version);
      return {
        highestLevel: entry.highestLevel,
        private: !!pkg.packageJson.private,
        content: entry.content,
        header: `## ${pkg.packageJson.name}@${pkg.packageJson.version}`,
      };
    })
  );

  const finalPrTitle = `${prTitle}${!!preState ? ` (${preState.tag})` : ""}`;
  const finalCommitMessage = `${commitMessage}${
    !!preState ? ` (${preState.tag})` : ""
  }`;

  /**
   * Fetch any existing pull requests that are open against the branch,
   * before we push any changes that may inadvertently close the existing PRs.
   *
   * (`@changesets/ghcommit` has to reset the branch to the same commit as the base,
   * which GitHub will then react to by closing the PRs)
   */
  const existingPullRequests = await octokit.rest.pulls.list({
    ...github.context.repo,
    state: "open",
    head: `${github.context.repo.owner}:${versionBranch}`,
    base: branch,
  });
  core.info(
    `Existing pull requests: ${JSON.stringify(
      existingPullRequests.data,
      null,
      2
    )}`
  );

  await git.pushChanges({ branch: versionBranch, message: finalCommitMessage });

  const changedPackagesInfo = (await changedPackagesInfoPromises)
    .filter((x) => x)
    .sort(sortTheThings);

  let prBody = await getVersionPrBody({
    hasPublishScript,
    preState,
    branch,
    changedPackagesInfo,
    prBodyMaxCharacters,
  });

  if (existingPullRequests.data.length === 0) {
    core.info("creating pull request");
    const { data: newPullRequest } = await octokit.rest.pulls.create({
      base: branch,
      head: versionBranch,
      title: finalPrTitle,
      body: prBody,
      ...github.context.repo,
    });

    return {
      pullRequestNumber: newPullRequest.number,
    };
  } else {
    const [pullRequest] = existingPullRequests.data;

    core.info(`updating found pull request #${pullRequest.number}`);
    await octokit.rest.pulls.update({
      pull_number: pullRequest.number,
      title: finalPrTitle,
      body: prBody,
      ...github.context.repo,
      state: "open",
    });

    return {
      pullRequestNumber: pullRequest.number,
    };
  }
}
