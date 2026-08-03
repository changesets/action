import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fsp from "node:fs/promises";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createFixture, type FileTree } from "fs-fixture";
import { exec } from "tinyexec";
import { moveDisposable } from "./utils.ts";

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

async function runGitHttpBackend(
  cwd: string,
  request: IncomingMessage,
  response: ServerResponse,
) {
  const requestUrl = new URL(
    request.url ?? "/",
    `http://${request.headers.host ?? "localhost"}`,
  );
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CONTENT_LENGTH: request.headers["content-length"] ?? "0",
    GATEWAY_INTERFACE: "CGI/1.1",
    GIT_HTTP_EXPORT_ALL: "1",
    GIT_PROJECT_ROOT: cwd,
    PATH_INFO: decodeURIComponent(requestUrl.pathname),
    QUERY_STRING: requestUrl.search.slice(1),
    REMOTE_ADDR: request.socket.remoteAddress ?? "",
    REQUEST_METHOD: request.method ?? "GET",
    SERVER_PROTOCOL: `HTTP/${request.httpVersion}`,
  };
  if (request.headers["content-type"] !== undefined) {
    env.CONTENT_TYPE = request.headers["content-type"];
  }

  const backend = spawn("git", ["http-backend"], {
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  request.pipe(backend.stdin);

  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  backend.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
  backend.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));

  const exitCode = await new Promise<number | null>((resolve, reject) => {
    backend.on("error", reject);
    backend.on("close", resolve);
  });
  if (exitCode !== 0) {
    throw new Error(
      `git http-backend exited with ${exitCode}: ${Buffer.concat(stderr).toString("utf8")}`,
    );
  }

  const output = Buffer.concat(stdout);
  let separator = Buffer.from("\r\n\r\n");
  let headerEnd = output.indexOf(separator);
  if (headerEnd === -1) {
    separator = Buffer.from("\n\n");
    headerEnd = output.indexOf(separator);
  }
  if (headerEnd === -1) {
    throw new Error("git http-backend returned an invalid CGI response");
  }

  let status = 200;
  const headers = output.subarray(0, headerEnd).toString("utf8").split(/\r?\n/);
  for (const header of headers) {
    const separatorIndex = header.indexOf(":");
    if (separatorIndex === -1) continue;

    const name = header.slice(0, separatorIndex);
    const value = header.slice(separatorIndex + 1).trim();
    if (name.toLowerCase() === "status") {
      status = Number.parseInt(value, 10);
    } else {
      response.setHeader(name, value);
    }
  }

  response.writeHead(status);
  response.end(output.subarray(headerEnd + separator.length));
}

async function listen(server: http.Server) {
  const waiter = Promise.withResolvers();

  server.on("listening", waiter.resolve);
  server.on("error", waiter.reject);

  server.listen(0);

  try {
    await waiter.promise;
    return server;
  } finally {
    server.off("listening", waiter.resolve);
    server.off("error", waiter.reject);
  }
}

type RecordedRequest = {
  method: string;
  url: string;
  headers: NodeJS.Dict<string[]>;
};

function recordRequest(request: IncomingMessage): RecordedRequest {
  return {
    method: request.method ?? "GET",
    url: request.url ?? "/",
    headers: request.headersDistinct,
  };
}

async function createGitHttpServer(cwd: string) {
  const requests: RecordedRequest[] = [];
  const server = http.createServer((request, response) => {
    const recordedRequest = recordRequest(request);
    requests.push(recordedRequest);

    void runGitHttpBackend(cwd, request, response).catch((error: unknown) => {
      response.destroy(
        Error.isError(error)
          ? error
          : new Error("Server error", { cause: error }),
      );
    });
  });

  await listen(server);
  const address = server.address();
  assert(
    !!address && typeof address !== "string",
    "Failed to get server address",
  );

  return {
    origin: `http://127.0.0.1:${address.port}`,
    requests,
    async [Symbol.asyncDispose]() {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
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

export async function createGitHttpRemote(files: Fixture) {
  await using stack = new AsyncDisposableStack();
  const fixture = stack.use(await createLocalRemote(files));
  const server = stack.use(
    await createGitHttpServer(path.dirname(fixture.path)),
  );

  return moveDisposable(stack, {
    path: fixture.path,
    url: `${server.origin}/${path.basename(fixture.path)}`,
    requests: server.requests,
  });
}
