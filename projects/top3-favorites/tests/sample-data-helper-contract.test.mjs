import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('..', import.meta.url)
const helperPath = new URL('tests/e2e-helpers.ts', `${root}/`)
const testsRoot = new URL('tests/', `${root}/`)

async function listE2eSpecs(dirUrl) {
  const entries = await readdir(dirUrl, { withFileTypes: true })
  const specs = []

  for (const entry of entries) {
    const childUrl = new URL(entry.name, dirUrl)
    if (entry.isDirectory()) {
      specs.push(...(await listE2eSpecs(new URL(`${entry.name}/`, dirUrl))))
      continue
    }
    if (entry.isFile() && entry.name.endsWith('.e2e.spec.ts')) {
      specs.push(relativePath(childUrl))
    }
  }

  return specs.sort()
}

function relativePath(url) {
  return url.pathname.replace(root.pathname, '').replace(/^\/+/, '')
}

function sourceImportsSampleHelper(source) {
  return /import \{[^}]*(?:saveSampleItems|clickSampleSaveButton)[^}]*\} from '(?:\.\/|\.\.\/)*e2e-helpers'/.test(source)
}

function sourceUsesDirectSampleSave(source) {
  return /getByRole\(['"]button['"],\s*\{\s*name:\s*['"]サンプルをDB保存['"]\s*\}\)\.click\(\)/.test(source)
}

test('[E2E-Helper][sample-data] E2E specs save sample data through shared helper', async () => {
  const offenders = []
  const specs = await listE2eSpecs(testsRoot)

  assert.ok(specs.length > 0, 'contract should discover E2E specs')

  for (const spec of specs) {
    const specUrl = new URL(spec, `${root}/`)
    const source = await readFile(specUrl, 'utf8')
    const usesSampleHelper = /(?:saveSampleItems|clickSampleSaveButton)\(/.test(source)
    const usesDirectSampleSave = sourceUsesDirectSampleSave(source)

    if (usesDirectSampleSave) {
      offenders.push(`${relativePath(specUrl)}: direct sample save button click`)
    }
    if (usesSampleHelper && !sourceImportsSampleHelper(source)) {
      offenders.push(`${relativePath(specUrl)}: helper call without named import`)
    }
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    `E2E specs should use saveSampleItems() so sample seed button name and success status assertions stay centralized: ${offenders.join(', ')}`,
  )
})

test('[E2E-Helper][sample-data] helper owns sample save button and status mechanics', async () => {
  const source = await readFile(helperPath, 'utf8')

  assert.match(source, /export async function clickSampleSaveButton/, 'tests/e2e-helpers.ts should export clickSampleSaveButton for failure-path tests')
  assert.match(source, /export async function saveSampleItems/, 'tests/e2e-helpers.ts should export saveSampleItems')
  assert.match(source, /getByRole\(['"]button['"],\s*\{\s*name:\s*['"]サンプルをDB保存['"]\s*\}\)\.click\(\)/, 'clickSampleSaveButton should own the sample save button accessible name')
  assert.match(source, /saveSampleItems[\s\S]*clickSampleSaveButton\(page\)/, 'saveSampleItems should reuse the lower-level click helper')
  assert.match(source, /getByRole\(['"]status['"]\)[\s\S]*サンプルをDBに保存しました。/, 'saveSampleItems should assert the user-visible success status')
})
