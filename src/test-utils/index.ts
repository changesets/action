import fsp from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createFixture, type FileTree } from "fs-fixture";
import { exec } from "tinyexec";
import { onTestFinished } from "vitest";

export type Fixture = FileTree;

export async function testdir(dir?: Fixture) {
  const fixture = await createFixture(dir, {
    fs: {
      ...fsp,
      rm: (filePath, options) =>
        fsp.rm(filePath, {
          maxRetries: 3,
          retryDelay: 100,
          ...options,
        }),
    },
  });
  onTestFinished(() => fixture.rm());
  return fixture.path;
}

// Git maintenance can race with fixture cleanup by touching pack files.
export async function disableGitBackgroundMaintenance(cwd: string) {
  await exec("git", ["config", "gc.auto", "0"], {
    nodeOptions: { cwd },
    throwOnError: true,
  });
  await exec("git", ["config", "maintenance.auto", "false"], {
    nodeOptions: { cwd },
    throwOnError: true,
  });
}

export async function gitdir(dir: Fixture) {
  const cwd = await testdir({
    ".gitattributes": "* text=auto eol=lf\n",
    ...dir,
  });

  await exec("git", ["init"], {
    nodeOptions: { cwd },
    throwOnError: true,
  });
  await disableGitBackgroundMaintenance(cwd);

  const { stdout } = await exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    nodeOptions: { cwd },
  });
  if (stdout.trim() !== "main") {
    await exec("git", ["checkout", "-b", "main"], {
      nodeOptions: { cwd },
      throwOnError: true,
    });
  }

  const gitConfig = `
[user]
    email = x@y.z
    name = xyz
[commit]
    gpgSign = false
[tag]
    gpgSign = false
    forceSignAnnotated = false
  `.trim();
  await fsp.appendFile(path.join(cwd, ".git/config"), gitConfig, "utf8");

  await exec("git", ["add", "."], {
    nodeOptions: { cwd },
    throwOnError: true,
  });
  await exec("git", ["commit", "-m", "initial commit", "--allow-empty"], {
    nodeOptions: { cwd },
    throwOnError: true,
  });

  return cwd;
}

export async function createLocalRemote(cwd: string) {
  const remote = await testdir();
  await exec("git", ["clone", "--bare", pathToFileURL(cwd).toString(), "."], {
    nodeOptions: { cwd: remote },
    throwOnError: true,
  });
  await disableGitBackgroundMaintenance(remote);
  await exec("git", ["config", "http.receivepack", "true"], {
    nodeOptions: { cwd: remote },
    throwOnError: true,
  });
  return remote;
}
