import fs from "fs";
import * as ini from "ini";

export const prepareNpmConfig = (
  // Allow to inject a custom object, useful in tests.
  processEnv = process.env
) => {
  const userNpmrcPath = `${processEnv.HOME}/.npmrc`;

  if (fs.existsSync(userNpmrcPath)) {
    console.log(`Found existing user .npmrc file at ${userNpmrcPath}`);

    // Parse the `.npmrc` content using the `npm/ini` package.
    const npmConfig = ini.parse(fs.readFileSync(userNpmrcPath, "utf-8"));

    let hasAuthToken = false;
    for (const [key, value] of Object.entries(npmConfig)) {
      if (/\/\/(.*)authToken$/.test(key) && Boolean(value)) {
        console.log("The .npmrc file has an authToken");
        hasAuthToken = true;
      }
    }

    if (!hasAuthToken) {
      console.log(
        "The .npmrc file does not have an authToken defined, creating one using the `NPM_TOKEN` environment variable"
      );
      if (!processEnv.NPM_TOKEN) {
        throw new Error(
          "Missing NPM authToken. Please make sure you have the `NPM_TOKEN` environment variable defined."
        );
      }
      npmConfig["//registry.npmjs.org/:_authToken"] = processEnv.NPM_TOKEN;
      fs.writeFileSync(userNpmrcPath, ini.stringify(npmConfig));
    }
  } else {
    console.log("No user .npmrc file found, creating one");
    if (!processEnv.NPM_TOKEN) {
      throw new Error(
        "Missing NPM authToken. Please make sure you have the `NPM_TOKEN` environment variable defined."
      );
    }
    fs.writeFileSync(
      userNpmrcPath,
      ini.stringify({
        "//registry.npmjs.org/:_authToken": processEnv.NPM_TOKEN,
      })
    );
  }
};
