import { defineConfig } from "rolldown";

export default defineConfig({
  input: {
    index: "src/index.ts",
    "pr-status": "src/pr-status/index.ts",
    "pr-comment": "src/pr-comment/index.ts",
    "setup-auth": "src/setup-auth/index.ts",
  },
  output: {
    dir: "dist",
    format: "esm",
    cleanDir: true,
    minify: true,
    comments: false,
  },
  platform: "node",
});
