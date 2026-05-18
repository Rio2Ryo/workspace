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

function sourceImportsDeleteDialogHelpers(source) {
  return /import \{[^}]*acceptNextDeleteDialog[^}]*\} from '(?:\.\/|\.\.\/)*e2e-helpers'/.test(source)
    || /import \{[^}]*dismissNextDeleteDialog[^}]*\} from '(?:\.\/|\.\.\/)*e2e-helpers'/.test(source)
}

function sourceUsesDeleteDialogHelper(source) {
  return /\b(?:acceptNextDeleteDialog|dismissNextDeleteDialog)\(/.test(source)
}

function sourceUsesDirectDialogHandling(source) {
  return /page\.(?:once\(['"]dialog['"]|waitForEvent\(['"]dialog['"])/.test(source)
    || /\bdialog\.(?:accept|dismiss)\(/.test(source)
}

test('[E2E-Helper][delete-dialog] E2E specs use shared delete confirmation dialog helpers', async () => {
  const offenders = []
  const specs = await listE2eSpecs(testsRoot)

  assert.ok(specs.length > 0, 'contract should discover E2E specs')

  for (const spec of specs) {
    const specUrl = new URL(spec, `${root}/`)
    const source = await readFile(specUrl, 'utf8')
    const usesHelper = sourceUsesDeleteDialogHelper(source)
    const usesDirectDialogHandling = sourceUsesDirectDialogHandling(source)

    if (usesDirectDialogHandling) {
      offenders.push(`${relativePath(specUrl)}: direct delete confirmation dialog handling`)
    }
    if (usesHelper && !sourceImportsDeleteDialogHelpers(source)) {
      offenders.push(`${relativePath(specUrl)}: helper call without named import`)
    }
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    `E2E specs should use acceptNextDeleteDialog()/dismissNextDeleteDialog() so delete confirmation appearance and message assertions stay centralized: ${offenders.join(', ')}`,
  )
})

test('[E2E-Helper][delete-dialog] helpers own delete confirmation appearance and message checks', async () => {
  const source = await readFile(helperPath, 'utf8')

  assert.match(source, /export function acceptNextDeleteDialog/, 'tests/e2e-helpers.ts should export acceptNextDeleteDialog')
  assert.match(source, /export function dismissNextDeleteDialog/, 'tests/e2e-helpers.ts should export dismissNextDeleteDialog')
  assert.match(source, /page\.waitForEvent\(['"]dialog['"]\)/, 'delete dialog helpers should wait for the dialog event')
  assert.match(source, /dialog\.message\(\)/, 'delete dialog helpers should assert the confirmation message when provided')
  assert.match(source, /dialog\.accept\(\)/, 'acceptNextDeleteDialog should accept the dialog')
  assert.match(source, /dialog\.dismiss\(\)/, 'dismissNextDeleteDialog should dismiss the dialog')
})
