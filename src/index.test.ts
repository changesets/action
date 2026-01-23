import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as core from "@actions/core";
import fs from "node:fs/promises";
import { getExecOutput } from "@actions/exec";

// Mock external dependencies
vi.mock("@actions/core");
vi.mock("@actions/exec");
vi.mock("node:fs/promises");

// Import actual implementations after mocks are set up
import { setupNpmAuth, createNpmrcFile, validateOidcEnvironment, fileExists } from "./utils.ts";

describe("npm authentication setup", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.GITHUB_TOKEN = "test-token";
    process.env.HOME = "/home/test";
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("setupNpmAuth", () => {
    it("validates OIDC environment when oidcAuth is true", async () => {
      process.env.ACTIONS_ID_TOKEN_REQUEST_URL = "https://example.com";
      delete process.env.NPM_TOKEN;
      
      vi.mocked(getExecOutput).mockResolvedValue({
        stdout: "11.6.2",
        stderr: "",
        exitCode: 0,
      });

      await setupNpmAuth(true);

      // validateOidcEnvironment should have been called internally
      expect(getExecOutput).toHaveBeenCalledWith("npm", ["--version"]);
    });

    it("throws error when NPM_TOKEN is missing in legacy mode", async () => {
      delete process.env.NPM_TOKEN;

      await expect(setupNpmAuth(false)).rejects.toThrow(
        "NPM_TOKEN environment variable is required"
      );
      expect(getExecOutput).not.toHaveBeenCalled();
    });

    it("succeeds when NPM_TOKEN is present in legacy mode", async () => {
      process.env.NPM_TOKEN = "test-token";

      await expect(setupNpmAuth(false)).resolves.toBeUndefined();
      expect(getExecOutput).not.toHaveBeenCalled();
    });

    it("propagates OIDC validation errors", async () => {
      process.env.ACTIONS_ID_TOKEN_REQUEST_URL = "https://example.com";
      delete process.env.NPM_TOKEN;
      
      vi.mocked(getExecOutput).mockResolvedValue({
        stdout: "10.0.0",
        stderr: "",
        exitCode: 0,
      });

      await expect(setupNpmAuth(true)).rejects.toThrow("npm version 10.0.0 detected");
    });
  });

  describe("createNpmrcFile", () => {
    it("creates .npmrc file when it does not exist", async () => {
      process.env.NPM_TOKEN = "test-token-123";
      vi.mocked(fs.access).mockRejectedValue(new Error("File not found"));
      vi.mocked(fs.writeFile).mockResolvedValue();

      await createNpmrcFile();

      expect(fs.writeFile).toHaveBeenCalledWith(
        "/home/test/.npmrc",
        "//registry.npmjs.org/:_authToken=test-token-123\n"
      );
      expect(fs.appendFile).not.toHaveBeenCalled();
    });

    it("appends to existing .npmrc when auth token is missing", async () => {
      process.env.NPM_TOKEN = "test-token-456";
      vi.mocked(fs.access).mockResolvedValue(undefined); // File exists
      vi.mocked(fs.readFile).mockResolvedValue("some-other-config=value\n");
      vi.mocked(fs.appendFile).mockResolvedValue();

      await createNpmrcFile();

      expect(fs.readFile).toHaveBeenCalledWith("/home/test/.npmrc", "utf8");
      expect(fs.appendFile).toHaveBeenCalledWith(
        "/home/test/.npmrc",
        "\n//registry.npmjs.org/:_authToken=test-token-456\n"
      );
      expect(fs.writeFile).not.toHaveBeenCalled();
    });

    it("does not modify .npmrc when auth token already exists", async () => {
      process.env.NPM_TOKEN = "test-token-789";
      vi.mocked(fs.access).mockResolvedValue(undefined); // File exists
      vi.mocked(fs.readFile).mockResolvedValue(
        "//registry.npmjs.org/:_authToken=existing-token\n"
      );

      await createNpmrcFile();

      expect(fs.readFile).toHaveBeenCalledWith("/home/test/.npmrc", "utf8");
      expect(fs.writeFile).not.toHaveBeenCalled();
      expect(fs.appendFile).not.toHaveBeenCalled();
    });

    it("throws error when NPM_TOKEN is not set", async () => {
      delete process.env.NPM_TOKEN;

      await expect(createNpmrcFile()).rejects.toThrow(
        "NPM_TOKEN is required to create .npmrc file"
      );
    });
  });

  describe("Integration: OIDC mode does not create .npmrc", () => {
    it("validates OIDC and skips .npmrc creation", async () => {
      const writeFileSpy = vi.spyOn(fs, "writeFile");
      const appendFileSpy = vi.spyOn(fs, "appendFile");

      process.env.ACTIONS_ID_TOKEN_REQUEST_URL = "https://example.com";
      delete process.env.NPM_TOKEN;
      vi.mocked(getExecOutput).mockResolvedValue({
        stdout: "11.6.2",
        stderr: "",
        exitCode: 0,
      });

      // Setup OIDC auth
      await setupNpmAuth(true);

      // Verify OIDC validation was called (via npm version check)
      expect(getExecOutput).toHaveBeenCalledWith("npm", ["--version"]);

      // Verify no .npmrc operations occurred
      const npmrcWriteCalls = writeFileSpy.mock.calls.filter((call) =>
        call[0].toString().includes(".npmrc")
      );
      const npmrcAppendCalls = appendFileSpy.mock.calls.filter((call) =>
        call[0].toString().includes(".npmrc")
      );

      expect(npmrcWriteCalls).toHaveLength(0);
      expect(npmrcAppendCalls).toHaveLength(0);

      writeFileSpy.mockRestore();
      appendFileSpy.mockRestore();
    });
  });

  describe("Integration: Legacy mode creates .npmrc", () => {
    it("creates .npmrc file when NPM_TOKEN is set", async () => {
      const writeFileSpy = vi.spyOn(fs, "writeFile");

      process.env.NPM_TOKEN = "legacy-token-123";
      vi.mocked(fs.access).mockRejectedValue(new Error("File not found"));
      vi.mocked(fs.writeFile).mockResolvedValue();

      // Setup legacy auth
      await setupNpmAuth(false);

      // Create .npmrc file
      await createNpmrcFile();

      // Verify .npmrc was created with correct token
      expect(writeFileSpy).toHaveBeenCalledWith(
        "/home/test/.npmrc",
        "//registry.npmjs.org/:_authToken=legacy-token-123\n"
      );
      expect(getExecOutput).not.toHaveBeenCalled();

      writeFileSpy.mockRestore();
    });
  });

  describe("Error handling", () => {
    it("handles OIDC validation failure gracefully", async () => {
      process.env.ACTIONS_ID_TOKEN_REQUEST_URL = "https://example.com";
      delete process.env.NPM_TOKEN;
      
      vi.mocked(getExecOutput).mockResolvedValue({
        stdout: "10.0.0",
        stderr: "",
        exitCode: 0,
      });

      await expect(setupNpmAuth(true)).rejects.toThrow(
        /npm 11.5.1\+ required for OIDC/
      );
    });

    it("provides clear error when NPM_TOKEN is missing in legacy mode", async () => {
      delete process.env.NPM_TOKEN;

      await expect(setupNpmAuth(false)).rejects.toThrow(
        "NPM_TOKEN environment variable is required when not using OIDC authentication"
      );
    });
  });

  describe("Backward compatibility", () => {
    it("defaults to legacy mode when oidcAuth is false", async () => {
      process.env.NPM_TOKEN = "test-token";

      await expect(setupNpmAuth(false)).resolves.toBeUndefined();
      expect(getExecOutput).not.toHaveBeenCalled();
    });
  });
});
