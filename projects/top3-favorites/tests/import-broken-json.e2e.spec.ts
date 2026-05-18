import { expect, test } from '@playwright/test'

test.beforeEach(async ({ request }) => {
  await request.post('/api/items?mode=replace', { data: { items: [] } })
})

test('importing broken JSON shows parse error and keeps existing data (fail-closed)', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'サンプルをDB保存' }).click()
  await expect(page.getByRole('status')).toContainText('サンプルをDBに保存しました。')

  await page.locator('input[type="file"][accept*="json"]').setInputFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"items":[', 'utf-8'),
  })

  await expect(page.getByRole('alert')).toContainText('インポート失敗: JSONの読み取りに失敗しました。既存データは保持しました。')

  const searchSection = page.locator('section.card').filter({ has: page.getByRole('heading', { name: '探す' }) })
  await expect(searchSection.getByText('1位: Solito MAGO')).toBeVisible()
  await expect(searchSection.getByText('2位: T-SITEのカフェ')).toBeVisible()
  await expect(page.locator('[aria-label="インポート確認"]')).not.toBeVisible()
})
