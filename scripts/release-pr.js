const path = require("path");
const { exec, getExecOutput } = require("@actions/exec");

const { version } = require("../package.json");
const tag = `v${version}`;
const releaseLine = "pr-release";

process.chdir(path.join(__dirname, ".."));

(async () => {
  await exec("git", ["checkout", "--detach"]);
  await exec("git", ["add", "--force", "dist"]);
  await exec("git", ["commit", "-m", tag]);

  await exec("git", [
    "push",
    "--force",
    "origin",
    `HEAD:refs/heads/${releaseLine}`,
  ]);
})();
