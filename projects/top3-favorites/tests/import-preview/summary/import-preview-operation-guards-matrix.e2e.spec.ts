import { expect, test } from '@playwright/test'
import { sampleSaveButton, jsonExportButton, itemEditButton, uploadJsonImportFile, resetItemsByReplace, itemDeleteButton, importCancelButton, importConfirmButton, registrationSaveButton, expectOperationStatus, registrationRankButton, registrationLocationField, registrationMemoField, registrationNameField, registrationTagField , importPreviewPanel} from '../../e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('pending import preview enforces operation guards across registration/search actions', async ({ page }) => {
  await page.goto('/')

  // seed one item so edit/delete actions are rendered
  await registrationTagField(page).fill('カフェラテ')
  await registrationLocationField(page).fill('柏の葉')
  await registrationNameField(page).fill('Guard Seed')
  await registrationSaveButton(page).click()
  await expectOperationStatus(page, 'カフェラテ の1位に保存しました。')

  const now = new Date().toISOString()
  const payload = [
    { id: 'imp-1', tag: 'プリン', location: '浅草', name: 'Pending A', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]

  await uploadJsonImportFile(page, 'pending.json', payload)

  await expect(importPreviewPanel(page)).toBeVisible()
  await expect(page.getByTestId('import-lock-hint')).toBeVisible()

  // registration form locks
  await expect(registrationTagField(page)).toBeDisabled()
  await expect(registrationLocationField(page)).toBeDisabled()
  await expect(registrationNameField(page)).toBeDisabled()
  await expect(registrationMemoField(page)).toBeDisabled()
  await expect(registrationRankButton(page, 1)).toBeDisabled()
  await expect(registrationRankButton(page, 2)).toBeDisabled()
  await expect(registrationRankButton(page, 3)).toBeDisabled()

  // save/sample/export locks
  await expect(registrationSaveButton(page)).toBeDisabled()
  await expect(registrationSaveButton(page)).toHaveAccessibleDescription('インポート確認中のため登録フォームは一時ロック中です。')
  await expect(sampleSaveButton(page)).toBeDisabled()
  await expect(sampleSaveButton(page)).toHaveAccessibleDescription('インポート確認中のため登録フォームは一時ロック中です。')
  await expect(jsonExportButton(page)).toBeDisabled()
  await expect(jsonExportButton(page)).toHaveAccessibleDescription('インポート確認中のため、現在DBのJSONエクスポートは一時停止中です。')
  await expect(page.getByTestId('import-export-lock-hint')).toHaveText('インポート確認中のため、現在DBのJSONエクスポートは一時停止中です。')

  // list actions lock
  await page.getByText('1位: Guard Seed').click()
  await expect(itemEditButton(page, 'Guard Seed')).toBeDisabled()
  await expect(itemEditButton(page, 'Guard Seed')).toHaveAccessibleDescription('インポート確認中のため、既存Top3の編集・削除は一時停止中です。')
  await expect(itemDeleteButton(page, 'Guard Seed')).toBeDisabled()
  await expect(itemDeleteButton(page, 'Guard Seed')).toHaveAccessibleDescription('インポート確認中のため、既存Top3の編集・削除は一時停止中です。')
  await expect(page.getByTestId('import-list-action-lock-hint')).toHaveText('インポート確認中のため、既存Top3の編集・削除は一時停止中です。')

  // import controls remain available to finish/cancel
  await expect(importConfirmButton(page)).toBeEnabled()
  await expect(importCancelButton(page)).toBeEnabled()
})
