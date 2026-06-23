import { defineConfig } from "rolldown";

export default defineConfig({
  input: {
    index: "src/index.ts",
    pack: "src/pack/index.ts",
    "pr-status": "src/pr-status/index.ts",
    "pr-comment": "src/pr-comment/index.ts",
    "select-mode": "src/select-mode/index.ts",
    version: "src/version/index.ts",
    publish: "src/publish/index.ts",
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
