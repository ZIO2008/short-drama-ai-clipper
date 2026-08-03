import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  // P2's historical positive workflow stays excluded; p2-freeze.spec.ts is the
  // mandatory negative regression gate for the frozen surface.
  testIgnore: ['**/p2-narration-workflow.spec.ts'],
  preserveOutput: 'always',
  outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR ?? 'test-results/e2e'
})
