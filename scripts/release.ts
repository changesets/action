import { exec, getExecOutput } from "@actions/exec";
import path from "node:path";

import pkgJson from "../package.json" with { type: "json" };

const tag = `v${pkgJson.version}`;
const releaseLine = `v${pkgJson.version.split(".")[0]}`;

process.chdir(path.join(import.meta.dirname, ".."));

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

  await exec("git", ["checkout", "--detach"]);
  await exec("git", ["add", "--force", "dist"]);
  await exec("git", ["commit", "-m", tag]);

  await exec("changeset", ["tag"]);

  await exec("git", [
    "push",
    "--force",
    "--follow-tags",
    "origin",
    `HEAD:refs/heads/${releaseLine}`,
  ]);
})();
