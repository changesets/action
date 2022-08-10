const path = require("path");
const { exec, getExecOutput } = require("@actions/exec");

const { version } = require("../package.json");
const tag = `v${version}`;
const releaseLine = `v${version.split(".")[0]}`;

process.chdir(path.join(__dirname, ".."));

(async () => {
  const { exitCode, stderr } = await getExecOutput(
    `git`,
    ["ls-remote", "--exit-code", "origin", "--tags", `refs/tags/${tag}`],
    {
      ignoreReturnCode: true,
    }
  );
  if (exitCode === 0) {
    console.log(
      `Action is not being published because version ${tag} is already published`
    );
    return;
  }
  if (exitCode !== 2) {
    throw new Error(`git ls-remote exited with ${exitCode}:\n${stderr}`);
  }

  console.log("执行到这里了");
  await exec("git", ["checkout", "--detach"]);
  await exec("git", ["add", "--force", "dist"]);
  await exec("git", ["commit", "-m", tag]);

  console.log("tag", tag);
  await exec("changeset", ["tag"]);
  console.log("releaseLine", releaseLine);
  await exec("git", [
    "push",
    "--force",
    "--follow-tags",
    "origin",
    `HEAD:refs/heads/${releaseLine}`,
  ]);
})();
