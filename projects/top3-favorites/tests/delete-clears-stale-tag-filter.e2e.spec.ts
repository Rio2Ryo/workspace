import { expect, test } from '@playwright/test'

test.beforeEach(async ({ request }) => {
  const data = (await request.get('/api/items').then((res) => res.json())) as { items: { id: string }[] }
  for (const item of data.items) {
    await request.delete(`/api/items?id=${encodeURIComponent(item.id)}`)
  }
})

test('deleting the last item in selected tag clears stale tag filter and keeps remaining tags visible', async ({ page }) => {
  await page.goto('/')

  // Seed two tags via real UI
  await page.getByLabel('タグ', { exact: true }).fill('削除対象タグ')
  await page.getByLabel('場所', { exact: true }).fill('柏')
  await page.getByLabel('店舗名', { exact: true }).fill('Delete Me')
  await page.getByRole('button', { name: 'DBに保存' }).click()
  await expect(page.getByRole('status')).toContainText('削除対象タグ の1位に保存しました。')

  await page.getByLabel('タグ', { exact: true }).fill('残すタグ')
  await page.getByLabel('場所', { exact: true }).fill('松戸')
  await page.getByLabel('店舗名', { exact: true }).fill('Keep Me')
  await page.getByRole('button', { name: 'DBに保存' }).click()
  await expect(page.getByRole('status')).toContainText('残すタグ の1位に保存しました。')

  const searchSection = page.locator('section.card').filter({ has: page.getByRole('heading', { name: '探す' }) })

  // Select the tag we are about to empty
  await searchSection.getByRole('button', { name: '#削除対象タグ' }).click()
  await expect(searchSection.getByText(/\d位: Delete Me/)).toBeVisible()

  // Delete the only item in that selected tag
  await searchSection.getByText(/\d位: Delete Me/).click()
  page.once('dialog', async (dialog) => {
    await dialog.accept()
  })
  await searchSection.getByRole('button', { name: 'Delete Meを削除' }).click()

  await expect(page.getByRole('status')).toContainText('削除しました。')

  // Stale selectedTag should be cleared so remaining data is visible
  await expect(searchSection.getByRole('button', { name: 'タグ解除' })).not.toBeVisible()
  await expect(searchSection.getByRole('heading', { name: '残すタグ' })).toBeVisible()
  await expect(searchSection.getByText(/\d位: Keep Me/)).toBeVisible()

  await page.reload()
  await expect(searchSection.getByRole('heading', { name: '残すタグ' })).toBeVisible()
  await expect(searchSection.getByText(/\d位: Keep Me/)).toBeVisible()
  await expect(searchSection.getByText('Delete Me')).not.toBeVisible()
})
