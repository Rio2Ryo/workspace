import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('..', import.meta.url)
const appPath = new URL('src/App.tsx', `${root}/`)
const importPreviewTestsPath = new URL('tests/import-preview/', `${root}/`)
const docs = [
  'docs/QA.md',
  'docs/QA_RESULT.md',
  'docs/MANUAL_TEST_CHECKLIST.md',
]

const forbiddenDocPatterns = [
  {
    pattern: /localStorage|top3-favorites-items/i,
    message: 'QA docs must not describe the removed localStorage persistence path',
  },
  {
    pattern: /自然文|parseNaturalInput|parseQuickInput|parseSlashInput/,
    message: 'QA docs must not describe unsupported natural-language or legacy slash parsing',
  },
]

async function collectFiles(dirUrl, predicate) {
  const entries = await readdir(dirUrl, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const childUrl = new URL(entry.name, dirUrl)
    if (entry.isDirectory()) {
      files.push(...await collectFiles(new URL(`${entry.name}/`, dirUrl), predicate))
      continue
    }
    if (predicate(entry.name)) {
      files.push(childUrl)
    }
  }

  return files
}

async function collectSpecUrlsByNamePredicate(namePredicate) {
  return collectFiles(new URL('tests/', `${root}/`), (name) => namePredicate(name) && name.endsWith('.e2e.spec.ts'))
}

async function findBeforeEachOffenders(specUrls, blockPattern) {
  const offenders = []

  for (const specUrl of specUrls) {
    const source = await readFile(specUrl, 'utf8')
    const beforeEachBlocks = source.match(/test\.beforeEach\([\s\S]*?\n\}\)/g) ?? []

    for (const block of beforeEachBlocks) {
      if (blockPattern.test(block)) {
        offenders.push(specUrl.pathname.replace(root.pathname, ''))
        break
      }
    }
  }

  return offenders.sort()
}

