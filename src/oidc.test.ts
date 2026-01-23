import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getExecOutput } from "@actions/exec";
import { validateOidcEnvironment } from "./utils.ts";

vi.mock("@actions/exec");

describe("OIDC validation", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("validateOidcEnvironment", () => {
    it("passes validation with correct setup", async () => {
      vi.mocked(getExecOutput).mockResolvedValue({
        stdout: "11.6.2",
        stderr: "",
        exitCode: 0,
      });
      process.env.ACTIONS_ID_TOKEN_REQUEST_URL = "https://example.com";
      delete process.env.NPM_TOKEN;

      await expect(validateOidcEnvironment()).resolves.toBeUndefined();
    });

    it("throws error for npm version < 11.5.1", async () => {
      vi.mocked(getExecOutput).mockResolvedValue({
        stdout: "10.8.1",
        stderr: "",
        exitCode: 0,
      });
      process.env.ACTIONS_ID_TOKEN_REQUEST_URL = "https://example.com";
      delete process.env.NPM_TOKEN;

      await expect(validateOidcEnvironment()).rejects.toThrow(
        /npm version 10.8.1 detected. npm 11.5.1\+ required for OIDC/
      );
      await expect(validateOidcEnvironment()).rejects.toThrow(
        /npm install -g npm@latest/
      );
    });

    it("throws error for npm version 11.5.0 (edge case)", async () => {
      vi.mocked(getExecOutput).mockResolvedValue({
        stdout: "11.5.0",
        stderr: "",
        exitCode: 0,
      });
      process.env.ACTIONS_ID_TOKEN_REQUEST_URL = "https://example.com";
      delete process.env.NPM_TOKEN;

      await expect(validateOidcEnvironment()).rejects.toThrow(
        /npm version 11.5.0 detected/
      );
    });

    it("passes validation for npm 11.5.1 exactly", async () => {
      vi.mocked(getExecOutput).mockResolvedValue({
        stdout: "11.5.1",
        stderr: "",
        exitCode: 0,
      });
      process.env.ACTIONS_ID_TOKEN_REQUEST_URL = "https://example.com";
      delete process.env.NPM_TOKEN;

      await expect(validateOidcEnvironment()).resolves.toBeUndefined();
    });

    it("throws error for missing id-token permission", async () => {
      vi.mocked(getExecOutput).mockResolvedValue({
        stdout: "11.6.2",
        stderr: "",
        exitCode: 0,
      });
      delete process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
      delete process.env.NPM_TOKEN;

      await expect(validateOidcEnvironment()).rejects.toThrow(
        /id-token: write permission not detected/
      );
      await expect(validateOidcEnvironment()).rejects.toThrow(
        /permissions:.*id-token: write/s
      );
    });

    it("throws error when NPM_TOKEN is set", async () => {
      vi.mocked(getExecOutput).mockResolvedValue({
        stdout: "11.6.2",
        stderr: "",
        exitCode: 0,
      });
      process.env.ACTIONS_ID_TOKEN_REQUEST_URL = "https://example.com";
      process.env.NPM_TOKEN = "secret-token";

      await expect(validateOidcEnvironment()).rejects.toThrow(
        /NPM_TOKEN is set but oidcAuth: true/
      );
      await expect(validateOidcEnvironment()).rejects.toThrow(
        /Remove NPM_TOKEN secret or set oidcAuth: false/
      );
    });

    it("handles npm version with leading/trailing whitespace", async () => {
      vi.mocked(getExecOutput).mockResolvedValue({
        stdout: "  11.6.2\n",
        stderr: "",
        exitCode: 0,
      });
      process.env.ACTIONS_ID_TOKEN_REQUEST_URL = "https://example.com";
      delete process.env.NPM_TOKEN;

      await expect(validateOidcEnvironment()).resolves.toBeUndefined();
    });

    it("throws error when npm command fails", async () => {
      vi.mocked(getExecOutput).mockRejectedValue(
        new Error("npm command not found")
      );
      process.env.ACTIONS_ID_TOKEN_REQUEST_URL = "https://example.com";
      delete process.env.NPM_TOKEN;

      await expect(validateOidcEnvironment()).rejects.toThrow();
    });

    it("validates all requirements are checked in order", async () => {
      // npm version is checked first
      vi.mocked(getExecOutput).mockResolvedValue({
        stdout: "10.0.0",
        stderr: "",
        exitCode: 0,
      });
      delete process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
      process.env.NPM_TOKEN = "token";

      // Should fail on npm version, not on other checks
      await expect(validateOidcEnvironment()).rejects.toThrow(
        /npm version 10.0.0 detected/
      );
    });
  });
});
