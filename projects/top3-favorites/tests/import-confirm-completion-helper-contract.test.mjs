import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

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

describe('import confirm completion helper contract', () => {
  it('centralizes import confirmation click and completion status wait in e2e-helpers', () => {
    const helperSource = readFileSync(helperPath, 'utf-8')

    assert.match(
      helperSource,
      /export async function confirmImportAndWaitForStatus\(\s*page: Page,\s*text: string \| RegExp\s*\): Promise<void> \{[\s\S]*?await importConfirmButton\(page\)\.click\(\)[\s\S]*?await expectOperationStatus\(page, text\)[\s\S]*?\}/,
      'e2e-helpers.ts should expose confirmImportAndWaitForStatus(page, text) that owns confirm click + operation status wait',
    )
  })

  it('prevents specs from clicking importConfirmButton without the completion helper', () => {
    const offenders = e2eSpecFiles()
      .map((filePath) => ({ filePath, source: readFileSync(filePath, 'utf-8') }))
      .filter(({ source }) => /importConfirmButton\(page\)\.click\(\)/.test(source))
      .map(({ filePath }) => relative(filePath))

    assert.deepEqual(
      offenders,
      [],
      `Use confirmImportAndWaitForStatus(page, expectedStatus) instead of raw importConfirmButton(page).click():\n${offenders.join('\n')}`,
    )
  })

  it('requires specs using the completion helper to import it explicitly', () => {
    const offenders = e2eSpecFiles()
      .map((filePath) => ({ filePath, source: readFileSync(filePath, 'utf-8') }))
      .filter(({ source }) => /confirmImportAndWaitForStatus\(/.test(source))
      .filter(({ source }) => !/import\s*\{[^}]*\bconfirmImportAndWaitForStatus\b[^}]*\}\s*from\s*['"][.\/]+e2e-helpers['"]/.test(source))
      .map(({ filePath }) => relative(filePath))

    assert.deepEqual(
      offenders,
      [],
      `Specs that call confirmImportAndWaitForStatus must import the named helper from e2e-helpers:\n${offenders.join('\n')}`,
    )
  })

  it('is wired into package scripts and full verification', () => {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
    assert.equal(
      packageJson.scripts['test:import-confirm-completion-helper-contract'],
      'node --test tests/import-confirm-completion-helper-contract.test.mjs',
    )
    assert.match(
      packageJson.scripts['test:full'],
      /pnpm test:import-confirm-completion-helper-contract/,
      'test:full should run the import confirm completion helper contract',
    )
  })
})
