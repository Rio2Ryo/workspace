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

test('maps link opens in a new tab with safe rel attributes', async ({ page }) => {
  await page.goto('/')

  await registrationTagField(page).fill('カフェラテ')
  await registrationLocationField(page).fill('柏の葉')
  await registrationNameField(page).fill('Solito MAGO')
  await registrationMemoField(page).fill('maps attr contract')
  await registrationRankButton(page, 1).click()
  await registrationSaveButton(page).click()

  await expectOperationStatus(page, 'カフェラテ の1位に保存しました。')

  const group = page.locator('.group').filter({ has: page.getByRole('heading', { name: 'カフェラテ' }) })
  await group.locator('summary', { hasText: /1位:\s*Solito MAGO/ }).click()

  const mapsAnchor = mapsLink(group).first()
  await expect(mapsAnchor).toBeVisible()
  await expect(mapsAnchor).toHaveAttribute('target', '_blank')

  const rel = await mapsAnchor.getAttribute('rel')
  expect(rel).toBeTruthy()
  const relTokens = new Set((rel ?? '').split(/\s+/).filter(Boolean))
  expect(relTokens.has('noreferrer')).toBe(true)
})
