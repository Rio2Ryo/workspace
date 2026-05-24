import { expect, test } from '@playwright/test'
import {
  canonicalizeItemsById,
  expectOperationAlert,
  expectOperationStatus,
  fetchItems,
  importPreviewPanel,
  registrationLocationField,
  registrationNameField,
  registrationTagField,
  resetItemsByReplace,
  uploadJsonImportFile,
  saveRegistrationAndWaitForStatus,
} from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('invalid JSON after a valid import preview clears pending preview and keeps existing data', async ({ page, request }) => {
  await page.goto('/')

  // seed one existing item
  await registrationTagField(page).fill('カフェラテ')
  await registrationLocationField(page).fill('柏の葉')
  await registrationNameField(page).fill('Base Item')
  await saveRegistrationAndWaitForStatus(page, 'カフェラテ の1位に保存しました。')

  const now = new Date().toISOString()
  const validItems = [
    { id: 'v1', tag: 'プリン', location: '浅草', name: 'P1', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'v2', tag: 'プリン', location: '浅草', name: 'P2', rank: 2, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]

  // 1) valid file -> preview visible
  await uploadJsonImportFile(page, 'valid.json', validItems)
  await expect(importPreviewPanel(page)).toBeVisible()

  // 2) invalid file -> preview must be cleared (fail-closed UI)
  await uploadJsonImportFile(page, 'broken.json', '{"broken": ')

  await expectOperationAlert(page, 'インポート失敗: ファイル「broken.json」のJSON構文を解析できません。既存データは保持しました。')
  await expect(importPreviewPanel(page)).toHaveCount(0)

  // DB should remain unchanged (still seeded 1 item)
  const apiData = await fetchItems<{ items: { name: string }[] }>(request)
  expect(canonicalizeItemsById(apiData.items.map((v) => ({ name: v.name })))).toBe(
    canonicalizeItemsById([{ name: 'Base Item' }]),
  )
})
