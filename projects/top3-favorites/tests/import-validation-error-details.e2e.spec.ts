import { expect, test } from '@playwright/test'
import {
  expectOperationAlert,
  expectOperationStatus,
  importPreviewSummary,
  importValidationCopyJsonPaths,
  importValidationCopyRepairList,
  importValidationErrorDetails,
  importValidationFieldFilter,
  importValidationFieldSummary,
  resetItemsByReplace,
  uploadJsonImportFile,
} from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('import validation error identifies the first invalid row and field for quick recovery', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          window.localStorage.setItem('last-copied-import-validation-paths', text)
          window.localStorage.setItem('last-copied-import-validation-repairs', text)
        },
      },
    })
  })

  const now = '2026-05-18T00:00:00.000Z'
  const invalidItems = [
    { id: 'valid-1', tag: 'カフェラテ', location: '柏の葉', name: 'Valid Shop', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'invalid-2', tag: '   ', location: '柏の葉', name: 'Whitespace Tag Shop', rank: 2, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'invalid-3', tag: 'カフェラテ', location: '柏の葉', name: '', rank: 3, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]

  await uploadJsonImportFile(page, 'invalid-import-field-details.json', invalidItems)

  await expectOperationAlert(page, 
    'インポート失敗: ファイル「invalid-import-field-details.json」の2件目 / フィールド: tag / 修正: タグを入力してください。既存データは保持しました。',
  )
  const details = importValidationErrorDetails(page)
  await expect(details).toBeVisible()
  await expect(details).toHaveAttribute('aria-label', 'インポートエラーの修正情報')
  await expect(details.locator('dt')).toHaveText(['ファイル', '行', 'JSONパス', 'フィールド', '修正', '検出件数'])
  await expect(details.locator('dd')).toHaveText([
    'invalid-import-field-details.json',
    '2件目',
    '$.items[1].tag',
    'tag',
    'タグを入力してください。',
    '合計2件（ほか1件も修正してください）',
  ])
  await expect(details.getByText('検出した修正対象')).toBeVisible()
  const fieldSummary = importValidationFieldSummary(page)
  await expect(fieldSummary).toBeVisible()
  await expect(fieldSummary.locator('li span')).toHaveText(['tag: 1件', 'name: 1件'])
  await expect(details.locator('.import-validation-error-list ol li')).toHaveText([
    '2件目 / $.items[1].tag / tag / タグを入力してください。',
    '3件目 / $.items[2].name / name / 店舗名を入力してください。',
  ])
  await importValidationCopyJsonPaths(page).click()
  await expectOperationStatus(page, 'JSONパス一覧をコピーしました。')
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem('last-copied-import-validation-paths'))).toBe('$.items[1].tag\n$.items[2].name')
  await importValidationCopyRepairList(page).click()
  await expectOperationStatus(page, '修正対象一覧をコピーしました。')
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem('last-copied-import-validation-repairs'))).toBe(
    '2件目 / $.items[1].tag / tag / タグを入力してください。\n3件目 / $.items[2].name / name / 店舗名を入力してください。',
  )
  await expect(importPreviewSummary(page)).toHaveCount(0)
})

test('import validation field summary prioritizes repeated fields over first-seen order', async ({ page }) => {
  await page.goto('/')

  const now = '2026-05-18T00:00:00.000Z'
  const invalidItems = [
    { id: 'invalid-name-first', tag: 'カフェラテ', location: '柏の葉', name: '', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'invalid-tag-second', tag: '   ', location: '柏の葉', name: 'Whitespace Tag Shop 1', rank: 2, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'invalid-tag-third', tag: '', location: '柏の葉', name: 'Whitespace Tag Shop 2', rank: 3, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]

  await uploadJsonImportFile(page, 'invalid-import-field-priority.json', invalidItems)

  await expectOperationAlert(page,
    'インポート失敗: ファイル「invalid-import-field-priority.json」の1件目 / フィールド: name / 修正: 店舗名を入力してください。既存データは保持しました。',
  )
  await expect(importValidationFieldSummary(page).locator('li span')).toHaveText(['tag: 2件', 'name: 1件'])
})

test('import validation field summary filters the repair list to the selected repeated field', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          window.localStorage.setItem('last-copied-import-validation-paths', text)
          window.localStorage.setItem('last-copied-import-validation-repairs', text)
        },
      },
    })
  })

  const now = '2026-05-18T00:00:00.000Z'
  const invalidItems = [
    { id: 'invalid-name-first', tag: 'カフェラテ', location: '柏の葉', name: '', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'invalid-tag-second', tag: '   ', location: '柏の葉', name: 'Whitespace Tag Shop 1', rank: 2, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'invalid-tag-third', tag: '', location: '柏の葉', name: 'Whitespace Tag Shop 2', rank: 3, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]

  await uploadJsonImportFile(page, 'invalid-import-field-filter.json', invalidItems)

  const details = importValidationErrorDetails(page)
  await expect(details.locator('.import-validation-error-list ol li')).toHaveText([
    '1件目 / $.items[0].name / name / 店舗名を入力してください。',
    '2件目 / $.items[1].tag / tag / タグを入力してください。',
    '3件目 / $.items[2].tag / tag / タグを入力してください。',
  ])
  await importValidationFieldFilter(page, 'tag').click()
  await expect(details.getByText('表示中: tag の修正対象2件')).toBeVisible()
  await expect(details.locator('.import-validation-error-list ol li')).toHaveText([
    '2件目 / $.items[1].tag / tag / タグを入力してください。',
    '3件目 / $.items[2].tag / tag / タグを入力してください。',
  ])
  await importValidationCopyJsonPaths(page).click()
  await expectOperationStatus(page, 'JSONパス一覧をコピーしました。')
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem('last-copied-import-validation-paths'))).toBe('$.items[1].tag\n$.items[2].tag')
  await importValidationCopyRepairList(page).click()
  await expectOperationStatus(page, '修正対象一覧をコピーしました。')
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem('last-copied-import-validation-repairs'))).toBe(
    '2件目 / $.items[1].tag / tag / タグを入力してください。\n3件目 / $.items[2].tag / tag / タグを入力してください。',
  )
  await importValidationFieldFilter(page, 'name').click()
  await expect(details.getByText('表示中: name の修正対象1件')).toBeVisible()
  await expect(details.locator('.import-validation-error-list ol li')).toHaveText([
    '1件目 / $.items[0].name / name / 店舗名を入力してください。',
  ])
})
