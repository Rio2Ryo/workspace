import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url)
const testsRoot = new URL('.', import.meta.url)
const helperPath = new URL('./e2e-helpers.ts', testsRoot)
const packagePath = new URL('../package.json', testsRoot)

async function collectE2ESpecs(dir = testsRoot) {
  const entries = await readdir(dir, { withFileTypes: true })
  const paths = []
  for (const entry of entries) {
    const child = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, dir)
    if (entry.isDirectory()) {
      paths.push(...await collectE2ESpecs(child))
      continue
    }
    if (entry.name.endsWith('.e2e.spec.ts')) {
      paths.push(child)
    }
  }
  return paths
}

function relative(url) {
  return url.pathname.replace(root.pathname, '')
}

function helperImportSource(depth) {
  return depth === 0 ? './e2e-helpers' : `${'../'.repeat(depth)}e2e-helpers`
}

test('[E2E-Helper][clipboard] helper owns clipboard mock setup and readback', async () => {
  const helperSource = await readFile(helperPath, 'utf8')
  assert.match(helperSource, /export async function installClipboardRecorder\(page: Page, storageKey = 'last-copied-text'\): Promise<void>/, 'tests/e2e-helpers.ts should export installClipboardRecorder(page, storageKey)')
  assert.match(helperSource, /Object\.defineProperty\(navigator, 'clipboard',[\s\S]*writeText: async \(text: string\)[\s\S]*window\.localStorage\.setItem\(storageKey, text\)/, 'installClipboardRecorder should own navigator.clipboard.writeText and localStorage recording')
  assert.match(helperSource, /export async function readClipboardRecorder\(page: Page, storageKey = 'last-copied-text'\): Promise<string \| null>/, 'tests/e2e-helpers.ts should export readClipboardRecorder(page, storageKey)')
  assert.match(helperSource, /window\.localStorage\.getItem\(storageKey\)/, 'readClipboardRecorder should own clipboard recorder localStorage readback')
})

test('[E2E-Helper][clipboard] E2E specs do not duplicate navigator.clipboard mocks', async () => {
  const specs = await collectE2ESpecs()
  const offenders = []
  const missingImports = []
  for (const spec of specs) {
    const source = await readFile(spec, 'utf8')
    const usesClipboardRecorder = /installClipboardRecorder\(/.test(source) || /readClipboardRecorder\(/.test(source)
    if (/Object\.defineProperty\(navigator, 'clipboard'|navigator\.clipboard\s*=|writeText:\s*async \(text: string\)/.test(source)) {
      offenders.push(relative(spec))
    }
    if (usesClipboardRecorder) {
      const depth = relative(spec).split('/').length - 2
      const expectedSource = helperImportSource(depth)
      const importPattern = new RegExp(`^import\\s*\\{([^}]*)\\}\\s*from\\s*['"]${expectedSource.replaceAll('/', '\\/')}['"]`, 'm')
      const match = source.match(importPattern)
      if (!match || !/\binstallClipboardRecorder\b/.test(match[1]) || !/\breadClipboardRecorder\b/.test(match[1])) {
        missingImports.push(relative(spec))
      }
    }
  }
  assert.deepEqual(offenders, [], `E2E specs should use installClipboardRecorder/readClipboardRecorder instead of inline clipboard mocks: ${offenders.join(', ')}`)
  assert.deepEqual(missingImports, [], `Specs using clipboard recorder helpers should import both helpers explicitly: ${missingImports.join(', ')}`)
})

test('[App][config-quality] full verification runs clipboard helper contract', async () => {
  const pkg = JSON.parse(await readFile(packagePath, 'utf8'))
  assert.equal(pkg.scripts['test:clipboard-helper-contract'], 'node --test tests/clipboard-helper-contract.test.mjs')
  assert.match(pkg.scripts['test:full'], /pnpm test:clipboard-helper-contract/, 'pnpm test:full should run clipboard helper contract')
})
