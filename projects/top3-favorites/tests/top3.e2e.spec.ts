import { expect, test } from '@playwright/test'

test.beforeEach(async ({ request }) => {
  const data = await request.get('/api/items').then((res) => res.json()) as { items: { id: string }[] }
  for (const item of data.items) {
    await request.delete(`/api/items?id=${encodeURIComponent(item.id)}`)
  }
})

test('sample data can be saved, searched, and ranked through the real UI/API', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))

  await page.goto('/')
  await expect(page.locator('.status', { hasText: 'DB保存' })).toBeVisible()

  await page.getByRole('button', { name: 'サンプルをDB保存' }).click()
  await expect(page.getByText('サンプルをDBに保存しました。')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'カフェラテ' })).toBeVisible()
  await expect(page.getByText('1位: Solito MAGO')).toBeVisible()
  await expect(page.getByText('2位: T-SITEのカフェ')).toBeVisible()

  const searchSection = page.locator('section.card').filter({ has: page.getByRole('heading', { name: '探す' }) })
  await page.getByPlaceholder('例: カフェラテ / 柏の葉 / Solito').fill('Solito')
  await expect(searchSection.getByText('1位: Solito MAGO')).toBeVisible()
  await expect(searchSection.getByText('T-SITEのカフェ')).not.toBeVisible()

  expect(errors).toEqual([])
})

test('adding a new first place rebalances the same tag to top 3', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'サンプルをDB保存' }).click()
  await expect(page.getByText('サンプルをDBに保存しました。')).toBeVisible()

  await page.getByLabel('タグ', { exact: true }).fill('カフェラテ')
  await page.getByLabel('場所', { exact: true }).fill('柏の葉')
  await page.getByLabel('店舗名', { exact: true }).fill('New Coffee')
  await page.getByLabel('メモ', { exact: true }).fill('検証用の新1位')
  await page.getByRole('button', { name: '登録 1位に入れる' }).click()
  await page.getByRole('button', { name: 'DBに保存' }).click()

  await expect(page.getByRole('status')).toContainText('カフェラテ の1位に保存しました。')
  await page.getByPlaceholder('例: カフェラテ / 柏の葉 / Solito').fill('')

  await expect(page.getByText('1位: New Coffee')).toBeVisible()
  await expect(page.getByText('2位: Solito MAGO')).toBeVisible()
  await expect(page.getByText('3位: T-SITEのカフェ')).toBeVisible()
})
