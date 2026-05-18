import { expect, test } from '@playwright/test'

test.beforeEach(async ({ request }) => {
  await request.post('/api/items?mode=replace', { data: { items: [] } })
})

test('import preview exposes a consistent summary JSON for QA assertions', async ({ page, request }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'サンプルをDB保存' }).click()
  await expect(page.getByRole('status')).toContainText('サンプルをDBに保存しました。')

  const current = (await request.get('/api/items').then((res) => res.json())) as { items: Array<{ id: string }> }
  const keepId = current.items[0].id

  const now = new Date().toISOString()
  const payload = [
    { id: keepId, tag: 'プリン', location: '浅草', name: 'Keep Existing', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'new-1', tag: 'カフェラテ', location: '柏の葉', name: 'New 1', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'new-2', tag: 'カフェラテ', location: '柏の葉', name: 'New 2', rank: 2, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'new-3', tag: 'カフェラテ', location: '柏の葉', name: 'New 3', rank: 3, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'new-4', tag: 'カフェラテ', location: '柏の葉', name: 'New 4', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]

  await page.locator('input[type="file"][accept*="json"]').setInputFiles({
    name: 'summary-json.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(payload), 'utf-8'),
  })

  const summaryAttr = await page.getByTestId('import-preview-summary').getAttribute('data-summary-json')
  expect(summaryAttr).toBeTruthy()

  const summary = JSON.parse(summaryAttr as string) as {
    version: number
    before: number
    after: number
    normalizationBefore: number
    normalizationAfter: number
    added: number
    kept: number
    removed: number
    excluded: number
    tags: string[]
    excludedNames: string[]
  }

  // schema contract guard: required keys must exist for version 1
  const requiredKeys = [
    'version',
    'before',
    'after',
    'normalizationBefore',
    'normalizationAfter',
    'added',
    'kept',
    'removed',
    'excluded',
    'tags',
    'excludedNames',
  ] as const
  for (const key of requiredKeys) {
    expect(summary).toHaveProperty(key)
  }

  expect(summary.version).toBe(1)
  expect(typeof summary.before).toBe('number')
  expect(typeof summary.after).toBe('number')
  expect(typeof summary.normalizationBefore).toBe('number')
  expect(typeof summary.normalizationAfter).toBe('number')
  expect(typeof summary.added).toBe('number')
  expect(typeof summary.kept).toBe('number')
  expect(typeof summary.removed).toBe('number')
  expect(typeof summary.excluded).toBe('number')
  expect(Array.isArray(summary.tags)).toBe(true)
  expect(Array.isArray(summary.excludedNames)).toBe(true)
  expect(summary.before).toBe(3)
  expect(summary.after).toBe(4)
  expect(summary.normalizationBefore).toBe(5)
  expect(summary.normalizationAfter).toBe(4)
  expect(summary.added + summary.kept).toBe(summary.after)
  expect(summary.before - summary.removed).toBe(summary.kept)
  expect(summary.excluded).toBe(1)
  expect(summary.excludedNames).toEqual(['New 3'])
  expect(summary.tags).toEqual(['カフェラテ', 'つけ麺', 'プリン'].sort((a, b) => a.localeCompare(b, 'ja')))

  await expect(page.getByTestId('import-preview-excluded-names')).toContainText('除外予定の店舗: New 3')
})
