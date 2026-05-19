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
  {
    helper: 'registrationTagField',
    label: 'タグ',
    patterns: [
      /\.getByLabel\(['"]タグ['"],\s*\{\s*exact:\s*true\s*\}\)/g,
      /\.getByRole\(['"]combobox['"],\s*\{\s*name:\s*['"]タグ['"]\s*\}\)/g,
    ],
  },
  {
    helper: 'registrationLocationField',
    label: '場所',
    patterns: [
      /\.getByLabel\(['"]場所['"],\s*\{\s*exact:\s*true\s*\}\)/g,
      /\.getByRole\(['"]textbox['"],\s*\{\s*name:\s*['"]場所['"]\s*\}\)/g,
    ],
  },
  {
    helper: 'registrationNameField',
    label: '店舗名',
    patterns: [
      /\.getByLabel\(['"]店舗名['"],\s*\{\s*exact:\s*true\s*\}\)/g,
      /\.getByRole\(['"]textbox['"],\s*\{\s*name:\s*['"]店舗名['"]\s*\}\)/g,
    ],
  },
  {
    helper: 'registrationMemoField',
    label: 'メモ',
    patterns: [
      /\.getByLabel\(['"]メモ['"],\s*\{\s*exact:\s*true\s*\}\)/g,
      /\.getByRole\(['"]textbox['"],\s*\{\s*name:\s*['"]メモ['"]\s*\}\)/g,
    ],
  },
]

function directRegistrationFieldViolations(source, relativePath = 'fixture.e2e.spec.ts') {
  const violations = []

  for (const { helper, label, patterns } of directRegistrationFieldPatterns) {
    for (const pattern of patterns) {
      const matches = [...source.matchAll(pattern)]
      for (const match of matches) {
        const line = source.slice(0, match.index).split('\n').length
        violations.push(`${relativePath}:${line} uses direct registration ${label} locator; use ${helper}(page)`)
      }
    }
  }

  return violations.sort((a, b) => {
    const lineA = Number(a.match(/:(\d+) uses direct/)?.[1] ?? 0)
    const lineB = Number(b.match(/:(\d+) uses direct/)?.[1] ?? 0)
    return lineA - lineB || a.localeCompare(b)
  })
}

describe('registration form field helpers', () => {
  it('e2e-helpers owns the registration form accessible-name locators', async () => {
    const helperSource = await readFile(helperPath, 'utf-8')

    for (const { helper, label } of directRegistrationFieldPatterns) {
      assert.match(helperSource, new RegExp(`export function ${helper}\\(page: Page\\): Locator`), `${helper} should be exported from e2e-helpers.ts`)
      assert.match(helperSource, new RegExp(`name: ['"]${label}['"]`), `${helper} should own the ${label} accessible name`)
    }
  })

  it('rejects direct role-based registration field locators, not only getByLabel', () => {
    const source = `
      await page.getByRole('combobox', { name: 'タグ' }).fill('ラーメン')
      await page.getByRole('textbox', { name: '店舗名' }).fill('とみ田')
      await page.getByRole('textbox', { name: '場所' }).fill('松戸')
      await page.getByRole('textbox', { name: 'メモ' }).fill('濃厚')
    `

    assert.deepEqual(directRegistrationFieldViolations(source), [
      'fixture.e2e.spec.ts:2 uses direct registration タグ locator; use registrationTagField(page)',
      'fixture.e2e.spec.ts:3 uses direct registration 店舗名 locator; use registrationNameField(page)',
      'fixture.e2e.spec.ts:4 uses direct registration 場所 locator; use registrationLocationField(page)',
      'fixture.e2e.spec.ts:5 uses direct registration メモ locator; use registrationMemoField(page)',
    ])
  })

  it('E2E specs use registration form field helpers instead of direct registration field locators', async () => {
    const specs = await listE2eSpecs()
    const violations = []

    for (const specUrl of specs) {
      const source = await readFile(specUrl, 'utf-8')
      const relativePath = path.relative(process.cwd(), specUrl.pathname)

      violations.push(...directRegistrationFieldViolations(source, relativePath))
    }

    assert.deepEqual(violations, [])
  })
})
