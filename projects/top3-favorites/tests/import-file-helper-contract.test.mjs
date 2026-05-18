import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('..', import.meta.url)
const helperPath = new URL('tests/e2e-helpers.ts', `${root}/`)
const testsRoot = new URL('tests/', `${root}/`)
const importPreviewRoot = new URL('tests/import-preview/', `${root}/`)

const validationSpecs = [
  'tests/import-fail-closed-matrix.e2e.spec.ts',
  'tests/import-validation-error-details.e2e.spec.ts',
  'tests/import-validation-trimmed-fields.e2e.spec.ts',
]

const summaryPreviewSpecs = [
  'tests/import-preview/summary/import-preview-excluded-names-collapsed.e2e.spec.ts',
  'tests/import-preview/summary/import-preview-excluded-names-normalized-context.e2e.spec.ts',
  'tests/import-preview/summary/import-preview-excluded-names-tag-context.e2e.spec.ts',
  'tests/import-preview/summary/import-preview-expand-toggles-a11y.e2e.spec.ts',
  'tests/import-preview/summary/import-preview-math-consistency.e2e.spec.ts',
  'tests/import-preview/summary/import-preview-operation-guards-matrix.e2e.spec.ts',
  'tests/import-preview/summary/import-preview-summary.e2e.spec.ts',
  'tests/import-preview/summary/import-preview-zero-metrics-muted.e2e.spec.ts',
]

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

function sourceImportsUploadHelper(source) {
  return /import \{[^}]*uploadJsonImportFile[^}]*\} from '(?:\.\/|\.\.\/)*e2e-helpers'/.test(source)
}

function sourceUsesDirectJsonUpload(source) {
  return /locator\('input\[type="file"\]\[accept\*="json"\]'\)|\.setInputFiles\(/.test(source)
}

function relativePath(url) {
  return url.pathname.replace(root.pathname, '').replace(/^\/+/, '')
}

test('[E2E-Helper][import-file] validation specs upload JSON through shared helper', async () => {
  const offenders = []

  for (const spec of validationSpecs) {
    const specUrl = new URL(spec, `${root}/`)
    const source = await readFile(specUrl, 'utf8')
    if (!source.includes("from './e2e-helpers'") || !/uploadJsonImportFile\(/.test(source)) {
      offenders.push(relativePath(specUrl))
    }
    if (sourceUsesDirectJsonUpload(source)) {
      offenders.push(`${relativePath(specUrl)}: direct file input upload`)
    }
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    `import validation specs should use uploadJsonImportFile() so file input selector, mime type, and JSON/string buffer creation stay centralized: ${offenders.join(', ')}`,
  )
})

test('[E2E-Helper][import-file] import preview summary specs upload JSON through shared helper', async () => {
  const offenders = []

  for (const spec of summaryPreviewSpecs) {
    const specUrl = new URL(spec, `${root}/`)
    const source = await readFile(specUrl, 'utf8')
    if (!sourceImportsUploadHelper(source) || !/uploadJsonImportFile\(/.test(source)) {
      offenders.push(relativePath(specUrl))
    }
    if (sourceUsesDirectJsonUpload(source)) {
      offenders.push(`${relativePath(specUrl)}: direct file input upload`)
    }
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    `import preview summary specs should use uploadJsonImportFile() so import-preview UX contracts share the same file upload mechanics: ${offenders.join(', ')}`,
  )
})

test('[E2E-Helper][import-file] all import preview specs upload JSON through shared helper', async () => {
  const offenders = []
  const specs = await listE2eSpecs(importPreviewRoot)

  assert.ok(specs.length > 0, 'contract should discover import-preview E2E specs')

  for (const spec of specs) {
    const specUrl = new URL(spec, `${root}/`)
    const source = await readFile(specUrl, 'utf8')
    const usesUploadHelper = /uploadJsonImportFile\(/.test(source)
    const usesDirectUpload = sourceUsesDirectJsonUpload(source)

    if (usesDirectUpload) {
      offenders.push(`${relativePath(specUrl)}: direct file input upload`)
    }
    if (usesUploadHelper && !sourceImportsUploadHelper(source)) {
      offenders.push(`${relativePath(specUrl)}: helper call without named import`)
    }
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    `import preview specs should share uploadJsonImportFile() for JSON import setup across categories: ${offenders.join(', ')}`,
  )
})

test('[E2E-Helper][import-file] all E2E specs share JSON import upload mechanics', async () => {
  const offenders = []
  const specs = await listE2eSpecs(testsRoot)

  assert.ok(specs.length > 0, 'contract should discover E2E specs')

  for (const spec of specs) {
    const specUrl = new URL(spec, `${root}/`)
    const source = await readFile(specUrl, 'utf8')
    const usesUploadHelper = /uploadJsonImportFile\(/.test(source)
    const usesDirectUpload = sourceUsesDirectJsonUpload(source)

    if (usesDirectUpload) {
      offenders.push(`${relativePath(specUrl)}: direct file input upload`)
    }
    if (usesUploadHelper && !sourceImportsUploadHelper(source)) {
      offenders.push(`${relativePath(specUrl)}: helper call without named import`)
    }
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    `E2E specs should use uploadJsonImportFile() for JSON import setup instead of duplicating selectors, MIME type, and buffers: ${offenders.join(', ')}`,
  )
})

test('[E2E-Helper][import-file] uploadJsonImportFile helper owns selector/mime/buffer mechanics', async () => {
  const source = await readFile(helperPath, 'utf8')

  assert.match(source, /export async function uploadJsonImportFile/, 'tests/e2e-helpers.ts should export uploadJsonImportFile')
  assert.match(source, /input\[type="file"\]\[accept\*="json"\]/, 'helper should own the JSON file input selector')
  assert.match(source, /mimeType: 'application\/json'/, 'helper should own the import JSON mime type')
  assert.match(source, /typeof body === 'string' \? body : JSON\.stringify\(body\)/, 'helper should support both raw invalid JSON strings and serializable JSON bodies')
  assert.match(source, /Buffer\.from\([^\n]*'utf-8'\)/, 'helper should create the UTF-8 upload buffer')
})
