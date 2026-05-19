import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'

const repoRoot = path.resolve(import.meta.dirname, '..')
const testsDir = path.join(repoRoot, 'tests')
const helperPath = path.join(testsDir, 'e2e-helpers.ts')
const packageJsonPath = path.join(repoRoot, 'package.json')

function e2eSpecFiles(dir = testsDir) {
  return readdirSync(dir)
    .flatMap((entry) => {
      const fullPath = path.join(dir, entry)
      if (statSync(fullPath).isDirectory()) {
        return e2eSpecFiles(fullPath)
      }
      return fullPath.endsWith('.e2e.spec.ts') ? [fullPath] : []
    })
    .sort()
}

function relative(filePath) {
  return path.relative(repoRoot, filePath)
}

function usesImportPreviewListItems(source) {
  return /\bimportPreviewListItems\s*\(/.test(source)
}

function importsImportPreviewListItems(source) {
  return /^import\s*\{[^}]*\bimportPreviewListItems\b[^}]*\}\s*from\s*['"][^'"]*e2e-helpers['"]/m.test(source)
}

function collectDirectListItemOffenders(filePath, source) {
  return [...source.matchAll(/\.getByRole\(\s*['"]listitem['"]\s*\)/g)].map((match) => {
    const line = source.slice(0, match.index).split('\n').length
    return `${relative(filePath)}:${line}: use importPreviewListItems(section) instead of direct section.getByRole('listitem')`
  })
}

describe('import preview list item helper contract', () => {
  it('centralizes import preview listitem role lookup in e2e-helpers', () => {
    const helperSource = readFileSync(helperPath, 'utf-8')

    assert.match(
      helperSource,
      /export function importPreviewListItems\(\s*section: Locator\s*\): Locator \{[\s\S]*?return section\.getByRole\(['"]listitem['"]\)[\s\S]*?\}/,
      'e2e-helpers.ts should expose importPreviewListItems(section) that owns the listitem role lookup for import-preview rows',
    )
  })

  it('fixture proves direct listitem lookups are rejected', () => {
    const fixture = "await expect(importPreviewExcludedNames(page).getByRole('listitem')).toHaveText('D店')"

    assert.deepEqual(
      collectDirectListItemOffenders(path.join(testsDir, 'fixture.e2e.spec.ts'), fixture),
      ["tests/fixture.e2e.spec.ts:1: use importPreviewListItems(section) instead of direct section.getByRole('listitem')"],
    )
  })

  it('prevents E2E specs from duplicating import preview listitem role lookup', () => {
    const offenders = e2eSpecFiles()
      .flatMap((filePath) => collectDirectListItemOffenders(filePath, readFileSync(filePath, 'utf-8')))

    assert.deepEqual(
      offenders,
      [],
      `Import preview list row assertions should use importPreviewListItems(section) so row role semantics stay centralized:\n${offenders.join('\n')}`,
    )
  })

  it('requires specs using importPreviewListItems to import it explicitly', () => {
    const offenders = e2eSpecFiles()
      .map((filePath) => ({ filePath, source: readFileSync(filePath, 'utf-8') }))
      .filter(({ source }) => usesImportPreviewListItems(source))
      .filter(({ source }) => !importsImportPreviewListItems(source))
      .map(({ filePath }) => relative(filePath))

    assert.deepEqual(
      offenders,
      [],
      `Specs that call importPreviewListItems must import it from e2e-helpers:\n${offenders.join('\n')}`,
    )
  })

  it('is wired into package scripts and full verification', () => {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))

    assert.equal(
      packageJson.scripts['test:import-preview-listitem-helper-contract'],
      'node --test tests/import-preview-listitem-helper-contract.test.mjs',
    )
    assert.match(
      packageJson.scripts['test:full'],
      /pnpm test:import-preview-listitem-helper-contract/,
      'test:full should run the import preview listitem helper contract',
    )
  })
})
