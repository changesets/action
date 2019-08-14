import * as core from "@actions/core";
import { exec } from "@actions/exec";
import * as github from "@actions/github";
import fs from "fs-extra";

async function execWithOutput(command: string, args?: string[]) {
  let myOutput = "";
  let myError = "";

  const options = {
    listeners: {
      stdout: (data: Buffer) => {
        myOutput += data.toString();
      },
      stderr: (data: Buffer) => {
        myError += data.toString();
      }
    }
  };
  return {
    code: await exec(command, args, options),
    stdout: myOutput,
    stderr: myError
  };
}

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

  await exec("git", [
    "remote",
    "add",
    "gh-https",
    `https://github.com/${repo}`
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
  if (!hasChangesets && publishScript) {
    console.log(
      "No changesets found, attempting to publish any unpublished packages to npm"
    );
    fs.writeFileSync(
      `${process.env.HOME}/.npmrc`,
      `//registry.npmjs.org/:_authToken=${process.env.NPM_TOKEN}`
    );

    let [publishCommand, ...publishArgs] = publishScript.split(/\s+/);

    await exec(publishCommand, publishArgs);

    await exec("git", ["push", "--follow-tags", "gh-https", "master"]);

    return;
  }

  let { stderr } = await execWithOutput("git", [
    "checkout",
    "changeset-release"
  ]);
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
      "master"
    ]);
    const divergedAt = cmd.stdout.trim();

    let diffOutput = await execWithOutput("git", [
      "diff",
      "--name-only",
      `${divergedAt}...master`
    ]);
    const files = diffOutput.stdout.trim();
    shouldBump = files.includes(".changeset");
    console.log("checked if new changesets should be added " + shouldBump);
  }
  if (shouldBump) {
    await exec("git", ["reset", "--hard", "master"]);
    await exec("yarn", ["changeset", "bump"]);
    await exec("git", ["add", "."]);
    await exec("git", ["commit", "-m", "Version Packages"]);
    await exec("git", ["push", "gh-https", "changeset-release", "--force"]);
    let searchQuery = `repo:${repo}+state:open+head:changeset-release+base:master`;
    let searchResult = await octokit.search.issuesAndPullRequests({
      q: searchQuery
    });
    console.log(JSON.stringify(searchResult.data, null, 2));
    if (searchResult.data.items.length === 0) {
      console.log("creating pull request");
      await octokit.pulls.create({
        base: "master",
        head: "changeset-release",
        title: "Version Packages",
        ...github.context.repo
      });
    } else {
      console.log("pull request found");
    }
  } else {
    console.log("no new changesets");
  }
})();
