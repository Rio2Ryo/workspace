import { expect, test } from '@playwright/test'
import { uploadJsonImportFile, parseImportPreviewSummary, resetItemsByReplace, registrationSaveButton, expectOperationAlert, expectOperationStatus } from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('summary json transitions correctly across valid -> invalid -> valid import flow', async ({ page }) => {
  await page.goto('/')

  await page.getByLabel('タグ', { exact: true }).fill('カフェラテ')
  await page.getByLabel('場所', { exact: true }).fill('柏の葉')
  await page.getByLabel('店舗名', { exact: true }).fill('Baseline')
  await registrationSaveButton(page).click()
  await expectOperationStatus(page, 'カフェラテ の1位に保存しました。')
  const now = new Date().toISOString()
  const validItems = [
    { id: 'r1', tag: 'プリン', location: '浅草', name: 'A', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'r2', tag: 'プリン', location: '浅草', name: 'B', rank: 2, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]

  // valid: preview summary exists and has coherent values
  await uploadJsonImportFile(page, 'valid-1.json', validItems)

  const summaryNode = page.getByTestId('import-preview-summary')
  await expect(summaryNode).toBeVisible()
  const summary1 = await parseImportPreviewSummary<{
    before: number
    after: number
    added: number
    kept: number
  }>(summaryNode)
  expect(summary1.before).toBe(1)
  expect(summary1.after).toBe(2)
  expect(summary1.added + summary1.kept).toBe(summary1.after)

  // invalid in between: preview should be cleared
  await uploadJsonImportFile(page, 'broken.json', '{"broken": ')
  await expectOperationAlert(page, 'インポート失敗: ファイル「broken.json」のJSON構文を解析できません。既存データは保持しました。')
  await expect(page.getByTestId('import-preview-summary')).toHaveCount(0)

  // valid again: summary should be rebuilt coherently
  await uploadJsonImportFile(page, 'valid-2.json', validItems)

  const summaryNode2 = page.getByTestId('import-preview-summary')
  await expect(summaryNode2).toBeVisible()
  const summary2 = await parseImportPreviewSummary<{
    before: number
    after: number
    added: number
    kept: number
    removed: number
  }>(summaryNode2)

  expect(summary2.before).toBe(1)
  expect(summary2.after).toBe(2)
  expect(summary2.added + summary2.kept).toBe(summary2.after)
  expect(summary2.before - summary2.removed).toBe(summary2.kept)
})
