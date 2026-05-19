import { expect, test } from '@playwright/test'
import {
  expectOperationStatus,
  mapsLink,
  registrationLocationField,
  registrationMemoField,
  registrationNameField,
  registrationRankButton,
  registrationSaveButton,
  registrationTagField,
  resetItemsByReplace,
} from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('maps link includes name location and tag in Google Maps search query', async ({ page }) => {
  await page.goto('/')

  await registrationTagField(page).fill('検証タグ')
  await registrationLocationField(page).fill('検証場所')
  await registrationNameField(page).fill('検証店')
  await registrationMemoField(page).fill('maps link e2e')
  await registrationRankButton(page, 1).click()
  await registrationSaveButton(page).click()

  await expectOperationStatus(page, '検証タグ の1位に保存しました。')

  await page.getByText('1位: 検証店').click()

  const mapsAnchor = mapsLink(page).first()
  await expect(mapsAnchor).toBeVisible()

  const href = await mapsAnchor.getAttribute('href')
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
