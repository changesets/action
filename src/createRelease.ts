import * as github from "@actions/github";
import type { Package } from "@manypkg/get-packages";
import fs from "node:fs/promises";
import path from "node:path";
import type { Octokit } from "./octokit.ts";
import { getChangelogEntry, isErrorWithCode } from "./utils.ts";

export const createRelease = async (
  octokit: Octokit,
  { pkg, tagName }: { pkg: Package; tagName: string }
) => {
  let changelog;
  try {
    changelog = await fs.readFile(path.join(pkg.dir, "CHANGELOG.md"), "utf8");
  } catch (err) {
    if (isErrorWithCode(err, "ENOENT")) {
      // if we can't find a changelog, the user has probably disabled changelogs
      return;
    }
    throw err;
  }
  let changelogEntry = getChangelogEntry(changelog, pkg.packageJson.version);
  if (!changelogEntry) {
    // we can find a changelog but not the entry for this version
    // if this is true, something has probably gone wrong
    throw new Error(
      `Could not find changelog entry for ${pkg.packageJson.name}@${pkg.packageJson.version}`
    );
  }

  await octokit.rest.repos.createRelease({
    name: tagName,
    tag_name: tagName,
    body: changelogEntry.content,
    prerelease: pkg.packageJson.version.includes("-"),
    ...github.context.repo,
  });
};
