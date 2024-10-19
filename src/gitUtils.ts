import { exec, getExecOutput } from "@actions/exec";

export const setupUser = async () => {
  await exec("git", [
    "config",
    "user.name",
    `"github-actions[bot]"`,
  ]);
  await exec("git", [
    "config",
    "user.email",
    `"github-actions[bot]@users.noreply.github.com"`,
  ]);
};