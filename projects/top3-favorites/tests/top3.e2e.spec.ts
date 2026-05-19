import { expect, test } from '@playwright/test'
import { resetItemsByReplace, saveSampleItems, registrationSaveButton, expectOperationStatus, registrationRankButton, searchSection as searchSectionLocator, searchInput } from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('sample data can be saved, searched, and ranked through the real UI/API', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))

  await page.goto('/')
  await expect(page.locator('.status', { hasText: 'DB保存' })).toBeVisible()

  await saveSampleItems(page)
  await expect(page.getByRole('heading', { name: 'カフェラテ' })).toBeVisible()
  await expect(page.getByText(/\d位: Solito MAGO/)).toBeVisible()
  await expect(page.getByText(/\d位: T-SITEのカフェ/)).toBeVisible()

  const searchSection = searchSectionLocator(page)
  await searchInput(page).fill('Solito')
  await expect(searchSection.getByText(/\d位: Solito MAGO/)).toBeVisible()
  await expect(searchSection.getByText('T-SITEのカフェ')).not.toBeVisible()

  expect(errors).toEqual([])
})

test('adding a new first place rebalances the same tag to top 3', async ({ page }) => {
  await page.goto('/')
  await saveSampleItems(page)
  await expect(page.getByText(/\d位: Solito MAGO/)).toBeVisible()
  await expect(page.getByText(/\d位: T-SITEのカフェ/)).toBeVisible()

  await page.getByLabel('タグ', { exact: true }).fill('カフェラテ')
  await page.getByLabel('場所', { exact: true }).fill('柏の葉')
  await page.getByLabel('店舗名', { exact: true }).fill('New Coffee')
  await page.getByLabel('メモ', { exact: true }).fill('検証用の新1位')
  await registrationRankButton(page, 1).click()
  await registrationSaveButton(page).click()

  await expectOperationStatus(page, 'カフェラテ の1位に保存しました。')
  await searchInput(page).fill('')

  await expect(page.getByText(/\d位: New Coffee/)).toBeVisible()
  await expect(page.getByText(/\d位: Solito MAGO/)).toBeVisible()
  await expect(page.getByText(/\d位: T-SITEのカフェ/)).toBeVisible()
})
