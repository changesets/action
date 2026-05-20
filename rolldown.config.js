import { defineConfig } from 'rolldown'

export default defineConfig({
  input: 'src/index.ts',
  output: {
    dir: 'dist',
    format: 'esm',
    cleanDir: true,
    minify: true,
    comments: false,
  },
  platform: 'node',
})
