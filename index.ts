import * as core from "@actions/core";
import { exec } from "@actions/exec";
import * as github from "@actions/github";
import fs from "fs-extra";
import getWorkspaces, { Workspace } from "get-workspaces";
import path from "path";
import {
  getChangelogEntry,
  execWithOutput,
  getChangedPackages,
  sortTheThings
} from "./utils";
import * as semver from "semver";

(async () => {
  let githubToken = process.env.GITHUB_TOKEN;

  if (!githubToken) {
    core.setFailed("Please add the GITHUB_TOKEN to the changesets action");
    return;
  }
  let repo = `${github.context.repo.owner}/${github.context.repo.repo}`;

  const octokit = new github.GitHub(githubToken);

  let defaultBranchPromise = octokit.repos
    .get(github.context.repo)
    .then(x => x.data.default_branch);

  console.log("setting git user");
  await exec("git", [
    "config",
    "--global",
    "user.name",
    `"github-actions[bot]"`
  ]);
  await exec("git", [
    "config",
    "--global",
    "user.email",
    `"github-actions[bot]@users.noreply.github.com"`
  ]);

  console.log("setting GitHub credentials");
  await fs.writeFile(
    `${process.env.HOME}/.netrc`,
    `machine github.com\nlogin github-actions[bot]\npassword ${githubToken}`
  );

  let defaultBranch = await defaultBranchPromise;
  if (github.context.ref.replace("refs/heads/", "") !== defaultBranch) {
    core.setFailed(
      `The changesets action should only run on ${defaultBranch} but it's running on ${github.context.ref.replace(
        "refs/heads/",
        ""
      )}, please change your GitHub actions config to only run the Changesets action on ${defaultBranch}`
    );
    return;
  }

  let hasChangesets = fs
    .readdirSync(`${process.cwd()}/.changeset`)
    .some(x => x !== "config.js" && x !== "README.md");
  let publishScript = core.getInput("publish");
  if (!hasChangesets && !publishScript) {
    console.log("No changesets found");
    return;
  }
  if (!hasChangesets && publishScript) {
    console.log(
      "No changesets found, attempting to publish any unpublished packages to npm"
    );
    let workspaces = await getWorkspaces({ tools: ["bolt", "yarn", "root"] });

    if (!workspaces) {
      return core.setFailed("Could not find workspaces");
    }

    let workspacesByName = new Map(workspaces.map(x => [x.name, x]));

    fs.writeFileSync(
      `${process.env.HOME}/.npmrc`,
      `//registry.npmjs.org/:_authToken=${process.env.NPM_TOKEN}`
    );

    let [publishCommand, ...publishArgs] = publishScript.split(/\s+/);

    let changesetPublishOutput = await execWithOutput(
      publishCommand,
      publishArgs
    );

    await exec("git", [
      "push",
      "origin",
      `HEAD:${defaultBranch}`,
      "--follow-tags"
    ]);

    let newTagRegex = /New tag:\s+(@[^/]+\/[^@]+|[^/]+)@([^\s]+)/;

    let releasedWorkspaces: Workspace[] = [];

    for (let line of changesetPublishOutput.stdout.split("\n")) {
      let match = line.match(newTagRegex);
      if (match === null) {
        continue;
      }
      let pkgName = match[1];
      let workspace = workspacesByName.get(pkgName);
      if (workspace === undefined) {
        return core.setFailed(
          "Workspace not found for " +
            pkgName +
            ". This is probably a bug in the action, please open an issue"
        );
      }
      releasedWorkspaces.push(workspace);
    }

    await Promise.all(
      releasedWorkspaces.map(async workspace => {
        try {
          let changelogFileName = path.join(workspace.dir, "CHANGELOG.md");

          let changelog = await fs.readFile(changelogFileName, "utf8");

          let changelogEntry = getChangelogEntry(
            changelog,
            workspace.config.version
          );
          if (!changelogEntry) {
            // we can find a changelog but not the entry for this version
            // if this is true, something has probably gone wrong
            return core.setFailed(
              `Could not find changelog entry for ${workspace.name}@${workspace.config.version}`
            );
          }

          await octokit.repos.createRelease({
            tag_name: `${workspace.name}@${workspace.config.version}`,
            body: changelogEntry.content,
            prerelease: workspace.config.version.includes("-"),
            ...github.context.repo
          });
        } catch (err) {
          // if we can't find a changelog, the user has probably disabled changelogs
          if (err.code !== "ENOENT") {
            throw err;
          }
        }
      })
    );

    return;
  }

  let { stderr } = await execWithOutput(
    "git",
    ["checkout", "changeset-release"],
    { ignoreReturnCode: true }
  );
  let isCreatingChangesetReleaseBranch = !stderr
    .toString()
    .includes("Switched to a new branch 'changeset-release'");
  if (isCreatingChangesetReleaseBranch) {
    await exec("git", ["checkout", "-b", "changeset-release"]);
  }

  let shouldBump = isCreatingChangesetReleaseBranch;

  if (!shouldBump) {
    console.log("checking if new changesets should be added");
    let cmd = await execWithOutput("git", [
      "merge-base",
      "changeset-release",
      github.context.sha
    ]);
    const divergedAt = cmd.stdout.trim();

    let diffOutput = await execWithOutput("git", [
      "diff",
      "--name-only",
      `${divergedAt}...${github.context.sha}`
    ]);
    const files = diffOutput.stdout.trim();
    shouldBump = files.includes(".changeset");
    console.log("checked if new changesets should be added " + shouldBump);
  }
  if (shouldBump) {
    await exec("git", ["reset", "--hard", github.context.sha]);
    let changesetsCliPkgJson = await fs.readJson(
      path.join("node_modules", "@changesets", "cli", "package.json")
    );
    let cmd = semver.lt(changesetsCliPkgJson.version, "2.0.0")
      ? "bump"
      : "version";
    let output = await execWithOutput("node", [
      "./node_modules/.bin/changeset",
      cmd
    ]);
    let searchQuery = `repo:${repo}+state:open+head:changeset-release+base:${defaultBranch}`;
    let searchResultPromise = octokit.search.issuesAndPullRequests({
      q: searchQuery
    });
    let changedWorkspaces = await getChangedPackages(process.cwd());

    let prBodyPromise = (async () => {
      return (
        `This PR was opened by the Changesets release GitHub action. When you're ready to do a release, you can merge this and ${
          publishScript
            ? `the packages will be published to npm automatically`
            : `publish to npm yourself or [setup this action to publish automatically](https://github.com/changesets/action#with-publishing)`
        }. If you're not ready to do a release yet, that's fine, whenever you add more changesets to ${defaultBranch}, this PR will be updated.

# Releases
` +
        (await Promise.all(
          changedWorkspaces.map(async workspace => {
            let changelogContents = await fs.readFile(
              path.join(workspace.dir, "CHANGELOG.md"),
              "utf8"
            );

            let entry = getChangelogEntry(
              changelogContents,
              workspace.config.version
            );
            return {
              highestLevel: entry.highestLevel,
              private: !!workspace.config.private,
              content:
                `## ${workspace.name}@${workspace.config.version}\n\n` +
                entry.content
            };
          })
        ))
          .filter(x => x)
          .sort(sortTheThings)
          .map(x => x.content)
          .join("\n ")
      );
    })();
    await exec("git", ["add", "."]);
    await exec("git", ["commit", "-m", "Version Packages"]);
    await exec("git", ["push", "origin", "changeset-release", "--force"]);
    let searchResult = await searchResultPromise;
    console.log(JSON.stringify(searchResult.data, null, 2));
    if (searchResult.data.items.length === 0) {
      console.log("creating pull request");
      await octokit.pulls.create({
        base: defaultBranch,
        head: "changeset-release",
        title: "Version Packages",
        body: await prBodyPromise,
        ...github.context.repo
      });
    } else {
      octokit.pulls.update({
        pull_number: searchResult.data.items[0].number,
        body: await prBodyPromise,
        ...github.context.repo
      });
      console.log("pull request found");
    }
  } else {
    console.log("no new changesets");
  }
})().catch(err => {
  console.error(err);
  core.setFailed(err.message);
});
