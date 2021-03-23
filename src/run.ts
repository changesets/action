import { exec } from "@actions/exec";
import * as github from "@actions/github";
import fs from "fs-extra";
import { getPackages, Package } from "@manypkg/get-packages";
import path from "path";
import * as semver from "semver";
import {
  getChangelogEntry,
  execWithOutput,
  getChangedPackages,
  sortTheThings,
  getVersionsByDirectory,
  getReleaseMessage,
} from "./utils";
import * as gitUtils from "./gitUtils";
import readChangesetState from "./readChangesetState";
import resolveFrom from "resolve-from";
import issueParser from "issue-parser";

const createRelease = async (
  octokit: ReturnType<typeof github.getOctokit>,
  { pkg, tagName, comment }: { pkg: Package; tagName: string; comment: boolean; }
) => {
  try {
    let changelogFileName = path.join(pkg.dir, "CHANGELOG.md");

    let changelog = await fs.readFile(changelogFileName, "utf8");

    let changelogEntry = getChangelogEntry(changelog, pkg.packageJson.version);
    if (!changelogEntry) {
      // we can find a changelog but not the entry for this version
      // if this is true, something has probably gone wrong
      throw new Error(
        `Could not find changelog entry for ${pkg.packageJson.name}@${pkg.packageJson.version}`
      );
    }

    const { data: { html_url } } = await octokit.repos.createRelease({
      tag_name: tagName,
      body: changelogEntry.content,
      prerelease: pkg.packageJson.version.includes("-"),
      ...github.context.repo,
    });
    if (comment) {
      await createReleaseComments(octokit, { tagName, htmlUrl: html_url });
    }
  } catch (err) {
    // if we can't find a changelog, the user has probably disabled changelogs
    if (err.code !== "ENOENT") {
      throw err;
    }
  }
};

const getSearchQueries = (base: string, commits: string[]) => {
  return commits.reduce((searches, commit) => {
    const lastSearch = searches[searches.length - 1];

    if (lastSearch && lastSearch.length + commit.length <= 256 - 6) {
      searches[searches.length - 1] = `${lastSearch}+hash:${commit}`;
    } else {
      searches.push(`${base}+hash:${commit}`);
    }

    return searches;
  }, [] as string[]);
};

/* Comment on released Pull Requests/Issues  */
const createReleaseComments = async(
  octokit: ReturnType<typeof github.getOctokit>,
  { tagName, htmlUrl }: { tagName: string; htmlUrl: string }
) => {
      /*
      Here are the following steps to retrieve the released PRs and issues.
    
        1. Retrieve the tag associated with the release
        2. Take the commit sha associated with the tag
        3. Retrieve all the commits starting from the tag commit sha
        4. Retrieve the PRs with commits sha matching the release commits
        5. Map through the list of commits and the list of PRs to
           find commit message or PRs body that closes an issue and
           get the issue number.
        6. Create a comment for each issue and PR
      */

      const repo = github.context.repo;
  
      let tagPage = 0;
      let tagFound = false;
      let tagCommitSha = "";
  
      /* 1 */
      while (!tagFound) {
        await octokit.repos
          .listTags({
            ...repo,
            per_page: 100,
            page: tagPage,
          })
          .then(({ data }) => {
            const tag = data.find((el) => el.name === tagName);
            if (tag) {
              tagFound = true;
              /* 2 */
              tagCommitSha = tag.commit.sha;
            }
            tagPage += 1;
          })
          .catch((err) => console.warn(err));
      }
  
      /* 3 */
      const commits = await octokit.repos
        .listCommits({
          ...repo,
          sha: tagCommitSha,
        })
        .then(({ data }) => data);
  
      const shas = commits.map(({ sha }) => sha);
  
      /* Build a seach query to retrieve pulls with commit hashes.
       *  example: repo:<OWNER>/<REPO>+type:pr+is:merged+hash:<FIRST_COMMIT_HASH>+hash:<SECOND_COMMIT_HASH>...
       */
      const searchQueries = getSearchQueries(
        `repo:${repo.owner}/${repo.repo}+type:pr+is:merged`,
        shas
      ).map(
        async (q) =>
          (await octokit.search.issuesAndPullRequests({ q })).data.items
      );
  
      const queries = await (await Promise.all(searchQueries)).flat();
  
      const queriesSet = queries.map((el) => el.number);
  
      const filteredQueries = queries.filter(
        (el, i) => queriesSet.indexOf(el.number) === i
      );
  
      /* 4 */
      const pulls = await filteredQueries.filter(
        async ({ number }) =>
          (
            await octokit.pulls.listCommits({
              owner: repo.owner,
              repo: repo.repo,
              pull_number: number,
            })
          ).data.find(({ sha }) => shas.includes(sha)) ||
          shas.includes(
            (
              await octokit.pulls.get({
                owner: repo.owner,
                repo: repo.repo,
                pull_number: number,
              })
            ).data.merge_commit_sha
          )
      );
  
      const parser = issueParser("github");
  
      /* 5 */
      const issues = [
        ...pulls.map((pr) => pr.body),
        ...commits.map(({ commit }) => commit.message),
      ].reduce((issues, message) => {
        return message
          ? issues.concat(
              parser(message)
                .actions.close.filter(
                  (action) =>
                    action.slug === null ||
                    action.slug === undefined ||
                    action.slug === `${repo.owner}/${repo.repo}`
                )
                .map((action) => ({ number: Number.parseInt(action.issue, 10) }))
            )
          : issues;
      }, [] as { number: number }[]);
  
      /* 6 */
      await Promise.all(
        [...new Set([...pulls, ...issues].map(({ number }) => number))].map(
          async (number) => {
            const issueComment = {
              ...repo,
              issue_number: number,
              body: getReleaseMessage(htmlUrl, tagName),
            };
  
            octokit.issues.createComment(issueComment);
          }
        )
      );
}

