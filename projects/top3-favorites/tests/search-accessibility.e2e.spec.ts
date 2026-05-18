import { expect, test } from '@playwright/test'

test.beforeEach(async ({ request }) => {
  const data = (await request.get('/api/items').then((res) => res.json())) as { items: { id: string }[] }
  for (const item of data.items) {
    await request.delete(`/api/items?id=${encodeURIComponent(item.id)}`)
  }
})

test('search field has an accessible name and filters saved Top3 items', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'サンプルをDB保存' }).click()
  await expect(page.getByRole('status')).toContainText('サンプルをDBに保存しました。')

  const search = page.getByRole('textbox', { name: 'Top3検索' })
  await expect(search).toBeVisible()
  await search.fill('松戸')

  await expect(page.getByText('1位: とみ田')).toBeVisible()
  await expect(page.getByText('1位: Solito MAGO')).not.toBeVisible()
})
