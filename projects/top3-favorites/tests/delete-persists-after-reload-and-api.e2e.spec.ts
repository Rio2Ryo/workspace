import { expect, test } from '@playwright/test'
import { resetItemsByReplace , itemDeleteButton} from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('deleted item stays removed after reload and is absent from API data', async ({ page, request }) => {
  // Seed through the API so this test isolates the delete/reload persistence contract
  // from create-form async state transitions already covered by create persistence specs.
  for (const item of [
    { tag: '削除タグ', location: '柏', name: 'Delete Persist Target', rank: 1, memo: '' },
    { tag: '残存タグ', location: '松戸', name: 'Persist Survivor', rank: 1, memo: '' },
  ]) {
    const response = await request.post('/api/items', { data: item })
    expect(response.status()).toBe(200)
  }

  await page.goto('/')

  const searchSection = page.locator('section.card').filter({ has: page.getByRole('heading', { name: '探す' }) })
  await searchSection.getByRole('button', { name: '#削除タグ' }).click()
  await searchSection.locator('summary', { hasText: /1位:\s*Delete Persist Target/ }).click()

  page.once('dialog', async (dialog) => {
    await dialog.accept()
  })
  await itemDeleteButton(searchSection, 'Delete Persist Target').click()
  await expect(page.getByRole('status')).toContainText('削除しました。')

  // UI state before reload
  await expect(searchSection.getByText('Delete Persist Target')).toHaveCount(0)
  await searchSection.getByRole('button', { name: '#残存タグ' }).click()
  await expect(searchSection.getByText(/1位:\s*Persist Survivor/)).toBeVisible()

  await page.reload()

  // UI state after reload
  await expect(searchSection.getByText('Delete Persist Target')).toHaveCount(0)
  await expect(searchSection.getByText(/1位:\s*Persist Survivor/)).toBeVisible()

  // API persistence contract
  const apiData = (await request.get('/api/items').then((res) => res.json())) as {
    items: { name: string; tag: string }[]
  }
  expect(apiData.items.some((item) => item.name === 'Delete Persist Target')).toBe(false)
  expect(apiData.items.some((item) => item.name === 'Persist Survivor')).toBe(true)
})
