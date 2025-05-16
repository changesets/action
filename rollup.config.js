import { defineConfig } from "rollup";
import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";
import json from "@rollup/plugin-json";
import { transform } from "esbuild";
import builtinModulesList from "builtin-modules";

const builtinModules = new Set(builtinModulesList);

export default defineConfig({
  input: "src/index.ts",
  output: {
    dir: "dist",
    format: "esm",
  },
  external: (id) => builtinModules.has(id),
  plugins: [
    nodeResolve({
      preferBuiltins: false,
    }),
    json(),
    commonjs(),
    {
      name: "esbuild",
      async transform(code, id) {
        if (!/\.(mts|cts|ts|tsx)$/.test(id)) {
          return null;
        }
        const result = await transform(code, {
          loader: "ts",
        });
        return result.code;
      },
    },
    terser(),
  ],
});
