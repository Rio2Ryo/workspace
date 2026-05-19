import { expect, test } from '@playwright/test'
import {
  expectOperationAlert,
  rankedItemSummary,
  resetItemsByReplace,
  saveSampleItems,
  searchSection as searchSectionLocator,
  uploadJsonImportFile,
} from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('importing broken JSON shows parse error and keeps existing data (fail-closed)', async ({ page }) => {
  await page.goto('/')
  await saveSampleItems(page)

  await uploadJsonImportFile(page, 'broken.json', '{"items":[')

  await expectOperationAlert(page, 'インポート失敗: ファイル「broken.json」のJSON構文を解析できません。既存データは保持しました。')

  const searchSection = searchSectionLocator(page)
  await expect(rankedItemSummary(searchSection, 1, 'Solito MAGO')).toBeVisible()
  await expect(rankedItemSummary(searchSection, 2, 'T-SITEのカフェ')).toBeVisible()
  await expect(page.locator('[aria-label="インポート確認"]')).not.toBeVisible()
})
