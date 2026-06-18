import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { setupAuth, type SetupAuthInputs } from "./setup.ts";

describe("setup()", () => {
  let originalHome = process.env.HOME;
  let homeDir!: string;
  beforeEach(async () => {
    homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "setup-auth-"));
    process.env.HOME = homeDir;
  });
  afterAll(() => {
    process.env.HOME = originalHome;
  });

  it("should refuse if file already exists", async () => {
    const filePath = path.join(homeDir, ".npmrc");
    const originalFileContents = "registry=https://registry.npmjs.org";
    await fs.writeFile(filePath, originalFileContents);

    const inputs = {
      token: "token",
      registry: "//test.registry.com",
      scope: undefined,
      packageManager: "npm",
      overwrite: false,
    } satisfies SetupAuthInputs;

    await expect(setupAuth(inputs)).rejects.toThrow("file already exists");

    await expect(fs.readFile(filePath, "utf8")).resolves.toEqual(
      originalFileContents,
    );
  });

  it("should overwrite if configured to", async () => {
    const filePath = path.join(homeDir, ".npmrc");
    const originalFileContents = "registry=https://registry.npmjs.org";
    await fs.writeFile(filePath, originalFileContents);

    const inputs = {
      token: "token",
      registry: "//test.registry.com",
      scope: undefined,
      packageManager: "npm",
      overwrite: true,
    } satisfies SetupAuthInputs;

    await expect(setupAuth(inputs)).resolves.toBeDefined();
    await expect(fs.readFile(filePath, "utf8")).resolves.not.toEqual(
      originalFileContents,
    );
  });

  describe("pnpm", () => {
    it("should configure token", async () => {
      const inputs = {
        token: "token",
        registry: "//test.registry.com",
        scope: undefined,
        packageManager: "pnpm",
        overwrite: false,
      } satisfies SetupAuthInputs;
      const { configPath, packageManager } = await setupAuth(inputs);

      expect(packageManager).toBe("pnpm");
      const expectedPath = path.join(homeDir, ".config", "pnpm", "auth.ini");
      expect(configPath).toEqual(expectedPath);
      await expect(
        fs.readFile(expectedPath, "utf8"),
      ).resolves.toMatchInlineSnapshot(
        `"//test.registry.com/:_authToken=token"`,
      );
    });

    it("should configure token with scope", async () => {
      const inputs = {
        token: "token",
        registry: "//test.registry.com",
        scope: "@my-org",
        packageManager: "pnpm",
        overwrite: false,
      } satisfies SetupAuthInputs;
      const { configPath, packageManager } = await setupAuth(inputs);

      expect(packageManager).toBe("pnpm");
      const expectedPath = path.join(homeDir, ".config", "pnpm", "auth.ini");
      expect(configPath).toEqual(expectedPath);
      await expect(
        fs.readFile(expectedPath, "utf8"),
      ).resolves.toMatchInlineSnapshot(
        `"@my-org://test.registry.com/:_authToken=token"`,
      );
    });
  });

  describe("npm", () => {
    it("should configure token", async () => {
      const inputs = {
        token: "token",
        registry: "//test.registry.com",
        scope: undefined,
        packageManager: "npm",
        overwrite: false,
      } satisfies SetupAuthInputs;
      const { configPath, packageManager } = await setupAuth(inputs);

      expect(packageManager).toBe("npm");
      const expectedPath = path.join(homeDir, ".npmrc");
      expect(configPath).toEqual(expectedPath);
      await expect(
        fs.readFile(expectedPath, "utf8"),
      ).resolves.toMatchInlineSnapshot(
        `"//test.registry.com/:_authToken=token"`,
      );
    });

    it("should configure token with scope", async () => {
      const inputs = {
        token: "token",
        registry: "//test.registry.com",
        scope: "@my-org",
        packageManager: "npm",
        overwrite: false,
      } satisfies SetupAuthInputs;
      const { configPath, packageManager } = await setupAuth(inputs);

      expect(packageManager).toBe("npm");
      const expectedPath = path.join(homeDir, ".npmrc");
      expect(configPath).toEqual(expectedPath);
      await expect(
        fs.readFile(expectedPath, "utf8"),
      ).resolves.toMatchInlineSnapshot(
        `"@my-org://test.registry.com/:_authToken=token"`,
      );
    });
  });

  describe("yarn", () => {
    it("should configure token", async () => {
      const inputs = {
        token: "token",
        registry: "//test.registry.com",
        scope: undefined,
        packageManager: "yarn",
        overwrite: false,
      } satisfies SetupAuthInputs;
      const { configPath, packageManager } = await setupAuth(inputs);

      expect(packageManager).toBe("yarn");
      const expectedPath = path.join(homeDir, ".yarnrc.yml");
      expect(configPath).toEqual(expectedPath);
      await expect(
        fs.readFile(expectedPath, "utf8"),
      ).resolves.toMatchInlineSnapshot(
        `
        "npmRegistries:
          //test.registry.com:
            npmAuthToken: "token""
      `,
      );
    });

    it("should configure token with scope", async () => {
      const inputs = {
        token: "token",
        registry: "//test.registry.com",
        scope: "@my-org",
        packageManager: "yarn",
        overwrite: false,
      } satisfies SetupAuthInputs;
      const { configPath, packageManager } = await setupAuth(inputs);

      expect(packageManager).toBe("yarn");
      const expectedPath = path.join(homeDir, ".yarnrc.yml");
      expect(configPath).toEqual(expectedPath);
      await expect(
        fs.readFile(expectedPath, "utf8"),
      ).resolves.toMatchInlineSnapshot(
        `
        "npmScopes:
          my-org:
            npmAuthToken: "token"
            npmRegistryServer: "//test.registry.com""
      `,
      );
    });
  });
});
