import { expect, test } from '@playwright/test'
import { uploadJsonImportFile, resetItemsByReplace, registrationLocationField, registrationMemoField, registrationNameField, registrationTagField } from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('registration form inputs are locked while import preview is active', async ({ page }) => {
  await page.goto('/')

  const now = new Date().toISOString()
  const payload = [
    { id: 'imp-1', tag: 'プリン', location: '浅草', name: 'Pending A', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]

  await uploadJsonImportFile(page, 'pending.json', payload)

  await expect(page.getByLabel('インポート確認')).toBeVisible()
  await expect(page.getByTestId('import-lock-hint')).toBeVisible()

  await expect(registrationTagField(page)).toBeDisabled()
  await expect(registrationLocationField(page)).toBeDisabled()
  await expect(registrationNameField(page)).toBeDisabled()
  await expect(page.getByLabel('登録 1位に入れる')).toBeDisabled()
  await expect(page.getByLabel('登録 2位に入れる')).toBeDisabled()
  await expect(page.getByLabel('登録 3位に入れる')).toBeDisabled()
  await expect(registrationMemoField(page)).toBeDisabled()
})
