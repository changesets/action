import { spawn } from "node:child_process";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

type RecordedRequest = {
  method: string;
  url: string;
  headers: Record<string, string[]>;
};

function recordRequest(request: IncomingMessage): RecordedRequest {
  const headers: Record<string, string[]> = {};
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    const name = request.rawHeaders[index]?.toLowerCase();
    if (name === undefined) continue;
    (headers[name] ??= []).push(request.rawHeaders[index + 1] ?? "");
  }
  return {
    method: request.method ?? "GET",
    url: request.url ?? "/",
    headers,
  };
}

async function runGitHttpBackend(
  request: IncomingMessage,
  response: ServerResponse,
  projectRoot: string,
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
    GIT_PROJECT_ROOT: projectRoot,
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

export async function createGitHttpServer(options: {
  projectRoot: string;
  expectedAuthorization: string;
}) {
  const requests: RecordedRequest[] = [];
  const server = http.createServer((request, response) => {
    const recordedRequest = recordRequest(request);
    requests.push(recordedRequest);
    const authorizationHeaders = recordedRequest.headers.authorization ?? [];

    if (
      authorizationHeaders.length !== 1 ||
      authorizationHeaders[0] !== options.expectedAuthorization
    ) {
      response.writeHead(401, {
        "WWW-Authenticate": 'Basic realm="changesets-action-test"',
      });
      response.end();
      return;
    }

    void runGitHttpBackend(request, response, options.projectRoot).catch(
      (error: unknown) => {
        response.destroy(
          error instanceof Error ? error : new Error(String(error)),
        );
      },
    );
  });

  await new Promise<void>((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;

  return {
    origin: `http://127.0.0.1:${address.port}`,
    requests,
    async [Symbol.asyncDispose]() {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
  };
}