test('current implementation uses API-backed structured form, not legacy localStorage or natural parsing', async () => {
  const appSource = await readFile(appPath, 'utf8')

  assert.match(appSource, /api<[^>]+>\('\/api\/items'/, 'App should load items from /api/items')
  assert.match(appSource, /JSON\.stringify\(draft\)/, 'App should save the structured draft form')
  assert.doesNotMatch(appSource, /localStorage\.(getItem|setItem)/, 'App should not persist through localStorage')
  assert.doesNotMatch(appSource, /parseNaturalInput|parseQuickInput|parseSlashInput/, 'App should not advertise legacy free-form parsers')
})

test('QA manuals and QA result docs match the current implementation contract', async () => {
  for (const relativePath of docs) {
    const markdown = await readFile(new URL(relativePath, `${root}/`), 'utf8')

    assert.match(markdown, /\/api\/items/, `${relativePath} should name the current API persistence path`)
    assert.match(markdown, /構造化フォーム|個別フォーム|タグ.+順位.+店舗名.+メモ/s, `${relativePath} should describe the structured form UI`)

    for (const { pattern, message } of forbiddenDocPatterns) {
      assert.doesNotMatch(markdown, pattern, `${relativePath}: ${message}`)
    }
  }
})

test('manual checklist includes import preview categories aligned with automated QA structure', async () => {
  const markdown = await readFile(new URL('docs/MANUAL_TEST_CHECKLIST.md', `${root}/`), 'utf8')

  const headings = [
    '#### 4.2.1 direction（追加/保持/削除予定）',
    '#### 4.2.2 live（読み上げ要約）',
    '#### 4.2.3 tags（影響タグ）',
    '#### 4.2.4 terms（差分用語説明）',
    '#### 4.2.5 naming（a11y命名）',
    '#### 4.2.6 summary（件数サマリ）',
  ]

  for (const heading of headings) {
    assert.ok(markdown.includes(heading), `manual checklist missing heading: ${heading}`)
  }
})

test('README links QA docs with import preview six-category guidance', async () => {
  const readme = await readFile(new URL('README.md', `${root}/`), 'utf8')

  assert.match(
    readme,
    /import preview.*direction\s*\/\s*live\s*\/\s*tags\s*\/\s*terms\s*\/\s*naming\s*\/\s*summary/s,
    'README should explicitly mention import preview six-category guidance',
  )
  assert.match(readme, /docs\/MANUAL_TEST_CHECKLIST\.md/, 'README should link MANUAL_TEST_CHECKLIST')
  assert.match(readme, /docs\/AUTOMATED_QA_COVERAGE\.md/, 'README should link AUTOMATED_QA_COVERAGE')
})

test('README provides staged verification commands (quick/docs-only/import-preview-only/full)', async () => {
  const readme = await readFile(new URL('README.md', `${root}/`), 'utf8')

  assert.match(readme, /pnpm test:quick/, 'README should include quick verification command')
  assert.match(readme, /pnpm test:docs-only/, 'README should include docs-only verification command')
  assert.match(readme, /pnpm test:import-preview-only/, 'README should include import-preview-only verification command')
  assert.match(readme, /pnpm test:full/, 'README should include full verification command')
})

test('README includes import preview category-level quick regression commands', async () => {
  const readme = await readFile(new URL('README.md', `${root}/`), 'utf8')
  const commands = [
    'pnpm test:import-preview-direction',
    'pnpm test:import-preview-live',
    'pnpm test:import-preview-tags',
    'pnpm test:import-preview-terms',
    'pnpm test:import-preview-naming',
    'pnpm test:import-preview-summary',
  ]

  for (const command of commands) {
    assert.ok(readme.includes(command), `README should include command: ${command}`)
  }
})

test('import preview specs use shared reset helpers in beforeEach hooks', async () => {
  const specs = await collectFiles(importPreviewTestsPath, (name) => name.endsWith('.e2e.spec.ts'))
  const offenders = []

  for (const specUrl of specs) {
    const source = await readFile(specUrl, 'utf8')
    const beforeEachBlocks = source.match(/test\.beforeEach\([\s\S]*?\n\}\)/g) ?? []

    for (const block of beforeEachBlocks) {
      if (/\/api\/items\?mode=replace/.test(block) || /request\.delete\(`\/api\/items/.test(block)) {
        offenders.push(specUrl.pathname.replace(root.pathname, ''))
        break
      }
    }
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    `import preview beforeEach hooks should call resetItemsByReplace/resetItemsByDelete helpers instead of inline API reset: ${offenders.join(', ')}`,
  )
})

test('import preview specs import reset helpers directly from tests/e2e-helpers.ts', async () => {
  const specs = await collectFiles(importPreviewTestsPath, (name) => name.endsWith('.e2e.spec.ts'))
  const offenders = []

  for (const specUrl of specs) {
    const source = await readFile(specUrl, 'utf8')
    if (source.includes("from '../helpers'") || !source.includes("from '../../e2e-helpers'")) {
      offenders.push(specUrl.pathname.replace(root.pathname, ''))
    }
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    `import preview specs should import reset helpers directly from ../../e2e-helpers: ${offenders.join(', ')}`,
  )
})

test('search specs use shared resetItemsByReplace helper in beforeEach hooks', async () => {
  const specs = await collectSpecUrlsByNamePredicate((name) => name.startsWith('search-'))
  const offenders = await findBeforeEachOffenders(specs, /\/api\/items\?mode=replace/)

  assert.deepEqual(
    offenders,
    [],
    `search beforeEach hooks should call resetItemsByReplace helper instead of inline mode=replace reset: ${offenders.join(', ')}`,
  )
})

test('tag-sync specs use shared resetItemsByReplace helper in beforeEach hooks', async () => {
  const specs = await collectSpecUrlsByNamePredicate((name) => name.startsWith('tag-sync'))
  const offenders = await findBeforeEachOffenders(specs, /\/api\/items\?mode=replace/)

  assert.deepEqual(
    offenders,
    [],
    `tag-sync beforeEach hooks should call resetItemsByReplace helper instead of inline mode=replace reset: ${offenders.join(', ')}`,
  )
})

test('edit/delete specs use shared resetItemsByReplace helper in beforeEach hooks', async () => {
  const specs = await collectSpecUrlsByNamePredicate((name) => name.startsWith('edit') || name.startsWith('delete'))
  const offenders = await findBeforeEachOffenders(specs, /\/api\/items\?mode=replace/)

  assert.deepEqual(
    offenders,
    [],
    `edit/delete beforeEach hooks should call resetItemsByReplace helper instead of inline mode=replace reset: ${offenders.join(', ')}`,
  )
})

test('import specs (outside import-preview) use shared resetItemsByReplace helper for mode=replace resets', async () => {
  const specs = await collectSpecUrlsByNamePredicate((name) => name.startsWith('import-'))
  const offenders = await findBeforeEachOffenders(specs, /\/api\/items\?mode=replace/)

  assert.deepEqual(
    offenders,
    [],
    `import beforeEach hooks should call resetItemsByReplace helper instead of inline mode=replace reset: ${offenders.join(', ')}`,
  )
})

test('import specs (outside import-preview) use shared resetItemsByDelete helper for delete-based resets', async () => {
  const specs = await collectSpecUrlsByNamePredicate((name) => name.startsWith('import-'))
  const offenders = await findBeforeEachOffenders(specs, /request\.delete\(`\/api\/items\?id=/)

  assert.deepEqual(
    offenders,
    [],
    `import beforeEach hooks should call resetItemsByDelete helper instead of inline delete reset: ${offenders.join(', ')}`,
  )
})
