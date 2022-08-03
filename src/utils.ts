import { exec } from "@actions/exec";
import resolveFrom from "resolve-from";
import fs from "fs-extra";

export async function execWithOutput(
  command: string,
  args?: string[],
  options?: { ignoreReturnCode?: boolean; cwd?: string }
) {
  let myOutput = "";
  let myError = "";

  return {
    code: await exec(command, args, {
      listeners: {
        stdout: (data: Buffer) => {
          myOutput += data.toString();
        },
        stderr: (data: Buffer) => {
          myError += data.toString();
        },
      },

      ...options,
    }),
    stdout: myOutput,
    stderr: myError,
  };
}

export function extractPublishedPackages(
  line: string
): { name: string; version: string } | null {
  let newTagRegex = /New tag:\s+(@[^/]+\/[^@]+|[^/]+)@([^\s]+)/;
  let match = line.match(newTagRegex);

  if (match === null) {
    let npmOutRegex = /Publishing "(.*?)" at "(.*?)"/;
    match = line.match(npmOutRegex);
  }

  if (match) {
    const [, name, version] = match;
    return { name, version };
  }

  return null;
}

export const requireChangesetsCliPkgJson = (cwd: string) => {
  try {
    return require(resolveFrom(cwd, "@changesets/cli/package.json"));
  } catch (err) {
    if (err && (err as any).code === "MODULE_NOT_FOUND") {
      throw new Error(
        `Have you forgotten to install \`@changesets/cli\` in "${cwd}"?`
      );
    }
    throw err;
  }
};

export const setupGitUser = async () => {
  await exec("git", ["config", "user.name", `"github-actions[bot]"`]);
  await exec("git", [
    "config",
    "user.email",
    `"github-actions[bot]@users.noreply.github.com"`,
  ]);
};

export async function configureNpmRc(npmToken: string) {
  let userNpmrcPath = `${process.env.HOME}/.npmrc`;

  if (fs.existsSync(userNpmrcPath)) {
    console.log("Found existing user .npmrc file");
    const userNpmrcContent = await fs.readFile(userNpmrcPath, "utf8");
    const authLine = userNpmrcContent.split("\n").find((line) => {
      // check based on https://github.com/npm/cli/blob/8f8f71e4dd5ee66b3b17888faad5a7bf6c657eed/test/lib/adduser.js#L103-L105
      return /^\s*\/\/registry\.npmjs\.org\/:[_-]authToken=/i.test(line);
    });
    if (authLine) {
      console.log(
        "Found existing auth token for the npm registry in the user .npmrc file"
      );
    } else {
      console.log(
        "Didn't find existing auth token for the npm registry in the user .npmrc file, creating one"
      );
      fs.appendFileSync(
        userNpmrcPath,
        `\n//registry.npmjs.org/:_authToken=${npmToken}\n`
      );
    }
  } else {
    console.log("No user .npmrc file found, creating one");
    fs.writeFileSync(
      userNpmrcPath,
      `//registry.npmjs.org/:_authToken=${npmToken}\n`
    );
  }
}
