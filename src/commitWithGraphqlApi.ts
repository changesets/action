import * as core from "@actions/core";
import * as github from "@actions/github";
import { exec } from "@actions/exec";
import { graphql } from "@octokit/graphql";
import * as fs from "node:fs";
import * as process from "node:process";

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
    // 1) Ensure we have a GitHub token
    const githubToken = process.env.GITHUB_TOKEN;
    if (!githubToken) {
      core.setFailed("GITHUB_TOKEN environment variable must be set");
      return;
    }

    if (!commitMessage) {
      core.setFailed("A commit message is required.");
      return;
    }

    // 2) Collect changed files using Git
    const filePatterns = ["**/package.json", "**/CHANGELOG.md", ".changeset/*"];
    const workspace = process.env.GITHUB_WORKSPACE || "/github/workspace";
    if (!process.env.GITHUB_WORKSPACE) {
      core.warning(
        "GITHUB_WORKSPACE is not set. Falling back to default: /github/workspace"
      );
    }

    // Make sure Git sees our workspace as safe
    await exec("git", [
      "config",
      "--global",
      "--add",
      "safe.directory",
      workspace,
    ]);

    const gitStatusOutput = await getGitStatus(filePatterns);
    // Parse the porcelain output to gather additions and deletions
    const adds: string[] = [];
    const deletes: string[] = [];

    for (const line of gitStatusOutput.split("\0")) {
      if (!line) continue;

      const indexStatus = line[0];
      const treeStatus = line[1];
      const filename = line.slice(3);

      core.info(
        `Filename: ${filename} (index=${indexStatus}, tree=${treeStatus})`
      );

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
      core.info("No changes detected. Exiting without commit.");
      return;
    }

    // 3) Prepare the GraphQL client
    const graphqlWithAuth = graphql.defaults({
      headers: {
        authorization: `token ${githubToken}`,
      },
    });

    // We need an expected HEAD OID. If context.sha is not available,
    // fallback to the local HEAD from git.
    let expectedHeadOid = github.context.sha;
    if (!expectedHeadOid) {
      expectedHeadOid = await getLocalHeadSHA();
    }

    // Prepare base64-encoded contents for all added files
    const allAdditions = await Promise.all(
      adds.map(async (filePath) => ({
        path: filePath,
        contentBase64: await base64EncodeFile(filePath),
      }))
    );
    // Deletions are trivial in payload, so you can apply them all at once if you prefer
    const allDeletions = deletes.map((filePath) => ({ path: filePath }));

    // 4) Chunk the additions to avoid exceeding API limits
    const { chunkedAdditions, chunkedDeletions } = chunkChangesBySize(
      allAdditions,
      allDeletions,
      1000 * 1000 // ~1 MB
    );

    // 5) Commit each chunk in sequence, updating the HEAD each time
    for (let i = 0; i < chunkedAdditions.length; i++) {
      const addsSubset = chunkedAdditions[i];
      const deletesSubset = chunkedDeletions[i];

      // Prepare commit message parts
      const [headline, body] = parseMessage(commitMessage);

      const mutation = `
        mutation createCommitOnBranch($input: CreateCommitOnBranchInput!) {
          createCommitOnBranch(input: $input) {
            commit {
              url
              oid
            }
          }
        }
      `;

      const input = {
        branch: {
          repositoryNameWithOwner: repo,
          branchName: branch,
        },
        message: {
          headline,
          body,
        },
        fileChanges: {
          additions: addsSubset.map((f) => ({
            path: f.path,
            contents: f.contentBase64,
          })),
          deletions: deletesSubset,
        },
        expectedHeadOid,
      };

      core.info(
        `Creating commit #${i + 1} on ${repo}@${branch} with ${
          addsSubset.length
        } additions.`
      );

      const response = await graphqlWithAuth<{
        createCommitOnBranch: { commit: { url: string; oid: string } };
      }>(mutation, { input });

      const commitInfo = response.createCommitOnBranch.commit;
      core.info(`Success! New commit: ${commitInfo.url}`);

      // Update HEAD for the next chunk
      expectedHeadOid = commitInfo.oid;
    }
  } catch (error: any) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Retrieve the git status in a machine-readable format
 */
async function getGitStatus(filePatterns: string[]): Promise<string> {
  // -s => short format
  // --porcelain=v1 => stable, script-friendly
  // -z => separate entries with null characters
  const args = ["status", "-s", "--porcelain=v1", "-z", "--", ...filePatterns];
  return execCommand("git", args);
}

/**
 * Helper to run a shell command with GitHub Action's tooling
 */
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

    exec(command, args, options)
      .then(() => resolve(output))
      .catch((err) => reject(new Error(`${err.message}\n${error}`)));
  });
}

/**
 * Reads a file and returns its base64-encoded contents.
 */
async function base64EncodeFile(filePath: string): Promise<string> {
  try {
    const fileContent = await fs.promises.readFile(filePath);
    return fileContent.toString("base64");
  } catch (error) {
    core.error(
      `Failed to read file: ${filePath}. Error: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    throw new Error(`Unable to encode file: ${filePath}`);
  }
}

/**
 * Splits a commit message into [headline, body].
 * If there is only one line, body will be "".
 */
function parseMessage(msg: string): [string, string] {
  const parts = msg.split("\n", 2);
  return [parts[0], parts[1] ?? ""];
}

/**
 * Fallback for local HEAD if github.context.sha is not available
 */
async function getLocalHeadSHA(): Promise<string> {
  let headSha = "";
  const options = {
    listeners: {
      stdout: (data: Buffer) => {
        headSha += data.toString();
      },
    },
  };
  await exec("git", ["rev-parse", "HEAD"], options);
  return headSha.trim();
}

/**
 * Takes an array of file additions (path, base64)
 * and splits them into multiple commits if the combined
 * base64 size would exceed maxSize. Deletions are usually negligible,
 * but we can either apply them to the first chunk or distribute them similarly.
 */
function chunkChangesBySize(
  additions: { path: string; contentBase64: string }[],
  deletions: { path: string }[],
  maxSize: number
): {
  chunkedAdditions: { path: string; contentBase64: string }[][];
  chunkedDeletions: { path: string }[][];
} {
  const chunkedAdditions: { path: string; contentBase64: string }[][] = [];
  const chunkedDeletions: { path: string }[][] = [];

  let currentChunk: { path: string; contentBase64: string }[] = [];
  let currentSize = 0;
  let deletionsAdded = false;

  for (const item of additions) {
    const fileSize = item.contentBase64.length;
    // If adding this item exceeds max size, close off the current chunk
    if (currentSize + fileSize > maxSize && currentChunk.length > 0) {
      chunkedAdditions.push(currentChunk);
      // apply deletions only once (or distribute them if you prefer)
      chunkedDeletions.push(deletionsAdded ? [] : deletions);

      currentChunk = [];
      currentSize = 0;
      deletionsAdded = true;
    }

    currentChunk.push(item);
    currentSize += fileSize;
  }

  // Final chunk
  if (currentChunk.length > 0) {
    chunkedAdditions.push(currentChunk);
    chunkedDeletions.push(deletionsAdded ? [] : deletions);
  }

  return { chunkedAdditions, chunkedDeletions };
}
