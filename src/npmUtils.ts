import fs from "fs";
import * as ini from "ini";

// https://docs.npmjs.com/using-private-packages-in-a-ci-cd-workflow#create-and-check-in-a-project-specific-npmrc-file
const npmRegistryTokenKey = "//registry.npmjs.org/:_authToken";

export const checkNpmConfig = (
  // Allow to inject a custom object, useful in tests.
  processEnv = process.env
) => {
  const userNpmrcPath = `${processEnv.HOME}/.npmrc`;

  if (fs.existsSync(userNpmrcPath)) {
    console.log(`Found existing user .npmrc file at ${userNpmrcPath}.`);

    // Parse the `.npmrc` content using the `npm/ini` package.
    const npmConfig = ini.parse(fs.readFileSync(userNpmrcPath, "utf-8"));

    let hasAuthTokenForDefaultNpmRegistry = false;
    // Check if there is at least a registry defined with an `_authToken`.
    for (const [key, value] of Object.entries(npmConfig)) {
      if (npmRegistryTokenKey === key && Boolean(value)) {
        hasAuthTokenForDefaultNpmRegistry = true;
      }
    }

    if (hasAuthTokenForDefaultNpmRegistry) {
      console.log(
        "The .npmrc file has an entry for the npm registry with an authToken defined."
      );
    } else {
      console.log(
        "The .npmrc file does not have an authToken defined, appending one using the `NPM_TOKEN` environment variable..."
      );
      if (processEnv.NPM_TOKEN) {
        npmConfig["//registry.npmjs.org/:_authToken"] = processEnv.NPM_TOKEN;
        fs.writeFileSync(userNpmrcPath, ini.stringify(npmConfig));
      } else {
        console.warn(
          "Missing `NPM_TOKEN` environment variable, skipping update of .npmrc file."
        );
      }
    }
  } else {
    console.log("No user .npmrc file found, creating one...");
    if (processEnv.NPM_TOKEN) {
      fs.writeFileSync(
        userNpmrcPath,
        ini.stringify({
          "//registry.npmjs.org/:_authToken": processEnv.NPM_TOKEN,
        })
      );
    } else {
      console.warn(
        "Missing `NPM_TOKEN` environment variable, skipping creation of .npmrc file."
      );
    }
  }
};
