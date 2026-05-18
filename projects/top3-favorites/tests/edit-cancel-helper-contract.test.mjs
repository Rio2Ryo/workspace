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
    if (entry.isDirectory()) {
      specs.push(...(await listE2eSpecs(new URL(`${entry.name}/`, dirUrl))))
      continue
    }
    if (entry.isFile() && entry.name.endsWith('.e2e.spec.ts')) {
      specs.push(relativePath(new URL(entry.name, dirUrl)))
    }
  }

  return specs.sort()
}

function relativePath(url) {
  return url.pathname.replace(root.pathname, '').replace(/^\/+/, '')
}

function sourceImportsEditCancelHelper(source) {
  return /import \{[^}]*editCancelButton[^}]*\} from ['"](?:\.\/|\.\.\/)*e2e-helpers['"]/.test(source)
}

function sourceUsesDirectEditCancelButton(source) {
  return /getByRole\(['"]button['"],\s*\{\s*name:\s*['"]編集をキャンセル['"]\s*\}\)/.test(source)
}

test('[E2E-Helper][edit-cancel] E2E specs use shared edit cancel button locator', async () => {
  const offenders = []
  const specs = await listE2eSpecs(testsRoot)

  assert.ok(specs.length > 0, 'contract should discover E2E specs')

  for (const spec of specs) {
    const specUrl = new URL(spec, `${root}/`)
    const source = await readFile(specUrl, 'utf8')
    const usesEditCancelHelper = /editCancelButton\(/.test(source)
    const usesDirectEditCancelButton = sourceUsesDirectEditCancelButton(source)

    if (usesDirectEditCancelButton) {
      offenders.push(`${relativePath(specUrl)}: direct edit cancel button locator`)
    }
    if (usesEditCancelHelper && !sourceImportsEditCancelHelper(source)) {
      offenders.push(`${relativePath(specUrl)}: helper call without named import`)
    }
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    `E2E specs should use editCancelButton() so the edit cancel accessible name stays centralized: ${offenders.join(', ')}`,
  )
})

test('[E2E-Helper][edit-cancel] helper owns edit cancel button accessible name', async () => {
  const source = await readFile(helperPath, 'utf8')

  assert.match(source, /export function editCancelButton/, 'tests/e2e-helpers.ts should export editCancelButton')
  assert.match(source, /getByRole\(['"]button['"],\s*\{\s*name:\s*['"]編集をキャンセル['"]\s*\}\)/, 'editCancelButton should own the edit cancel button accessible name')
})
