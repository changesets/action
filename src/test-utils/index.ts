import fsp from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createFixture, type FileTree } from "fs-fixture";
import { exec } from "tinyexec";
import { moveDisposable } from "../utils.ts";
import { createGitHttpServer } from "./gitHttpServer.ts";

export type Fixture = FileTree;

export async function testdir(dir?: Fixture) {
  return createFixture(dir, {
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
  await using stack = new AsyncDisposableStack();
  const fixture = stack.use(
    await testdir({
      ".gitattributes": "* text=auto eol=lf\n",
      ...dir,
    }),
  );
  const cwd = fixture.path;

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

  return moveDisposable(stack, fixture);
}

async function createLocalRemote(dir: Fixture) {
  await using stack = new AsyncDisposableStack();
  const fixture = stack.use(await testdir());
  const remote = fixture.path;
  {
    // Use a working repository to create the bare remote's initial history.
    // Once cloned, the remote owns that history and the source can be disposed.
    await using sourceFixture = await gitdir(dir);
    await exec(
      "git",
      ["clone", "--bare", pathToFileURL(sourceFixture.path).toString(), "."],
      {
        nodeOptions: { cwd: remote },
        throwOnError: true,
      },
    );
  }
  await disableGitBackgroundMaintenance(remote);
  await exec("git", ["config", "http.receivepack", "true"], {
    nodeOptions: { cwd: remote },
    throwOnError: true,
  });
  return moveDisposable(stack, fixture);
}

export async function createGitHttpRemote(
  expectedAuthorization: string,
  files: Fixture,
) {
  await using stack = new AsyncDisposableStack();
  const fixture = stack.use(await createLocalRemote(files));
  const server = stack.use(
    await createGitHttpServer({
      projectRoot: path.dirname(fixture.path),
      expectedAuthorization,
    }),
  );

  return moveDisposable(stack, {
    path: fixture.path,
    url: `${server.origin}/${path.basename(fixture.path)}`,
    requests: server.requests,
  });
}

export async function shallowClone(cwd: string, depth = 1) {
  await using stack = new AsyncDisposableStack();
  const fixture = stack.use(await testdir());
  await exec(
    "git",
    ["clone", "--depth", depth.toString(), pathToFileURL(cwd).toString(), "."],
    {
      nodeOptions: { cwd: fixture.path },
      throwOnError: true,
    },
  );
  await disableGitBackgroundMaintenance(fixture.path);
  return moveDisposable(stack, fixture);
}
