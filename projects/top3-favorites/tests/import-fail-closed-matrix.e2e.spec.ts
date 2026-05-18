import { expect, test } from '@playwright/test'

test.beforeEach(async ({ request }) => {
  await request.post('/api/items?mode=replace', { data: { items: [] } })
})

test('import fail-closed matrix: all invalid inputs keep existing data and clear pending preview', async ({ page, request }) => {
  await page.goto('/')

  // seed baseline data to verify retention
  await page.getByLabel('タグ', { exact: true }).fill('カフェラテ')
  await page.getByLabel('場所', { exact: true }).fill('柏の葉')
  await page.getByLabel('店舗名', { exact: true }).fill('Baseline Keep')
  await page.getByRole('button', { name: 'DBに保存' }).click()
  await expect(page.getByRole('status')).toContainText('カフェラテ の1位に保存しました。')

  const fileInput = page.locator('input[type="file"][accept*="json"]')
  const now = new Date().toISOString()

  const cases: Array<{ name: string; body: string | object; expected: RegExp }> = [
    {
      name: 'not-array.json',
      body: { foo: 1 },
      expected: /JSON配列形式ではありません/,
    },
    {
      name: 'invalid-shape.json',
      body: [{ id: 'x1', tag: '', name: '', rank: 9 }],
      expected: /不正な要素が含まれています/,
    },
    {
      name: 'duplicate-id.json',
      body: [
        { id: 'dup', tag: 'プリン', location: '浅草', name: 'A', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
        { id: 'dup', tag: 'プリン', location: '浅草', name: 'B', rank: 2, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
      ],
      expected: /IDが重複しています/,
    },
    {
      name: 'broken-json.json',
      body: '{"broken": ',
      expected: /JSONの読み取りに失敗しました/,
    },
  ]

  for (const c of cases) {
    const buffer = Buffer.from(typeof c.body === 'string' ? c.body : JSON.stringify(c.body), 'utf-8')
    await fileInput.setInputFiles({ name: c.name, mimeType: 'application/json', buffer })

    await expect(page.getByRole('alert')).toContainText(c.expected)
    await expect(page.getByLabel('インポート確認')).toHaveCount(0)

    const apiData = (await request.get('/api/items').then((res) => res.json())) as { items: { name: string }[] }
    expect(apiData.items).toHaveLength(1)
    expect(apiData.items[0]?.name).toBe('Baseline Keep')
  }

  // recovery scenario: valid -> invalid -> valid should still recover correctly
  const validItems = [
    { id: 'ok-1', tag: 'スイーツ', location: '浅草', name: 'Valid A', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'ok-2', tag: 'スイーツ', location: '浅草', name: 'Valid B', rank: 2, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]

  await fileInput.setInputFiles({
    name: 'valid-first.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(validItems), 'utf-8'),
  })
  await expect(page.getByLabel('インポート確認')).toBeVisible()

  await fileInput.setInputFiles({
    name: 'invalid-middle.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"broken": ', 'utf-8'),
  })
  await expect(page.getByRole('alert')).toContainText(/JSONの読み取りに失敗しました/)
  await expect(page.getByLabel('インポート確認')).toHaveCount(0)

  await fileInput.setInputFiles({
    name: 'valid-last.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(validItems), 'utf-8'),
  })
  await expect(page.getByLabel('インポート確認')).toBeVisible()
  await page.getByRole('button', { name: 'この内容でインポート' }).click()
  await expect(page.getByRole('status')).toContainText('インポート成功: 2件を反映しました。')

  const finalApiData = (await request.get('/api/items').then((res) => res.json())) as { items: { name: string }[] }
  expect(finalApiData.items).toHaveLength(2)
  expect(finalApiData.items.map((v) => v.name).sort()).toEqual(['Valid A', 'Valid B'])
})
