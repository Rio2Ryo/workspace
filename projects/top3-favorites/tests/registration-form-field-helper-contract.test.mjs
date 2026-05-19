import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const testsDir = new URL('.', import.meta.url)
const helperPath = new URL('./e2e-helpers.ts', import.meta.url)

async function listE2eSpecs(dir = testsDir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = await Promise.all(entries.map(async (entry) => {
    const fullPath = new URL(entry.name, dir)
    if (entry.isDirectory()) {
      return listE2eSpecs(new URL(`${entry.name}/`, dir))
    }
    return entry.isFile() && entry.name.endsWith('.e2e.spec.ts') ? [fullPath] : []
  }))
  return files.flat()
}

const directRegistrationFieldPatterns = [
  { helper: 'registrationTagField', label: 'タグ', pattern: /\.getByLabel\(['"]タグ['"],\s*\{\s*exact:\s*true\s*\}\)/g },
  { helper: 'registrationLocationField', label: '場所', pattern: /\.getByLabel\(['"]場所['"],\s*\{\s*exact:\s*true\s*\}\)/g },
  { helper: 'registrationNameField', label: '店舗名', pattern: /\.getByLabel\(['"]店舗名['"],\s*\{\s*exact:\s*true\s*\}\)/g },
  { helper: 'registrationMemoField', label: 'メモ', pattern: /\.getByLabel\(['"]メモ['"],\s*\{\s*exact:\s*true\s*\}\)/g },
]

describe('registration form field helpers', () => {
  it('e2e-helpers owns the registration form accessible-name locators', async () => {
    const helperSource = await readFile(helperPath, 'utf-8')

    for (const { helper, label } of directRegistrationFieldPatterns) {
      assert.match(helperSource, new RegExp(`export function ${helper}\\(page: Page\\): Locator`), `${helper} should be exported from e2e-helpers.ts`)
      assert.match(helperSource, new RegExp(`name: ['"]${label}['"]`), `${helper} should own the ${label} accessible name`)
    }
  })

  it('E2E specs use registration form field helpers instead of direct label locators', async () => {
    const specs = await listE2eSpecs()
    const violations = []

    for (const specUrl of specs) {
      const source = await readFile(specUrl, 'utf-8')
      const relativePath = path.relative(process.cwd(), specUrl.pathname)

      for (const { helper, label, pattern } of directRegistrationFieldPatterns) {
        const matches = [...source.matchAll(pattern)]
        for (const match of matches) {
          const line = source.slice(0, match.index).split('\n').length
          violations.push(`${relativePath}:${line} uses direct registration ${label} locator; use ${helper}(page)`)
        }
      }
    }

    assert.deepEqual(violations, [])
  })
})
