import { spawnSync } from 'node:child_process'

const suite = process.argv[2]
if (!['current', 'compatibility', 'legacy', 'all'].includes(suite)) {
  console.error('Usage: node tools/run-playwright-suite.mjs <current|compatibility|legacy|all>')
  process.exit(2)
}
const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const result = spawnSync(command, ['exec', 'playwright', 'test'], {
  stdio: 'inherit',
  env: { ...process.env, PLAYWRIGHT_SUITE: suite }
})
process.exit(result.status ?? 1)
