import {
  execWithOutput,
  extractPublishedPackages,
  requireChangesetsCliPkgJson,
} from "./utils";
import resolveFrom from "resolve-from";

type PublishOptions = {
  tagName: string;
  cwd?: string;
};

export type PublishedPackage = { name: string; version: string };

export type PublishResult =
  | {
      published: true;
      publishedPackages: PublishedPackage[];
    }
  | {
      published: false;
    };

export async function runVersion({
  tagName,
  cwd = process.cwd(),
}: PublishOptions) {
  requireChangesetsCliPkgJson(cwd);
  console.info(`Running version workflow from cwd:`, cwd);

  let changesetVersionOutput = await execWithOutput(
    "node",
    [
      resolveFrom(cwd, "@changesets/cli/bin.js"),
      "version",
      "--snapshot",
      tagName,
    ],
    {
      cwd,
    }
  );

  if (changesetVersionOutput.code !== 0) {
    throw new Error(
      "Changeset command exited with non-zero code. Please check the output and fix the issue."
    );
  }
}

export async function runPublish({
  tagName,
  cwd = process.cwd(),
}: PublishOptions): Promise<PublishResult> {
  requireChangesetsCliPkgJson(cwd);
  console.info(`Running publish workflow...`);

  let changesetPublishOutput = await execWithOutput(
    "node",
    [
      resolveFrom(cwd, "@changesets/cli/bin.js"),
      "publish",
      "--no-git-tag",
      "--tag",
      tagName,
    ],
    {
      env: {
        // changesets cli outputs stuff with ASCII colors which can polute the stdout with
        // color characters and therefore incorrectly parse which packages have been published
        NO_COLOR: "1",
      },
      cwd,
    }
  );

  if (changesetPublishOutput.code !== 0) {
    throw new Error(
      "Changeset command exited with non-zero code. Please check the output and fix the issue."
    );
  }

  let releasedPackages: PublishedPackage[] = [];

  for (let line of changesetPublishOutput.stdout.split("\n")) {
    let match = extractPublishedPackages(line);

    if (match === null) {
      continue;
    }

    releasedPackages.push(match);
  }

  const publishedAsString = releasedPackages
    .map((t) => `${t.name}@${t.version}`)
    .join("\n");

  const released = releasedPackages.length > 0;

  if (released) {
    console.info(
      `Published the following pakages (total of ${releasedPackages.length}): ${publishedAsString}`
    );
  } else {
    console.info(`No packages were published...`);
  }

  if (releasedPackages.length) {
    return {
      published: true,
      publishedPackages: releasedPackages,
    };
  }

  return { published: false };
}
