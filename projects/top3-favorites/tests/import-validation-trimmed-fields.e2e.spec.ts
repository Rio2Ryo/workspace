import { expect, test } from '@playwright/test'
import { uploadJsonImportFile, resetItemsByReplace } from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('import rejects whitespace-only required fields with clear validation message', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'サンプルをDB保存' }).click()
  await expect(page.getByText('サンプルをDBに保存しました。')).toBeVisible()

  const now = new Date().toISOString()
  const invalidItems = [
    {
      id: '   ',
      tag: 'カフェラテ',
      location: '柏の葉',
      name: 'Bad Item',
      rank: 1,
      memo: '',
      mapsUrl: '',
      placeId: '',
      createdAt: now,
      updatedAt: now,
    },
  ]

  await uploadJsonImportFile(page, 'invalid-whitespace-fields.json', invalidItems)

  await expect(page.getByRole('alert')).toContainText(
    'インポート失敗: ファイル「invalid-whitespace-fields.json」の1件目 / フィールド: id / 修正: IDを入力してください。既存データは保持しました。',
  )
  await expect(page.getByText('1位: Solito MAGO')).toBeVisible()
})