type PublishOptions = {
  script: string;
  githubToken: string;
  cwd?: string;
  comment: boolean;
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
  comment,
  cwd = process.cwd(),
}: PublishOptions): Promise<PublishResult> {
  let octokit = github.getOctokit(githubToken);
  let [publishCommand, ...publishArgs] = script.split(/\s+/);

  let changesetPublishOutput = await execWithOutput(
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
      let pkg = packagesByName.get(pkgName);
      if (pkg === undefined) {
        throw new Error(
          `Package "${pkgName}" not found.` +
            "This is probably a bug in the action, please open an issue"
        );
      }
      releasedPackages.push(pkg);
    }

    await Promise.all(
      releasedPackages.map((pkg) =>
        createRelease(octokit, {
          pkg,
          tagName: `${pkg.packageJson.name}@${pkg.packageJson.version}`,
          comment: false
        })
      )
    );
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
        await createRelease(octokit, {
          pkg,
          tagName: `v${pkg.packageJson.version}`,
          comment
        });
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
    if (err && err.code === "MODULE_NOT_FOUND") {
      throw new Error(
        `Have you forgotten to install \`@changesets/cli\` in "${cwd}"?`
      );
    }
    throw err;
  }
};

type VersionOptions = {
  script?: string;
  githubToken: string;
  cwd?: string;
  prTitle?: string;
  commitMessage?: string;
  hasPublishScript?: boolean;
};

export async function runVersion({
  script,
  githubToken,
  cwd = process.cwd(),
  prTitle = "Version Packages",
  commitMessage = "Version Packages",
  hasPublishScript = false,
}: VersionOptions) {
  let repo = `${github.context.repo.owner}/${github.context.repo.repo}`;
  let branch = github.context.ref.replace("refs/heads/", "");
  let versionBranch = `changeset-release/${branch}`;
  let octokit = github.getOctokit(githubToken);
  let { preState } = await readChangesetState(cwd);

  await gitUtils.switchToMaybeExistingBranch(versionBranch);
  await gitUtils.reset(github.context.sha);

  let versionsByDirectory = await getVersionsByDirectory(cwd);

  if (script) {
    let [versionCommand, ...versionArgs] = script.split(/\s+/);
    await exec(versionCommand, versionArgs, { cwd });
  } else {
    let changesetsCliPkgJson = requireChangesetsCliPkgJson(cwd);
    let cmd = semver.lt(changesetsCliPkgJson.version, "2.0.0")
      ? "bump"
      : "version";
    await exec("node", [resolveFrom(cwd, "@changesets/cli/bin.js"), cmd], {
      cwd,
    });
  }

  let searchQuery = `repo:${repo}+state:open+head:${versionBranch}+base:${branch}`;
  let searchResultPromise = octokit.search.issuesAndPullRequests({
    q: searchQuery,
  });
  let changedPackages = await getChangedPackages(cwd, versionsByDirectory);

  let prBodyPromise = (async () => {
    return (
      `This PR was opened by the [Changesets release](https://github.com/changesets/action) GitHub action. When you're ready to do a release, you can merge this and ${
        hasPublishScript
          ? `the packages will be published to npm automatically`
          : `publish to npm yourself or [setup this action to publish automatically](https://github.com/changesets/action#with-publishing)`
      }. If you're not ready to do a release yet, that's fine, whenever you add more changesets to ${branch}, this PR will be updated.
${
  !!preState
    ? `
⚠️⚠️⚠️⚠️⚠️⚠️

\`${branch}\` is currently in **pre mode** so this branch has prereleases rather than normal releases. If you want to exit prereleases, run \`changeset pre exit\` on \`${branch}\`.

⚠️⚠️⚠️⚠️⚠️⚠️
`
    : ""
}
# Releases
` +
      (
        await Promise.all(
          changedPackages.map(async (pkg) => {
            let changelogContents = await fs.readFile(
              path.join(pkg.dir, "CHANGELOG.md"),
              "utf8"
            );

            let entry = getChangelogEntry(
              changelogContents,
              pkg.packageJson.version
            );
            return {
              highestLevel: entry.highestLevel,
              private: !!pkg.packageJson.private,
              content:
                `## ${pkg.packageJson.name}@${pkg.packageJson.version}\n\n` +
                entry.content,
            };
          })
        )
      )
        .filter((x) => x)
        .sort(sortTheThings)
        .map((x) => x.content)
        .join("\n ")
    );
  })();

  const finalPrTitle = `${prTitle}${!!preState ? ` (${preState.tag})` : ""}`;

  // project with `commit: true` setting could have already committed files
  if (!(await gitUtils.checkIfClean())) {
    const finalCommitMessage = `${commitMessage}${
      !!preState ? ` (${preState.tag})` : ""
    }`;
    await gitUtils.commitAll(finalCommitMessage);
  }

  await gitUtils.push(versionBranch, { force: true });

  let searchResult = await searchResultPromise;
  console.log(JSON.stringify(searchResult.data, null, 2));
  if (searchResult.data.items.length === 0) {
    console.log("creating pull request");
    await octokit.pulls.create({
      base: branch,
      head: versionBranch,
      title: finalPrTitle,
      body: await prBodyPromise,
      ...github.context.repo,
    });
  } else {
    octokit.pulls.update({
      pull_number: searchResult.data.items[0].number,
      title: finalPrTitle,
      body: await prBodyPromise,
      ...github.context.repo,
    });
    console.log("pull request found");
  }
}
