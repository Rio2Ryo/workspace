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

function importsHelper(source, helperName) {
  return new RegExp(`import \\{[^}]*${helperName}[^}]*\\} from ['\"](?:\\.\\.?/)*e2e-helpers['\"]`).test(source)
}

const directButtonRules = [
  {
    label: 'この内容でインポート',
    helperName: 'importConfirmButton',
    helperCall: /importConfirmButton\(/,
    directLocator: /getByRole\(['"]button['"],\s*\{\s*name:\s*['"]この内容でインポート['"]\s*\}\)/,
  },
  {
    label: 'インポートをキャンセル',
    helperName: 'importCancelButton',
    helperCall: /importCancelButton\(/,
    directLocator: /getByRole\(['"]button['"],\s*\{\s*name:\s*['"]インポートをキャンセル['"]\s*\}\)/,
  },
]

test('[E2E-Helper][import-preview-actions] E2E specs use shared import preview action locators', async () => {
  const offenders = []
  const specs = await listE2eSpecs(testsRoot)

  assert.ok(specs.length > 0, 'contract should discover E2E specs')

  for (const spec of specs) {
    const specUrl = new URL(spec, `${root}/`)
    const source = await readFile(specUrl, 'utf8')

    for (const rule of directButtonRules) {
      if (rule.directLocator.test(source)) {
        offenders.push(`${relativePath(specUrl)}: direct ${rule.label} locator`)
      }
      if (rule.helperCall.test(source) && !importsHelper(source, rule.helperName)) {
        offenders.push(`${relativePath(specUrl)}: ${rule.helperName} call without named import`)
      }
    }
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    `E2E specs should use importConfirmButton()/importCancelButton() so import preview action names stay centralized: ${offenders.join(', ')}`,
  )
})

test('[E2E-Helper][import-preview-actions] helpers own import preview action accessible-name contracts', async () => {
  const source = await readFile(helperPath, 'utf8')

  assert.match(source, /export function importConfirmButton/, 'tests/e2e-helpers.ts should export importConfirmButton')
  assert.match(source, /export function importCancelButton/, 'tests/e2e-helpers.ts should export importCancelButton')
  assert.match(source, /name:\s*['"]この内容でインポート['"]/, 'importConfirmButton should own the confirm accessible name')
  assert.match(source, /name:\s*['"]インポートをキャンセル['"]/, 'importCancelButton should own the cancel accessible name')
})
