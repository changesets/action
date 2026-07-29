import { Buffer } from "node:buffer";
import fs from "node:fs/promises";
import path from "node:path";
import { createFixture } from "fs-fixture";
import { exec } from "tinyexec";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GitHub } from "./github.ts";
import { createGitHttpServer } from "./test-utils/gitHttpServer.ts";

const githubContext = vi.hoisted(() => ({
  repo: {
    owner: "changesets",
    repo: "action",
  },
  serverUrl: "http://127.0.0.1",
  sha: "base-sha",
}));

vi.mock("@actions/github", () => ({
  context: githubContext,
  getOctokit: () => ({}),
}));

async function git(cwd: string, args: string[]) {
  const result = await exec("git", args, {
    nodeOptions: { cwd },
    throwOnError: true,
  });
  return result.stdout.trim();
}

async function initializeRepositories(root: string) {
  const repository = path.join(root, "repository");
  const remote = path.join(root, "remote.git");

  await git(repository, ["init", "-b", "main"]);
  await git(repository, ["config", "user.name", "Test User"]);
  await git(repository, ["config", "user.email", "test@example.com"]);
  await git(repository, ["add", "."]);
  await git(repository, ["commit", "-m", "Initial commit"]);
  await git(root, ["clone", "--bare", repository, remote]);
  await git(remote, ["config", "http.receivepack", "true"]);

  return { remote, repository };
}

function getAuthorization(token: string) {
  return `basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}`;
}

beforeEach(() => {
  vi.stubEnv("GIT_CONFIG_COUNT", "0");
  vi.stubEnv("GIT_CONFIG_NOSYSTEM", "1");
  vi.stubEnv("GIT_TERMINAL_PROMPT", "0");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GitHub", () => {
  it("defaults to GitHub API mode", () => {
    const github = new GitHub({
      cwd: "/repo",
      githubToken: "token",
    });

    expect(github.commitMode).toBe("github-api");
  });

  it("uses github-token instead of checkout's persisted header for CLI branch and tag pushes", async () => {
    await using fixture = await createFixture({
      "global.gitconfig": "",
      "repository/file.txt": "initial\n",
    });
    vi.stubEnv(
      "GIT_CONFIG_GLOBAL",
      path.join(fixture.path, "global.gitconfig"),
    );
    const { remote, repository } = await initializeRepositories(fixture.path);
    const actionToken = "action-token";
    const checkoutToken = "checkout-token";

    await using server = await createGitHttpServer({
      projectRoot: fixture.path,
      expectedAuthorization: getAuthorization(actionToken),
    });
    githubContext.serverUrl = server.origin;
    const remoteUrl = `${server.origin}/remote.git`;
    await git(repository, ["remote", "add", "origin", remoteUrl]);
    await git(repository, [
      "config",
      `http.${server.origin}/.extraheader`,
      `AUTHORIZATION: ${getAuthorization(checkoutToken)}`,
    ]);

    await fs.writeFile(path.join(repository, "file.txt"), "changed\n");
    const github = new GitHub({
      cwd: repository,
      githubToken: actionToken,
      commitMode: "git-cli",
    });

    await github.pushChanges({
      branch: "changeset-release/main",
      message: "Version Packages",
    });
    await git(repository, ["tag", "v1.0.0"]);
    await github.pushTag("v1.0.0");

    expect(
      await git(remote, ["rev-parse", "refs/heads/changeset-release/main"]),
    ).toBe(await git(repository, ["rev-parse", "HEAD"]));
    expect(await git(remote, ["rev-parse", "refs/tags/v1.0.0"])).toBe(
      await git(repository, ["rev-parse", "v1.0.0"]),
    );
    expect(server.receivedAuthorizationHeaders.length).toBeGreaterThan(0);
    expect(server.receivedAuthorizationHeaders).toEqual(
      server.receivedAuthorizationHeaders.map(() => [
        getAuthorization(actionToken),
      ]),
    );
  }, 15_000);

  it("uses github-token instead of credentials embedded in the CLI push URL", async () => {
    await using fixture = await createFixture({
      "global.gitconfig": "",
      "repository/file.txt": "initial\n",
    });
    vi.stubEnv(
      "GIT_CONFIG_GLOBAL",
      path.join(fixture.path, "global.gitconfig"),
    );
    const { remote, repository } = await initializeRepositories(fixture.path);
    const actionToken = "action-token";

    await using server = await createGitHttpServer({
      projectRoot: fixture.path,
      expectedAuthorization: getAuthorization(actionToken),
    });
    githubContext.serverUrl = server.origin;
    const remoteUrl = new URL(`${server.origin}/remote.git`);
    remoteUrl.username = "x-access-token";
    remoteUrl.password = "checkout-token";
    await git(repository, ["remote", "add", "origin", remoteUrl.href]);
    const persistedCredentialUrl = new URL(remoteUrl);
    persistedCredentialUrl.password = "";
    await git(repository, [
      "config",
      `http.${persistedCredentialUrl.href}.extraheader`,
      `AUTHORIZATION: ${getAuthorization("checkout-token")}`,
    ]);

    await fs.writeFile(path.join(repository, "file.txt"), "changed\n");
    const github = new GitHub({
      cwd: repository,
      githubToken: actionToken,
      commitMode: "git-cli",
    });

    await github.pushChanges({
      branch: "changeset-release/main",
      message: "Version Packages",
    });

    expect(
      await git(remote, ["rev-parse", "refs/heads/changeset-release/main"]),
    ).toBe(await git(repository, ["rev-parse", "HEAD"]));
    expect(server.receivedAuthorizationHeaders.length).toBeGreaterThan(0);
    expect(server.receivedAuthorizationHeaders).toEqual(
      server.receivedAuthorizationHeaders.map(() => [
        getAuthorization(actionToken),
      ]),
    );
  }, 15_000);
});
