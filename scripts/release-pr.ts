import { exec } from "@actions/exec";
import path from "node:path";

import pkgJson from "../package.json" with { type: "json" };

const tag = `v${pkgJson.version}`;
const releaseLine = "pr-release";

process.chdir(path.join(__dirname, ".."));

await exec("git", ["checkout", "--detach"]);
await exec("git", ["add", "--force", "dist"]);
await exec("git", ["commit", "-m", tag]);

await exec("git", [
  "push",
  "--force",
  "origin",
  `HEAD:refs/heads/${releaseLine}`,
]);
