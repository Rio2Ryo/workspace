import { expect, test } from '@playwright/test'

test.beforeEach(async ({ request }) => {
  const data = (await request.get('/api/items').then((res) => res.json())) as { items: { id: string }[] }
  for (const item of data.items) {
    await request.delete(`/api/items?id=${encodeURIComponent(item.id)}`)
  }
})

test('maps link includes name location and tag in Google Maps search query', async ({ page }) => {
  await page.goto('/')

  await page.getByLabel('タグ', { exact: true }).fill('検証タグ')
  await page.getByLabel('場所', { exact: true }).fill('検証場所')
  await page.getByLabel('店舗名', { exact: true }).fill('検証店')
  await page.getByLabel('メモ', { exact: true }).fill('maps link e2e')
  await page.getByRole('button', { name: '登録 1位に入れる' }).click()
  await page.getByRole('button', { name: 'DBに保存' }).click()

  await expect(page.getByRole('status')).toContainText('検証タグ の1位に保存しました。')

  await page.getByText('1位: 検証店').click()

  const mapsLink = page.getByRole('link', { name: 'Mapsで開く' }).first()
  await expect(mapsLink).toBeVisible()

  const href = await mapsLink.getAttribute('href')
  expect(href).toBeTruthy()

  const url = new URL(href as string)
  expect(url.origin).toBe('https://www.google.com')
  expect(url.pathname).toBe('/maps/search/')
  expect(url.searchParams.get('api')).toBe('1')

  const query = url.searchParams.get('query') ?? ''
  expect(query).toContain('検証店')
  expect(query).toContain('検証場所')
  expect(query).toContain('検証タグ')
})
