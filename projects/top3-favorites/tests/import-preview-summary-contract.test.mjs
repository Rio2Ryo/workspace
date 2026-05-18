import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  IMPORT_PREVIEW_SUMMARY_SCHEMA,
  IMPORT_PREVIEW_SUMMARY_VERSION,
  validateImportPreviewSummary,
} from '../src/shared/import-preview-summary-contract.mjs'

test('[App][import-preview-summary] shared contract accepts the current versioned summary shape', () => {
  const summary = {
    schema: 'top3-import-preview-summary',
    version: 1,
    before: 3,
    after: 4,
    normalizationBefore: 5,
    normalizationAfter: 4,
    added: 3,
    kept: 1,
    removed: 2,
    excluded: 1,
    tags: ['カフェラテ', 'プリン'],
    excludedNames: ['New 3'],
    excludedNameLabels: ['カフェラテ: New 3'],
    excludedDetailLabels: ['カフェラテ: New 3'],
    normalizedExcludedNameGroups: [
      {
        key: 'new 3',
        names: ['New 3'],
        labels: ['カフェラテ: New 3'],
      },
    ],
    excludedDetails: [
      { tag: 'カフェラテ', name: 'New 3', reason: 'カフェラテでTop3外: 4位相当' },
    ],
  }

  assert.equal(IMPORT_PREVIEW_SUMMARY_SCHEMA, 'top3-import-preview-summary')
  assert.equal(IMPORT_PREVIEW_SUMMARY_VERSION, 1)
  assert.equal(validateImportPreviewSummary(summary), null)
})

test('[App][import-preview-summary] shared contract reports actionable schema and invariant errors', () => {
  assert.match(
    validateImportPreviewSummary({ schema: 'wrong', version: 1 }),
    /schema must be top3-import-preview-summary/,
  )
  assert.match(
    validateImportPreviewSummary({ schema: 'top3-import-preview-summary', version: 1, before: 3, after: 3, added: 1, kept: 1, removed: 2, excluded: 0, normalizationBefore: 2, normalizationAfter: 2, tags: [], excludedNames: [], excludedNameLabels: [], excludedDetailLabels: [], normalizedExcludedNameGroups: [], excludedDetails: [] }),
    /added \+ kept must equal after/,
  )
})

test('[App][import-preview-summary] App uses the shared schema constant instead of hard-coded contract text', async () => {
  const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.match(appSource, /import \{[^}]*IMPORT_PREVIEW_SUMMARY_SCHEMA[^}]*IMPORT_PREVIEW_SUMMARY_VERSION[^}]*\} from '\.\/shared\/import-preview-summary-contract\.mjs'/s)
  assert.doesNotMatch(appSource, /schema:\s*'top3-import-preview-summary'/)
  assert.match(appSource, /schema:\s*IMPORT_PREVIEW_SUMMARY_SCHEMA/)
  assert.match(appSource, /version:\s*IMPORT_PREVIEW_SUMMARY_VERSION/)
})

async function listE2eSpecs(dirUrl) {
  const entries = await readdir(dirUrl, { withFileTypes: true })
  const paths = []
  for (const entry of entries) {
    const entryUrl = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, dirUrl)
    if (entry.isDirectory()) {
      paths.push(...await listE2eSpecs(entryUrl))
    } else if (entry.name.endsWith('.e2e.spec.ts')) {
      paths.push(entryUrl)
    }
  }
  return paths
}

test('[App][import-preview-summary] summary E2E assertions use the shared validator helper', async () => {
  const specUrls = await listE2eSpecs(new URL('../tests/', import.meta.url))
  const summarySpecs = []

  for (const specUrl of specUrls) {
    const specSource = await readFile(specUrl, 'utf8')
    if (specSource.includes('data-summary-json') || specSource.includes('parseImportPreviewSummary')) {
      summarySpecs.push({ specUrl, specSource })
    }
  }

  assert.ok(summarySpecs.length > 0, 'summary JSON specs should be discovered')

  for (const { specUrl, specSource } of summarySpecs) {
    const specPath = specUrl.pathname
    assert.match(
      specSource,
      /parseImportPreviewSummary/,
      `${specPath} should call parseImportPreviewSummary so parsing and shared contract validation stay centralized`,
    )
    assert.doesNotMatch(
      specSource,
      /validateImportPreviewSummary|JSON\.parse\([^\n]*(?:summaryJson|summaryAttr|getAttribute\('data-summary-json'\))/,
      `${specPath} should not duplicate summary JSON parsing or validator calls outside the shared E2E helper`,
    )
  }
})
