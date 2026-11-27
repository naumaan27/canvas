import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

// Build against the engine in this repo, not the published copy.
const core = fileURLToPath(new URL('../../packages/core/src/', import.meta.url))

export default defineConfig({
  base: './',
  resolve: {
    alias: [
      { find: /^@quickdrawjs\/core$/, replacement: core + 'index.js' },
      { find: /^@quickdrawjs\/core\/(quickdraw|styles)\.css$/, replacement: core + 'quickdraw.css' },
    ],
  },
})
