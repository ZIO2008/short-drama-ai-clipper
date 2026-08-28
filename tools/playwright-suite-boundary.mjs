import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PROJECT_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))

const readBoundary = (root) => {
  const boundaryPath = join(root, 'docs', 'test-suite-boundary.json')
  const boundary = JSON.parse(readFileSync(boundaryPath, 'utf8'))
  if (!boundary || typeof boundary !== 'object' || !boundary.suites || typeof boundary.suites !== 'object') {
    throw new Error(`Invalid Playwright suite boundary: ${boundaryPath}`)
  }
  return boundary
}

export const resolvePlaywrightSuiteTests = (suite, selectedFiles, root = PROJECT_ROOT) => {
  const boundary = readBoundary(root)
  const suiteFiles = boundary.suites[suite]
  if (!Array.isArray(suiteFiles) || suiteFiles.length === 0) {
    throw new Error(`Playwright suite must contain tests: ${suite}`)
  }

  const files = selectedFiles ?? suiteFiles
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error(`Playwright suite selection must contain tests: ${suite}`)
  }

  return files.map((file) => {
    if (typeof file !== 'string' || !suiteFiles.includes(file)) {
      throw new Error(`Test is not registered in Playwright suite ${suite}: ${file}`)
    }
    const relativePath = join('tests', suite, file)
    const absolutePath = join(root, relativePath)
    if (!existsSync(absolutePath)) {
      throw new Error(`Playwright suite references missing test: ${relativePath}`)
    }
    return relativePath.replaceAll('\\', '/')
  })
}
