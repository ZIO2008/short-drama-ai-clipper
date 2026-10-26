import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

const asrPrototypePath = '/design/open-design/v2026-08-05-asr-default-configuration/short-drama-material-studio.html'

// The approved static prototype remains read-only. Its historical raw model
// value is stripped only at the Renderer import boundary, before Vite embeds
// the document into srcDoc. Main-process policy is the sole owner of raw IDs.
const sanitizeAsrPrototypeImport = (): Plugin => ({
  name: 'sanitize-asr-prototype-model-id',
  enforce: 'pre',
  async load(id) {
    if (!id.includes(asrPrototypePath) || !id.endsWith('?raw')) return null
    const source = await readFile(id.slice(0, -'?raw'.length), 'utf8')
    return `export default ${JSON.stringify(source.replace("model:'paraformer-v2'", 'model:null'))}`
  }
})

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        external: ['electron'],
        output: {
          format: 'cjs'
        }
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    plugins: [sanitizeAsrPrototypeImport(), react()],
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    }
  }
})
