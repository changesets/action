import { Buffer } from "node:buffer";
import path from "node:path";
import { exec, getExecOutput } from "@actions/exec";
import major from "semver/functions/major.js";
import prerelease from "semver/functions/prerelease.js";
import pkgJson from "../package.json" with { type: "json" };

const tag = `v${pkgJson.version}`;
const prereleaseTag = prerelease(pkgJson.version)?.[0];
const releaseLine = `v${major(pkgJson.version)}${
  prereleaseTag === undefined ? "" : `-${prereleaseTag}`
}`;
const githubToken = process.env.GITHUB_TOKEN;
if (!githubToken) {
  throw new Error("GITHUB_TOKEN is required");
}
const basic = Buffer.from(`x-access-token:${githubToken}`).toString("base64");
const gitEnv = {
  ...process.env,
  GIT_CONFIG_COUNT: "1",
  GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
  GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${basic}`,
};

process.chdir(path.join(import.meta.dirname, ".."));

await exec("git", ["checkout", "--detach"]);
// Stable timestamps make retries produce the same commit when dist is unchanged.
const { stdout } = await getExecOutput("git", [
  "show",
  "--no-patch",
  "--format=%cI",
  "HEAD",
]);
const commitDate = stdout.trim();
await exec("git", ["add", "--force", "dist"]);
await exec("git", ["commit", "-m", tag], {
  env: {
    ...process.env,
    GIT_AUTHOR_DATE: commitDate,
    GIT_COMMITTER_DATE: commitDate,
  },
});

await exec("changeset", ["git-tag"]);

await exec(
  "git",
  [
    "push",
    "--force",
    // The action pushes tags through the API; override any push.followTags config.
    "--no-follow-tags",
    "origin",
    `HEAD:refs/heads/${releaseLine}`,
  ],
  {
    env: gitEnv,
  },
);
