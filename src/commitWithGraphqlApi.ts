import * as core from "@actions/core";
import * as github from "@actions/github";
import * as exec from "@actions/exec";
import { graphql } from "@octokit/graphql";
import * as fs from "node:fs";
import * as process from "node:process";

interface Options {
  adds: string[];
  deletes: string[];
  message: string;
  repository: string;
  branch: string;
  headSHA?: string;
}

async function ghcommit(options: Options) {
  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) {
    core.setFailed("GITHUB_TOKEN environment variable must be set");
    return;
  }

  if (!options.message) {
    core.setFailed("Commit message is required");
    return;
  }

  if (options.adds.length === 0 && options.deletes.length === 0) {
    core.setFailed("No files to commit.");
    return;
  }

  const graphqlWithAuth = graphql.defaults({
    headers: {
      authorization: `token ${githubToken}`,
    },
  });

  const [headline, body] = parseMessage(options.message);

  const expectedHeadOid =
    options.headSHA ?? github.context.payload.pull_request?.head.sha;

  const additions = await Promise.all(
    options.adds.map(async (filePath) => ({
      path: filePath,
      contents: await base64EncodeFile(filePath),
    }))
  );

  const deletions = options.deletes.map((filePath) => ({
    path: filePath,
  }));

  const mutation = `
    mutation createCommitOnBranch($input: CreateCommitOnBranchInput!) {
      createCommitOnBranch(input: $input) {
        commit {
          url
        }
      }
    }
  `;

  const input = {
    branch: {
      repositoryNameWithOwner: options.repository,
      branchName: options.branch,
    },
    message: {
      headline,
      body,
    },
    fileChanges: {
      additions,
      deletions,
    },
    expectedHeadOid,
  };

  try {
    const response = await graphqlWithAuth<{
      createCommitOnBranch: { commit: { url: string } };
    }>(mutation, { input });
    core.info(`graphql response: ${response}`);
    core.info(
      `Success. New commit: ${response.createCommitOnBranch.commit.url}`
    );
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(`Failed to create commit: ${error.message}`);
    } else {
      core.setFailed("Failed to create commit: An unknown error occurred");
    }
  }
}

function parseMessage(msg: string): [string, string] {
  const parts = msg.split("\n", 2);
  return [parts[0], parts[1] || ""];
}

async function base64EncodeFile(filePath: string): Promise<string> {
  const fileContent = await fs.promises.readFile(filePath);
  return fileContent.toString("base64");
}

export async function commitWithGraphqlApi({
  commitMessage,
  repo,
  branch,
}: {
  commitMessage: string;
  repo: string;
  branch: string;
}) {
  try {
    const filePatterns = ["**/package.json", "**/CHANGELOG.md", ".changeset/*"];

    const workspace = process.env.GITHUB_WORKSPACE;
    if (!workspace) {
      throw new Error("GITHUB_WORKSPACE environment variable is not set");
    }

    // Configure git to allow the workspace directory
    await exec.exec("git", [
      "config",
      "--global",
      "--add",
      "safe.directory",
      workspace,
    ]);

    const adds: string[] = [];
    const deletes: string[] = [];

    // Get the git status in porcelain format
    const gitStatusOutput = await getGitStatus(filePatterns);

    for (const line of gitStatusOutput.split("\0")) {
      if (!line) continue;

      const indexStatus = line[0];
      const treeStatus = line[1];
      const filename = line.slice(3);

      if (indexStatus === "R" || treeStatus === "R") {
        const [oldFilename, newFilename] = filename.split("\0");
        core.info(
          `Renamed file detected: Old Filename: ${oldFilename}, New Filename: ${newFilename}`
        );
        adds.push(newFilename);
        deletes.push(oldFilename);
        continue;
      }

      core.info(`Filename: ${filename}`);
      core.info(`Index Status: ${indexStatus}`);
      core.info(`Tree Status: ${treeStatus}`);

      if (
        ["A", "M", "T"].includes(treeStatus) ||
        ["A", "M", "T"].includes(indexStatus)
      ) {
        adds.push(filename);
      }

      if (["D"].includes(treeStatus) || ["D"].includes(indexStatus)) {
        deletes.push(filename);
      }
    }

    if (adds.length === 0 && deletes.length === 0) {
      core.info("No changes detected, exiting");
      return;
    }

    const ghcommitArgs = [
      "-b",
      branch,
      "-r",
      repo,
      "-m",
      commitMessage,
      ...adds.map((file) => `--add=${file}`),
      ...deletes.map((file) => `--delete=${file}`),
    ];

    core.info(`ghcommit args: ${ghcommitArgs.join(" ")}`);

    await ghcommit({
      branch,
      repository: repo,
      message: commitMessage,
      adds,
      deletes,
    });
  } catch (error: any) {
    core.setFailed(error.message);
  }
}

async function getGitStatus(filePatterns: string[]): Promise<string> {
  const args = ["status", "-s", "--porcelain=v1", "-z", "--", ...filePatterns];
  return execCommand("git", args);
}

function execCommand(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    let output = "";
    let error = "";

    const options = {
      listeners: {
        stdout: (data: Buffer) => (output += data.toString()),
        stderr: (data: Buffer) => (error += data.toString()),
      },
    };

    exec
      .exec(command, args, options)
      .then(() => resolve(output))
      .catch((err) => reject(new Error(`${err.message}\n${error}`)));
  });
}
