import fs from "node:fs/promises";
import path from "node:path";
import { detect } from "package-manager-detector/detect";

type PackageManager = "pnpm" | "npm" | "yarn";

export type SetupAuthInputs = {
  token: string;
  registry: string;
  scope?: string;
  packageManager?: PackageManager;
  overwrite: boolean;
};

export async function setupAuth(
  inputs: SetupAuthInputs,
): Promise<{ configPath: string; packageManager: PackageManager }> {
  async function detectPackageManager(): Promise<PackageManager | undefined> {
    const result = await detect();
    return (
      result?.agent
        // normalize values
        .replace(/^yarn$/, "yarn@1")
        .replace(/^yarn@berry$/, "yarn") as PackageManager | undefined
    );
  }

  const packageManager =
    inputs.packageManager ?? (await detectPackageManager());
  if (
    packageManager !== "pnpm" &&
    packageManager !== "npm" &&
    packageManager !== "yarn"
  ) {
    // oxlint-disable-next-line typescript/no-unnecessary-condition
    throw new Error(`Unsupported package manager: ${packageManager ?? "null"}`);
  }

  const configPaths = {
    // we do not use `.config/pnpm/
    pnpm: path.join("$HOME", ".config", "pnpm", "auth.ini"),
    npm: path.join("$HOME", ".npmrc"),
    yarn: path.join("$HOME", ".yarnrc.yml"),
  } satisfies Record<PackageManager, string>;

  const configPath = configPaths[packageManager].replace(
    /\$HOME/,
    process.env.HOME ?? process.env.userprofile!,
  );

  await fs.mkdir(path.dirname(configPath), { recursive: true });
  let fd: fs.FileHandle;

  try {
    fd = await fs.open(configPath, inputs.overwrite ? "w" : "wx");
  } catch (error) {
    if ((error as { code: string }).code !== "EEXIST") throw error;

    throw new Error(
      `Config file already exists and \`overwrite\` is false: ${configPath}`,
      {
        cause: error,
      },
    );
  }

  const scopePrefix = inputs.scope ? `${inputs.scope}:` : "";
  const configs = {
    pnpm: (inputs) =>
      `${scopePrefix}${inputs.registry}/:_authToken=${inputs.token}`,
    npm: (inputs) =>
      `${scopePrefix}${inputs.registry}/:_authToken=${inputs.token}`,
    yarn: (inputs) => {
      if (inputs.scope != null) {
        return `
npmScopes:
  ${inputs.scope.slice(1)}:
    npmAuthToken: "${inputs.token}"
    npmRegistryServer: "${inputs.registry}"
      `.trim();
      }

      return `
npmRegistries:
  ${inputs.registry}:
    npmAuthToken: "${inputs.token}"
    `.trim();
    },
  } satisfies Record<PackageManager, (inputs: SetupAuthInputs) => string>;

  await fs.writeFile(fd, configs[packageManager](inputs));

  return {
    configPath,
    packageManager,
  };
}
