import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const assetsDirectory = join(process.cwd(), 'out', 'renderer', 'assets')
const rawModelIdPattern = /paraformer-v2|qwen3\.[67]-(?:flash|plus)/u
const assets = await readdir(assetsDirectory)
const scripts = assets.filter((name) => name.endsWith('.js'))

for (const script of scripts) {
  const content = await readFile(join(assetsDirectory, script), 'utf8')
  const leaked = content.match(rawModelIdPattern)
  if (leaked) throw new Error(`Renderer bundle contains a raw Model Studio model ID: ${leaked[0]}`)
}

console.log(`RENDERER_MODEL_STUDIO_BOUNDARY_OK scripts=${scripts.length}`)
