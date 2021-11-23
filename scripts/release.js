const path = require("path");
const { exec, getExecOutput } = require("@actions/exec");
const tag = `v${require("../package.json").version}`;

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

  await exec("yarn", ["build"]);

  await exec("git", ["checkout", "--detach"]);
  await exec("git", ["add", "--force", "dist"]);
  await exec("git", ["commit", "-m", tag]);

  await exec("changeset", ["tag"]);

  await exec("git", ["push", "origin", tag]);
})();
