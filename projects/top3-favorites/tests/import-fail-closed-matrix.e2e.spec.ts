import { expect, test } from '@playwright/test'
import {
  confirmImportAndWaitForStatus,
  expectOperationAlert,
  expectOperationStatus,
  fetchItems,
  importPreviewPanel,
  registrationLocationField,
  registrationNameField,
  registrationSaveButton,
  registrationTagField,
  resetItemsByReplace,
  uploadJsonImportFile,
} from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('import fail-closed matrix: all invalid inputs keep existing data and clear pending preview', async ({ page, request }) => {
  await page.goto('/')

  // seed baseline data to verify retention
  await registrationTagField(page).fill('カフェラテ')
  await registrationLocationField(page).fill('柏の葉')
  await registrationNameField(page).fill('Baseline Keep')
  await registrationSaveButton(page).click()
  await expectOperationStatus(page, 'カフェラテ の1位に保存しました。')

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
      expected: /ファイル「invalid-shape\.json」の1件目 \/ フィールド: tag \/ 修正: タグを入力してください/,
    },
    {
      name: 'duplicate-id.json',
      body: [
        { id: 'dup', tag: 'プリン', location: '浅草', name: 'A', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
        { id: 'dup', tag: 'プリン', location: '浅草', name: 'B', rank: 2, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
      ],
      expected: /ID「dup」が1件目「A」と2件目「B」で重複しています/,
    },
    {
      name: 'broken-json.json',
      body: '{"broken": ',
      expected: /ファイル「broken-json\.json」のJSON構文を解析できません/,
    },
  ]

  for (const c of cases) {
    await uploadJsonImportFile(page, c.name, c.body)

    await expectOperationAlert(page, c.expected)
    await expect(importPreviewPanel(page)).toHaveCount(0)

    const apiData = await fetchItems<{ items: { name: string }[] }>(request)
    expect(apiData.items).toHaveLength(1)
    expect(apiData.items[0]?.name).toBe('Baseline Keep')
  }

  // recovery scenario: valid -> invalid -> valid should still recover correctly
  const validItems = [
    { id: 'ok-1', tag: 'スイーツ', location: '浅草', name: 'Valid A', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'ok-2', tag: 'スイーツ', location: '浅草', name: 'Valid B', rank: 2, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]

  await uploadJsonImportFile(page, 'valid-first.json', validItems)
  await expect(importPreviewPanel(page)).toBeVisible()

  await uploadJsonImportFile(page, 'invalid-middle.json', '{"broken": ')
  await expectOperationAlert(page, /ファイル「invalid-middle\.json」のJSON構文を解析できません/)
  await expect(importPreviewPanel(page)).toHaveCount(0)

  await uploadJsonImportFile(page, 'valid-last.json', validItems)
  await expect(importPreviewPanel(page)).toBeVisible()
  await confirmImportAndWaitForStatus(page, 'インポート成功: 2件を反映しました。')

  const finalApiData = await fetchItems<{ items: { name: string }[] }>(request)
  expect(finalApiData.items).toHaveLength(2)
  expect(finalApiData.items.map((v) => v.name).sort()).toEqual(['Valid A', 'Valid B'])
})
