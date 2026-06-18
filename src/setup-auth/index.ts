import * as core from "@actions/core";
import { setupAuth } from "./setup.ts";

try {
  await main();
} catch (err) {
  core.setFailed((err as Error).message);
}

async function main() {
  core.info("Setting up npm registry authentication...");
  const { configPath, packageManager } = await setupAuth({
    token: core.getInput("token", { required: true }),
    registry: core.getInput("registry"),
    scope: core.getInput("scope"),
    packageManager: core.getInput("package-manager") as any,
    overwrite: core.getInput("overwrite") === "true",
  });
  core.setOutput("config-path", configPath);
  core.setOutput("package-manager", packageManager);
  core.info("Done!");
}
