import { exec } from "@actions/exec";
import fs from "node:fs";
import path from "node:path";
import pkgJson from "../package.json" with { type: "json" };

process.chdir(path.join(import.meta.dirname, ".."));

await exec("changeset", ["version"]);

const releaseLine = `v${pkgJson.version.split(".")[0]}`;

const readmePath = path.join(import.meta.dirname, "..", "README.md");
const content = fs.readFileSync(readmePath, "utf8");
const updatedContent = content.replace(
  /changesets\/action@[^\s]+/g,
  `changesets/action@${releaseLine}`
);
fs.writeFileSync(readmePath, updatedContent);
