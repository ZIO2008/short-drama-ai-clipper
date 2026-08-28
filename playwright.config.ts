import { defineConfig } from '@playwright/test'

const suites = ['current', 'compatibility', 'legacy'] as const
const requestedSuite = process.env.PLAYWRIGHT_SUITE ?? 'current'

if (requestedSuite !== 'all' && !suites.includes(requestedSuite as (typeof suites)[number])) {
  throw new Error(`Unknown PLAYWRIGHT_SUITE=${requestedSuite}; use current, compatibility, legacy, or all.`)
}

export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  preserveOutput: 'always',
  outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR ?? 'test-results/e2e',
  projects: suites
    .filter((name) => requestedSuite === 'all' || name === requestedSuite)
    .map((name) => ({ name, testDir: `./tests/${name}` }))
})
