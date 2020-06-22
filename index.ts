import * as core from "@actions/core";
import { exec } from "@actions/exec";
import * as github from "@actions/github";
import fs from "fs-extra";
import { getPackages, Package } from "@manypkg/get-packages";
import path from "path";
import {
  getChangelogEntry,
  execWithOutput,
  getChangedPackages,
  sortTheThings
} from "./utils";
import * as semver from "semver";
import { readPreState } from "@changesets/pre";
import readChangesets from "@changesets/read";

(async () => {
  let githubToken = process.env.GITHUB_TOKEN;

  if (!githubToken) {
    core.setFailed("Please add the GITHUB_TOKEN to the changesets action");
    return;
  }
  let repo = `${github.context.repo.owner}/${github.context.repo.repo}`;
  let branch = github.context.ref.replace("refs/heads/", "");
  let preState = await readPreState(process.cwd());

  let isInPreMode = preState !== undefined && preState.mode === "pre";

  const octokit = new github.GitHub(githubToken);

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

  let changesets = await readChangesets(process.cwd());

  if (isInPreMode) {
    let changesetsToFilter = new Set(preState.changesets);
    changesets = changesets.filter(x => !changesetsToFilter.has(x.id));
  }

  let hasChangesets = changesets.length !== 0;

  let inputs = {
    publishScript: core.getInput("publish"),
    versionScript: core.getInput("version"),
    commit: core.getInput("commit") || "Version Packages",
    prTitle: core.getInput("title") || "Version Packages"
  };
  core.setOutput("published", "false");
  core.setOutput("publishedPackages", "[]");

  if (!hasChangesets && !inputs.publishScript) {
    console.log("No changesets found");
    return;
  }
  if (!hasChangesets && inputs.publishScript) {
    console.log(
      "No changesets found, attempting to publish any unpublished packages to npm"
    );
    let { packages } = await getPackages(process.cwd());
    let packagesByName = new Map(packages.map(x => [x.packageJson.name, x]));

    let npmrcPath = `${process.env.HOME}/.npmrc`;
    if (fs.existsSync(npmrcPath)) {
      console.log("Found existing .npmrc file");
    } else {
      console.log("No .npmrc file found, creating one");
      fs.writeFileSync(
        npmrcPath,
        `//registry.npmjs.org/:_authToken=${process.env.NPM_TOKEN}`
      );
    }

    let [publishCommand, ...publishArgs] = inputs.publishScript.split(/\s+/);

    let changesetPublishOutput = await execWithOutput(
      publishCommand,
      publishArgs
    );

    await exec("git", ["pull", "origin", branch]);

    await exec("git", ["push", "origin", `HEAD:${branch}`, "--tags"]);

    let newTagRegex = /New tag:\s+(@[^/]+\/[^@]+|[^/]+)@([^\s]+)/;

    let releasedPackages: Package[] = [];

    for (let line of changesetPublishOutput.stdout.split("\n")) {
      let match = line.match(newTagRegex);
      if (match === null) {
        continue;
      }
      let pkgName = match[1];
      let pkg = packagesByName.get(pkgName);
      if (pkg === undefined) {
        return core.setFailed(
          `Package "${pkgName}" not found.` +
            "This is probably a bug in the action, please open an issue"
        );
      }
      releasedPackages.push(pkg);
    }

    await Promise.all(
      releasedPackages.map(async pkg => {
        try {
          let changelogFileName = path.join(pkg.dir, "CHANGELOG.md");

          let changelog = await fs.readFile(changelogFileName, "utf8");

          let changelogEntry = getChangelogEntry(
            changelog,
            pkg.packageJson.version
          );
          if (!changelogEntry) {
            // we can find a changelog but not the entry for this version
            // if this is true, something has probably gone wrong
            return core.setFailed(
              `Could not find changelog entry for ${pkg.packageJson.name}@${pkg.packageJson.version}`
            );
          }

          await octokit.repos.createRelease({
            tag_name: `${pkg.packageJson.name}@${pkg.packageJson.version}`,
            body: changelogEntry.content,
            prerelease: pkg.packageJson.version.includes("-"),
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

    if (releasedPackages.length) {
      core.setOutput("published", "true");
      core.setOutput(
        "publishedPackages",
        JSON.stringify(
          releasedPackages.map(pkg => ({
            name: pkg.packageJson.name,
            version: pkg.packageJson.version
          }))
        )
      );
    }

    return;
  }

  if (hasChangesets) {
    let versionBranch = `changeset-release/${branch}`;
    let { stderr } = await execWithOutput("git", ["checkout", versionBranch], {
      ignoreReturnCode: true
    });
    let isCreatingChangesetReleaseBranch = !stderr
      .toString()
      .includes(`Switched to a new branch '${versionBranch}'`);
    if (isCreatingChangesetReleaseBranch) {
      await exec("git", ["checkout", "-b", versionBranch]);
    }

    await exec("git", ["reset", "--hard", github.context.sha]);

    if (inputs.versionScript) {
      let [versionCommand, ...versionArgs] = inputs.versionScript.split(/\s+/);
      await exec(versionCommand, versionArgs);
    } else {
      let changesetsCliPkgJson = await fs.readJson(
        path.join("node_modules", "@changesets", "cli", "package.json")
      );
      let cmd = semver.lt(changesetsCliPkgJson.version, "2.0.0")
        ? "bump"
        : "version";
      await exec("node", ["./node_modules/@changesets/cli/bin.js", cmd]);
    }

    let searchQuery = `repo:${repo}+state:open+head:${versionBranch}+base:${branch}`;
    let searchResultPromise = octokit.search.issuesAndPullRequests({
      q: searchQuery
    });
    let changedPackages = await getChangedPackages(process.cwd());

    let prBodyPromise = (async () => {
      return (
        `This PR was opened by the [Changesets release](https://github.com/changesets/action) GitHub action. When you're ready to do a release, you can merge this and ${
          inputs.publishScript
            ? `the packages will be published to npm automatically`
            : `publish to npm yourself or [setup this action to publish automatically](https://github.com/changesets/action#with-publishing)`
        }. If you're not ready to do a release yet, that's fine, whenever you add more changesets to ${branch}, this PR will be updated.
${
  isInPreMode
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
            changedPackages.map(async pkg => {
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
                  entry.content
              };
            })
          )
        )
          .filter(x => x)
          .sort(sortTheThings)
          .map(x => x.content)
          .join("\n ")
      );
    })();

    const prTitle = `${inputs.prTitle}${
      isInPreMode ? ` (${preState.tag})` : ""
    }`;
    const commitMsg = `${inputs.commit}${
      isInPreMode ? ` (${preState.tag})` : ""
    }`;

    await exec("git", ["add", "."]);
    await exec("git", ["commit", "-m", commitMsg]);
    await exec("git", ["push", "origin", versionBranch, "--force"]);
    let searchResult = await searchResultPromise;
    console.log(JSON.stringify(searchResult.data, null, 2));
    if (searchResult.data.items.length === 0) {
      console.log("creating pull request");
      await octokit.pulls.create({
        base: branch,
        head: versionBranch,
        title: prTitle,
        body: await prBodyPromise,
        ...github.context.repo
      });
    } else {
      octokit.pulls.update({
        pull_number: searchResult.data.items[0].number,
        title: prTitle,
        body: await prBodyPromise,
        ...github.context.repo
      });
      console.log("pull request found");
    }
  }
})().catch(err => {
  console.error(err);
  core.setFailed(err.message);
});
