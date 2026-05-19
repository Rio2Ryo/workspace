import { expect, test } from '@playwright/test'
import { uploadJsonImportFile, resetItemsByReplace, saveSampleItems } from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('importing broken JSON shows parse error and keeps existing data (fail-closed)', async ({ page }) => {
  await page.goto('/')
  await saveSampleItems(page)

  await uploadJsonImportFile(page, 'broken.json', '{"items":[')

  await expect(page.getByRole('alert')).toContainText('インポート失敗: ファイル「broken.json」のJSON構文を解析できません。既存データは保持しました。')

  const searchSection = page.locator('section.card').filter({ has: page.getByRole('heading', { name: '探す' }) })
  await expect(searchSection.getByText('1位: Solito MAGO')).toBeVisible()
  await expect(searchSection.getByText('2位: T-SITEのカフェ')).toBeVisible()
  await expect(page.locator('[aria-label="インポート確認"]')).not.toBeVisible()
})
