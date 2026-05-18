import { expect, test } from '@playwright/test'

test.beforeEach(async ({ request }) => {
  const data = (await request.get('/api/items').then((res) => res.json())) as { items: { id: string }[] }
  for (const item of data.items) {
    await request.delete(`/api/items?id=${encodeURIComponent(item.id)}`)
  }
})

test('delete removes only the confirmed target item when multiple tags exist', async ({ page }) => {
  await page.goto('/')

  // Seed multiple tags/items via real UI
  await page.getByLabel('タグ', { exact: true }).fill('カフェラテ')
  await page.getByLabel('場所', { exact: true }).fill('柏の葉')
  await page.getByLabel('店舗名', { exact: true }).fill('削除対象A')
  await page.getByRole('button', { name: '登録 1位に入れる' }).click()
  await page.getByRole('button', { name: 'DBに保存' }).click()
  await expect(page.getByRole('status')).toContainText('カフェラテ の1位に保存しました。')

  await page.getByLabel('タグ', { exact: true }).fill('つけ麺')
  await page.getByLabel('場所', { exact: true }).fill('松戸')
  await page.getByLabel('店舗名', { exact: true }).fill('残すB')
  await page.getByRole('button', { name: '登録 1位に入れる' }).click()
  await page.getByRole('button', { name: 'DBに保存' }).click()
  await expect(page.getByRole('status')).toContainText('つけ麺 の1位に保存しました。')

  await page.getByLabel('タグ', { exact: true }).fill('プリン')
  await page.getByLabel('場所', { exact: true }).fill('浅草')
  await page.getByLabel('店舗名', { exact: true }).fill('残すC')
  await page.getByRole('button', { name: '登録 1位に入れる' }).click()
  await page.getByRole('button', { name: 'DBに保存' }).click()
  await expect(page.getByRole('status')).toContainText('プリン の1位に保存しました。')

  // Open target item and delete only that one
  const searchSection = page.locator('section.card').filter({ has: page.getByRole('heading', { name: '探す' }) })
  await searchSection.getByRole('button', { name: '#カフェラテ' }).click()
  await expect(searchSection.getByText(/\d位: 削除対象A/)).toBeVisible()
  await searchSection.getByText(/\d位: 削除対象A/).click()

  let sawDialog = false
  page.once('dialog', async (dialog) => {
    sawDialog = true
    expect(dialog.message()).toContain('削除対象A をTop3から削除しますか？')
    await dialog.accept()
  })

  await page.getByRole('button', { name: '削除対象Aを削除' }).click()

  expect(sawDialog).toBe(true)
  await expect(page.getByRole('status')).toContainText('削除しました。')

  // Target should be deleted
  await expect(page.getByText('削除対象A')).not.toBeVisible()

  // Filter should auto-clear when the selected tag disappears
  await expect(searchSection.getByRole('button', { name: 'タグ解除' })).not.toBeVisible()

  // Other-tag items must remain
  await expect(searchSection.getByText(/\d位: 残すB/)).toBeVisible()
  await expect(searchSection.getByText(/\d位: 残すC/)).toBeVisible()
})
