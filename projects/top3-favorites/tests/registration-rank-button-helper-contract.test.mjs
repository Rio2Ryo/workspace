import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

const root = new URL('..', import.meta.url)
const testsRoot = new URL('tests/', `${root}/`)
const helperPath = new URL('tests/e2e-helpers.ts', `${root}/`)

async function collectE2ESpecs(dirUrl = testsRoot) {
  const entries = await readdir(dirUrl, { withFileTypes: true })
  const specs = []
  for (const entry of entries) {
    const childUrl = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dirUrl)
    if (entry.isDirectory()) {
      specs.push(...await collectE2ESpecs(childUrl))
      continue
    }
    if (entry.isFile() && entry.name.endsWith('.e2e.spec.ts')) specs.push(childUrl)
  }
  return specs.sort((a, b) => a.pathname.localeCompare(b.pathname, 'en'))
}

function relativePath(fileUrl) {
  return path.relative(root.pathname, fileUrl.pathname)
}

const directRegistrationRankButtonPattern = /getByRole\(['"]button['"],\s*\{\s*name:\s*['"]登録 [123]位に入れる['"]\s*\}\)/
const directEditRankButtonPattern = /getByRole\(['"]button['"],\s*\{\s*name:\s*['"]編集 [123]位に変更['"]\s*\}\)/

function importsNamedHelper(source, helperName) {
  const importMatch = source.match(/import\s*\{([\s\S]*?)\}\s*from\s*['"][^'"]*e2e-helpers['"]/)
  return Boolean(importMatch && importMatch[1].split(',').map((name) => name.trim()).includes(helperName))
}

test('[E2E-Helper][rank-button] E2E specs use shared rank button helpers', async () => {
  const offenders = []

  for (const specUrl of await collectE2ESpecs()) {
    const source = await readFile(specUrl, 'utf8')
    const usesRegistrationHelper = source.includes('registrationRankButton(')
    const usesEditHelper = source.includes('editRankButton(')

    if (directRegistrationRankButtonPattern.test(source)) {
      offenders.push(`${relativePath(specUrl)}: direct registration rank button locator`)
    }
    if (directEditRankButtonPattern.test(source)) {
      offenders.push(`${relativePath(specUrl)}: direct edit rank button locator`)
    }
    if (usesRegistrationHelper && !importsNamedHelper(source, 'registrationRankButton')) {
      offenders.push(`${relativePath(specUrl)}: registrationRankButton call without named import`)
    }
    if (usesEditHelper && !importsNamedHelper(source, 'editRankButton')) {
      offenders.push(`${relativePath(specUrl)}: editRankButton call without named import`)
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `E2E specs should use registrationRankButton()/editRankButton() so rank-control accessible names stay centralized: ${offenders.join(', ')}`,
  )
})

test('[E2E-Helper][rank-button] helper owns rank button accessible-name construction', async () => {
  const source = await readFile(helperPath, 'utf8')
  assert.match(source, /export function registrationRankButton\(page: Page, rank: 1 \| 2 \| 3\): Locator/, 'e2e helper should expose registrationRankButton(page, rank)')
  assert.match(source, /`登録 \$\{rank\}位に入れる`/, 'registrationRankButton should own the registration rank accessible-name template')
  assert.match(source, /export function editRankButton\(page: Page, rank: 1 \| 2 \| 3\): Locator/, 'e2e helper should expose editRankButton(page, rank)')
  assert.match(source, /`編集 \$\{rank\}位に変更`/, 'editRankButton should own the edit rank accessible-name template')
})
