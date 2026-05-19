import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('..', import.meta.url)
const helperPath = new URL('tests/e2e-helpers.ts', `${root}/`)
const testsRoot = new URL('tests/', `${root}/`)
const packagePath = new URL('package.json', `${root}/`)

const hintHelpers = [
  {
    helper: 'importLockHint',
    testId: 'import-lock-hint',
    message: 'registration/import form lock hint',
  },
  {
    helper: 'importExportLockHint',
    testId: 'import-export-lock-hint',
    message: 'JSON export lock hint',
  },
  {
    helper: 'importListActionLockHint',
    testId: 'import-list-action-lock-hint',
    message: 'existing list action lock hint',
  },
]

async function listE2eSpecs(dirUrl) {
  const entries = await readdir(dirUrl, { withFileTypes: true })
  const specs = []

  for (const entry of entries) {
    const childUrl = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, dirUrl)
    if (entry.isDirectory()) {
      specs.push(...(await listE2eSpecs(childUrl)))
      continue
    }
    if (entry.isFile() && entry.name.endsWith('.e2e.spec.ts')) specs.push(childUrl)
  }

  return specs.sort((a, b) => a.pathname.localeCompare(b.pathname))
}

function relativePath(url) {
  return url.pathname.replace(root.pathname, '').replace(/^\/+/, '')
}

function importsHelper(source, helperName) {
  return new RegExp(`import \\{[^}]*${helperName}[^}]*\\} from '(?:\\.\\/|\\.\\.\\/)*e2e-helpers'`).test(source)
}

test('[E2E-Helper][import-preview-lock-hints] E2E specs use shared import preview lock hint locators', async () => {
  const offenders = []
  const specs = await listE2eSpecs(testsRoot)

  assert.ok(specs.length > 0, 'contract should discover E2E specs')

  for (const specUrl of specs) {
    const source = await readFile(specUrl, 'utf8')
    const path = relativePath(specUrl)

    for (const { helper, testId, message } of hintHelpers) {
      if (new RegExp(`getByTestId\\(['\"]${testId}['\"]\\)`).test(source)) {
        offenders.push(`${path}: direct ${message} test id`)
      }
      if (new RegExp(`${helper}\\(`).test(source) && !importsHelper(source, helper)) {
        offenders.push(`${path}: ${helper} call without named import`)
      }
    }
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    `E2E specs should use import lock hint helpers so pending-import guard copy/test ids stay centralized: ${offenders.join(', ')}`,
  )
})

test('[E2E-Helper][import-preview-lock-hints] helpers own import preview lock hint test ids', async () => {
  const source = await readFile(helperPath, 'utf8')

  for (const { helper, testId } of hintHelpers) {
    assert.match(source, new RegExp(`export function ${helper}`), `tests/e2e-helpers.ts should export ${helper}(page)`)
    assert.match(source, new RegExp(`${helper}[\\s\\S]*getByTestId\\(['\"]${testId}['\"]\\)`), `${helper} should own ${testId}`)
  }
})

test('[App][config-quality] full verification runs import preview lock hint helper contract', async () => {
  const pkg = JSON.parse(await readFile(packagePath, 'utf8'))
  assert.equal(
    pkg.scripts['test:import-preview-lock-hint-helper-contract'],
    'node --test tests/import-preview-lock-hint-helper-contract.test.mjs',
    'package.json should expose test:import-preview-lock-hint-helper-contract',
  )
  assert.match(pkg.scripts['test:full'], /test:import-preview-lock-hint-helper-contract/, 'pnpm test:full should include the import preview lock hint helper contract')
})
