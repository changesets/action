import { defineConfig } from "rolldown";

export default defineConfig({
  input: {
    index: "src/index.ts",
    ["comment-pr-changeset"]: "src/comment-pr-changeset/index.ts",
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
