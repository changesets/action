import { Buffer } from "node:buffer";
import path from "node:path";
import { exec } from "@actions/exec";
import pkgJson from "../package.json" with { type: "json" };

const tag = `v${pkgJson.version}`;
const releaseLine = `v${pkgJson.version.split(".")[0]}`;
const isPrerelease = pkgJson.version.includes("-");
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

await exec("git", ["config", "user.name", `"github-actions[bot]"`]);
await exec("git", [
  "config",
  "user.email",
  `"41898282+github-actions[bot]@users.noreply.github.com"`,
]);
await exec("git", ["checkout", "--detach"]);
await exec("git", ["add", "--force", "dist"]);
await exec("git", ["commit", "-m", tag]);

await exec("changeset", ["git-tag"]);

if (isPrerelease) {
  await exec("git", ["push", "origin", `refs/tags/${tag}`], {
    env: gitEnv,
  });
} else {
  await exec(
    "git",
    [
      "push",
      "--force",
      "--follow-tags",
      "origin",
      `HEAD:refs/heads/${releaseLine}`,
    ],
    {
      env: gitEnv,
    },
  );
}
