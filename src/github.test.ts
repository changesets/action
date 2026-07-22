import { Buffer } from "node:buffer";
import { exec, getExecOutput } from "@actions/exec";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GitHub } from "./github.ts";

vi.mock("@actions/exec", () => ({
  exec: vi.fn(),
  getExecOutput: vi.fn(),
}));

vi.mock("@actions/github", () => ({
  context: {
    repo: {
      owner: "changesets",
      repo: "action",
    },
    serverUrl: "https://github.com",
    sha: "base-sha",
  },
  getOctokit: () => ({}),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("GitHub", () => {
  it("clears inherited git auth headers before adding the github-token header", async () => {
    vi.mocked(getExecOutput)
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: "",
        stderr: "",
      })
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout:
          "https://x-access-token:remote-token@github.com/changesets/action\n",
        stderr: "",
      });
    vi.mocked(exec).mockResolvedValue(0);
    vi.stubEnv("GIT_CONFIG_COUNT", "1");
    vi.stubEnv("GIT_CONFIG_KEY_0", "http.https://github.com/.extraheader");
    vi.stubEnv("GIT_CONFIG_VALUE_0", "AUTHORIZATION: basic checkout-token");

    const github = new GitHub({
      cwd: "/repo",
      githubToken: "custom-token",
      commitMode: "git-cli",
    });

    await github.pushChanges({
      branch: "changeset-release/main",
      message: "Version Packages",
    });

    expect(getExecOutput).toHaveBeenNthCalledWith(
      2,
      "git",
      ["remote", "get-url", "--push", "--all", "origin"],
      {
        cwd: "/repo",
        ignoreReturnCode: true,
        silent: true,
      },
    );
    expect(exec).toHaveBeenCalledWith(
      "git",
      ["push", "origin", "HEAD:changeset-release/main", "--force"],
      expect.objectContaining({
        env: expect.objectContaining({
          GIT_CONFIG_COUNT: "5",
          GIT_CONFIG_KEY_1: "http.https://github.com/.extraheader",
          GIT_CONFIG_VALUE_1: "",
          GIT_CONFIG_KEY_2: "http.https://github.com/.extraheader",
          GIT_CONFIG_VALUE_2: `AUTHORIZATION: basic ${Buffer.from(
            "x-access-token:custom-token",
          ).toString("base64")}`,
          GIT_CONFIG_KEY_3:
            "http.https://x-access-token@github.com/changesets/action.extraheader",
          GIT_CONFIG_VALUE_3: "",
          GIT_CONFIG_KEY_4:
            "http.https://x-access-token@github.com/changesets/action.extraheader",
          GIT_CONFIG_VALUE_4: `AUTHORIZATION: basic ${Buffer.from(
            "x-access-token:custom-token",
          ).toString("base64")}`,
        }),
      }),
    );
  });
});
