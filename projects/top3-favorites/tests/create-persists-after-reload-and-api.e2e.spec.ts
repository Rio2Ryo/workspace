import { expect, test } from '@playwright/test'
import { resetItemsByReplace, registrationSaveButton, expectOperationStatus } from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('newly created item remains after reload and exists in API data', async ({ page, request }) => {
  await page.goto('/')

  await page.getByLabel('タグ', { exact: true }).fill('永続化タグ')
  await page.getByLabel('場所', { exact: true }).fill('柏')
  await page.getByLabel('店舗名', { exact: true }).fill('Persist New Item')
  await page.getByLabel('メモ', { exact: true }).fill('reload persistence contract')
  await page.getByRole('button', { name: '登録 2位に入れる' }).click()
  await registrationSaveButton(page).click()

  await expectOperationStatus(page, '永続化タグ の2位に保存しました。')

  const searchSection = page.locator('section.card').filter({ has: page.getByRole('heading', { name: '探す' }) })
  await expect(searchSection.getByText(/2位:\s*Persist New Item/)).toBeVisible()

  await page.reload()

  await expect(searchSection.getByText(/2位:\s*Persist New Item/)).toBeVisible()
  await expect(searchSection.getByRole('heading', { name: '永続化タグ' })).toBeVisible()

  const apiData = (await request.get('/api/items').then((res) => res.json())) as {
    items: { name: string; tag: string; location: string; memo: string; rank: number }[]
  }

  const saved = apiData.items.find((item) => item.name === 'Persist New Item')
  expect(saved).toBeTruthy()
  expect(saved?.tag).toBe('永続化タグ')
  expect(saved?.location).toBe('柏')
  expect(saved?.memo).toBe('reload persistence contract')
  expect(saved?.rank).toBe(2)
})
