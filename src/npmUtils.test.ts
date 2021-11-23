import fs from "fs";
import path from "path";
import * as ini from "ini";
import fixtures from "fixturez";
import { checkNpmConfig } from "./npmUtils";

const f = fixtures(__dirname);
const authToken = "npm_abc";

describe("checkNpmConfig", () => {
  let tmpDir: string;
  let npmrcPath: string;

  beforeEach(() => {
    tmpDir = f.temp();
    npmrcPath = path.join(tmpDir, ".npmrc");
  });

  describe("when .npmrc exists", () => {
    describe("when authToken is defined", () => {
      beforeEach(() => {
        fs.writeFileSync(
          npmrcPath,
          ini.stringify({
            email: "npm@company.com",
            "//registry.npmjs.org/:_authToken": authToken,
          })
        );
      });
      test("should not change the .npmrc file", () => {
        checkNpmConfig({ HOME: tmpDir });

        const npmConfig = ini.parse(fs.readFileSync(npmrcPath, "utf-8"));
        expect(npmConfig).toMatchInlineSnapshot(`
          Object {
            "//registry.npmjs.org/:_authToken": "npm_abc",
            "email": "npm@company.com",
          }
        `);
      });
    });
    describe("when authToken is not defined", () => {
      beforeEach(() => {
        fs.writeFileSync(
          npmrcPath,
          ini.stringify({
            email: "npm@company.com",
          })
        );
      });
      describe("when NPM_TOKEN environment variable is not defined", () => {
        test("it should log a warning", () => {
          console.warn = jest.fn();
          checkNpmConfig({
            HOME: tmpDir,
            NPM_TOKEN: undefined,
          });
          expect(console.warn).toHaveBeenCalledWith(
            "Missing `NPM_TOKEN` environment variable, skipping update of .npmrc file."
          );
        });
      });
      test("should inject NPM_TOKEN value in .npmrc file", () => {
        checkNpmConfig({
          HOME: tmpDir,
          NPM_TOKEN: authToken,
        });

        const npmConfig = ini.parse(fs.readFileSync(npmrcPath, "utf-8"));
        expect(npmConfig).toMatchInlineSnapshot(`
          Object {
            "//registry.npmjs.org/:_authToken": "npm_abc",
            "email": "npm@company.com",
          }
        `);
      });
    });
  });

  describe("when .npmrc does not exist", () => {
    describe("when NPM_TOKEN environment variable is not defined", () => {
      test("it should log a warning", () => {
        console.warn = jest.fn();
        checkNpmConfig({
          HOME: tmpDir,
          NPM_TOKEN: undefined,
        });
        expect(console.warn).toHaveBeenCalledWith(
          "Missing `NPM_TOKEN` environment variable, skipping creation of .npmrc file."
        );
      });
    });
    test("should create a new .npmrc config", () => {
      checkNpmConfig({
        HOME: tmpDir,
        NPM_TOKEN: authToken,
      });

      const npmConfig = ini.parse(fs.readFileSync(npmrcPath, "utf-8"));
      expect(npmConfig).toMatchInlineSnapshot(`
        Object {
          "//registry.npmjs.org/:_authToken": "npm_abc",
        }
      `);
    });
  });
});
