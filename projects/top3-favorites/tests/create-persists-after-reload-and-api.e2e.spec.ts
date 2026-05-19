import { expect, test } from '@playwright/test'
import { resetItemsByReplace, registrationSaveButton, expectOperationStatus, registrationRankButton, searchSection as searchSectionLocator, registrationLocationField, registrationMemoField, registrationNameField, registrationTagField } from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('newly created item remains after reload and exists in API data', async ({ page, request }) => {
  await page.goto('/')

  await registrationTagField(page).fill('永続化タグ')
  await registrationLocationField(page).fill('柏')
  await registrationNameField(page).fill('Persist New Item')
  await registrationMemoField(page).fill('reload persistence contract')
  await registrationRankButton(page, 2).click()
  await registrationSaveButton(page).click()

  await expectOperationStatus(page, '永続化タグ の2位に保存しました。')

  const searchSection = searchSectionLocator(page)
  await expect(searchSection.getByText(/2位:\s*Persist New Item/)).toBeVisible()
  await searchSection.getByText(/2位:\s*Persist New Item/).click()
  await expect(searchSection.getByText('reload persistence contract')).toBeVisible()

  await page.reload()

  await expect(searchSection.getByText(/2位:\s*Persist New Item/)).toBeVisible()
  await searchSection.getByText(/2位:\s*Persist New Item/).click()
  await expect(searchSection.getByText('reload persistence contract')).toBeVisible()
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
