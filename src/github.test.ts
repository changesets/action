import { Buffer } from "node:buffer";
import fs from "node:fs/promises";
import path from "node:path";
import { exec } from "tinyexec";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GitHub } from "./github.ts";
import { createGitHttpRemote, shallowClone, testdir } from "./test-utils.ts";

const githubContext = vi.hoisted(() => ({
  repo: {
    owner: "changesets",
    repo: "action",
  },
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

function getAuthorization(token: string) {
  return `basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}`;
}

async function isolateGitConfig() {
  const fixture = await testdir({ "global.gitconfig": "" });
  vi.stubEnv("GIT_CONFIG_GLOBAL", path.join(fixture.path, "global.gitconfig"));
  return fixture;
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

    expect(github.pushWithGitCli).toBe(false);
  });

  it("uses github-token instead of checkout's persisted header for CLI branch and tag pushes", async () => {
    await using _gitConfig = await isolateGitConfig();
    const actionToken = "action-token";
    const checkoutToken = "checkout-token";
    await using remote = await createGitHttpRemote({
      "file.txt": "initial\n",
    });
    await using repositoryFixture = await shallowClone(remote.path);
    const repository = repositoryFixture.path;

    const serverUrl = new URL(remote.url).origin;
    await git(repository, ["remote", "set-url", "origin", remote.url]);
    await git(repository, [
      "config",
      `http.${serverUrl}/.extraheader`,
      `AUTHORIZATION: ${getAuthorization(checkoutToken)}`,
    ]);

    await fs.writeFile(path.join(repository, "file.txt"), "changed\n");
    const github = new GitHub({
      cwd: repository,
      githubToken: actionToken,
      pushWithGitCli: true,
      serverUrl,
    });

    await github.pushChanges({
      branch: "changeset-release/main",
      message: "Version Packages",
    });
    await git(repository, ["tag", "v1.0.0"]);
    await github.pushTag("v1.0.0");

    expect(
      await git(remote.path, [
        "rev-parse",
        "refs/heads/changeset-release/main",
      ]),
    ).toBe(await git(repository, ["rev-parse", "HEAD"]));
    expect(await git(remote.path, ["rev-parse", "refs/tags/v1.0.0"])).toBe(
      await git(repository, ["rev-parse", "v1.0.0"]),
    );
    expect(remote.requests.length).toBeGreaterThan(0);
    expect(
      remote.requests.map((request) => request.headers.authorization),
    ).toEqual(remote.requests.map(() => [getAuthorization(actionToken)]));
  }, 15_000);

  it("uses github-token instead of credentials embedded in the CLI push URL", async () => {
    await using _gitConfig = await isolateGitConfig();
    const actionToken = "action-token";
    await using remote = await createGitHttpRemote({
      "file.txt": "initial\n",
    });
    await using repositoryFixture = await shallowClone(remote.path);
    const repository = repositoryFixture.path;

    const remoteUrl = new URL(remote.url);
    remoteUrl.username = "x-access-token";
    remoteUrl.password = "checkout-token";
    await git(repository, ["remote", "set-url", "origin", remoteUrl.href]);
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
      pushWithGitCli: true,
      serverUrl: remoteUrl.origin,
    });

    await github.pushChanges({
      branch: "changeset-release/main",
      message: "Version Packages",
    });

    expect(
      await git(remote.path, [
        "rev-parse",
        "refs/heads/changeset-release/main",
      ]),
    ).toBe(await git(repository, ["rev-parse", "HEAD"]));
    expect(remote.requests.length).toBeGreaterThan(0);
    expect(
      remote.requests.map((request) => request.headers.authorization),
    ).toEqual(remote.requests.map(() => [getAuthorization(actionToken)]));
  }, 15_000);

  it("uses the push URL when it differs from the fetch URL", async () => {
    await using _gitConfig = await isolateGitConfig();
    const actionToken = "action-token";
    await using fetchRemote = await createGitHttpRemote({
      "file.txt": "initial\n",
    });
    await using pushRemote = await createGitHttpRemote({
      "file.txt": "initial\n",
    });
    await using repositoryFixture = await shallowClone(fetchRemote.path);
    const repository = repositoryFixture.path;

    await git(repository, ["remote", "set-url", "origin", fetchRemote.url]);
    await git(repository, ["config", "remote.origin.pushurl", pushRemote.url]);

    await fs.writeFile(path.join(repository, "file.txt"), "changed\n");
    const github = new GitHub({
      cwd: repository,
      githubToken: actionToken,
      pushWithGitCli: true,
      serverUrl: new URL(fetchRemote.url).origin,
    });

    await github.pushChanges({
      branch: "changeset-release/main",
      message: "Version Packages",
    });

    expect(fetchRemote.requests).toEqual([]);
    expect(
      await git(pushRemote.path, [
        "rev-parse",
        "refs/heads/changeset-release/main",
      ]),
    ).toBe(await git(repository, ["rev-parse", "HEAD"]));
    expect(pushRemote.requests.length).toBeGreaterThan(0);
    expect(
      pushRemote.requests.map((request) => request.headers.authorization),
    ).toEqual(pushRemote.requests.map(() => [getAuthorization(actionToken)]));
  }, 15_000);

  it("uses github-token for every push URL", async () => {
    await using _gitConfig = await isolateGitConfig();
    const actionToken = "action-token";
    await using firstRemote = await createGitHttpRemote({
      "file.txt": "initial\n",
    });
    await using secondRemote = await createGitHttpRemote({
      "file.txt": "initial\n",
    });
    await using repositoryFixture = await shallowClone(firstRemote.path);
    const repository = repositoryFixture.path;

    await git(repository, [
      "config",
      "--add",
      "remote.origin.pushurl",
      firstRemote.url,
    ]);
    await git(repository, [
      "config",
      "--add",
      "remote.origin.pushurl",
      secondRemote.url,
    ]);

    await fs.writeFile(path.join(repository, "file.txt"), "changed\n");
    const github = new GitHub({
      cwd: repository,
      githubToken: actionToken,
      pushWithGitCli: true,
      serverUrl: new URL(firstRemote.url).origin,
    });

    await github.pushChanges({
      branch: "changeset-release/main",
      message: "Version Packages",
    });

    const head = await git(repository, ["rev-parse", "HEAD"]);
    for (const remote of [firstRemote, secondRemote]) {
      expect(
        await git(remote.path, [
          "rev-parse",
          "refs/heads/changeset-release/main",
        ]),
      ).toBe(head);
      expect(remote.requests.length).toBeGreaterThan(0);
      expect(
        remote.requests.map((request) => request.headers.authorization),
      ).toEqual(remote.requests.map(() => [getAuthorization(actionToken)]));
    }
  }, 15_000);

  it("preserves existing command-scoped Git config entries", async () => {
    await using _gitConfig = await isolateGitConfig();
    const actionToken = "action-token";
    await using fetchRemote = await createGitHttpRemote({
      "file.txt": "initial\n",
    });
    await using pushRemote = await createGitHttpRemote({
      "file.txt": "initial\n",
    });
    await using repositoryFixture = await shallowClone(fetchRemote.path);
    const repository = repositoryFixture.path;

    await git(repository, ["remote", "set-url", "origin", fetchRemote.url]);
    vi.stubEnv("GIT_CONFIG_COUNT", "1");
    vi.stubEnv("GIT_CONFIG_KEY_0", "remote.origin.pushurl");
    vi.stubEnv("GIT_CONFIG_VALUE_0", pushRemote.url);

    await fs.writeFile(path.join(repository, "file.txt"), "changed\n");
    const github = new GitHub({
      cwd: repository,
      githubToken: actionToken,
      pushWithGitCli: true,
      serverUrl: new URL(fetchRemote.url).origin,
    });

    await github.pushChanges({
      branch: "changeset-release/main",
      message: "Version Packages",
    });

    expect(fetchRemote.requests).toEqual([]);
    expect(
      await git(pushRemote.path, [
        "rev-parse",
        "refs/heads/changeset-release/main",
      ]),
    ).toBe(await git(repository, ["rev-parse", "HEAD"]));
    expect(pushRemote.requests.length).toBeGreaterThan(0);
    expect(
      pushRemote.requests.map((request) => request.headers.authorization),
    ).toEqual(pushRemote.requests.map(() => [getAuthorization(actionToken)]));
  }, 15_000);
});
