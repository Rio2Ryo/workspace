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

function sourceImportsEditFormFieldHelper(source, helperName) {
  return new RegExp(`import \\{[^}]*${helperName}[^}]*\\} from '(?:\\.\\/|\\.\\.\\/)*e2e-helpers'`).test(source)
}

function editFormFieldHelpersUsed(source) {
  return [...source.matchAll(/\b(editNameField|editTagField|editLocationField|editMemoField)\(/g)].map((match) => match[1])
}

function sourceUsesDirectEditFormField(source) {
  return /getByRole\(['"](?:textbox|combobox)['"],\s*\{\s*name:\s*['"]編集 (?:店舗名|タグ|場所|メモ)['"]\s*\}\)/.test(source)
}

test('[E2E-Helper][edit-form-fields] E2E specs use shared edit form field locators', async () => {
  const offenders = []
  const specs = await listE2eSpecs(testsRoot)

  assert.ok(specs.length > 0, 'contract should discover E2E specs')

  for (const spec of specs) {
    const specUrl = new URL(spec, `${root}/`)
    const source = await readFile(specUrl, 'utf8')
    const usedHelpers = editFormFieldHelpersUsed(source)
    const usesDirectField = sourceUsesDirectEditFormField(source)

    if (usesDirectField) {
      offenders.push(`${relativePath(specUrl)}: direct edit form field locator`)
    }
    for (const helperName of usedHelpers) {
      if (!sourceImportsEditFormFieldHelper(source, helperName)) {
        offenders.push(`${relativePath(specUrl)}: ${helperName} call without named import`)
      }
    }
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    `E2E specs should use edit form field helpers so edit accessible names stay centralized: ${offenders.join(', ')}`,
  )
})

test('[E2E-Helper][edit-form-fields] helper owns edit field accessible-name contracts', async () => {
  const source = await readFile(helperPath, 'utf8')

  for (const helperName of ['editNameField', 'editTagField', 'editLocationField', 'editMemoField']) {
    assert.match(source, new RegExp(`export function ${helperName}\\(page: Page\\): Locator`), `tests/e2e-helpers.ts should export ${helperName}`)
  }

  assert.match(source, /editNameField[\s\S]*getByRole\(['"]textbox['"],\s*\{\s*name:\s*['"]編集 店舗名['"]\s*\}\)/, 'editNameField should own the edit name accessible name')
  assert.match(source, /editTagField[\s\S]*getByRole\(['"]combobox['"],\s*\{\s*name:\s*['"]編集 タグ['"]\s*\}\)/, 'editTagField should own the edit tag accessible name')
  assert.match(source, /editLocationField[\s\S]*getByRole\(['"]textbox['"],\s*\{\s*name:\s*['"]編集 場所['"]\s*\}\)/, 'editLocationField should own the edit location accessible name')
  assert.match(source, /editMemoField[\s\S]*getByRole\(['"]textbox['"],\s*\{\s*name:\s*['"]編集 メモ['"]\s*\}\)/, 'editMemoField should own the edit memo accessible name')
})
