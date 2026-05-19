import { expect, test } from '@playwright/test'
import { uploadJsonImportFile, resetItemsByReplace, saveSampleItems, importCancelButton, importConfirmButton, expectOperationStatus } from './e2e-helpers'

function item(id: string, tag: string, name: string, rank = 1) {
  const now = new Date().toISOString()
  return {
    id,
    tag,
    location: '柏の葉',
    name,
    rank,
    memo: 'import preview test',
    mapsUrl: 'https://www.google.com/maps/search/?api=1&query=test',
    placeId: '',
    createdAt: now,
    updatedAt: now,
  }
}

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('import shows a confirmation preview before replacing existing data', async ({ page, request }) => {
  await page.goto('/')
  await saveSampleItems(page)
  await expect(page.getByText('1位: Solito MAGO')).toBeVisible()

  const replacement = [item('preview-1', 'プリン', 'Preview Pudding')]
  await uploadJsonImportFile(page, 'preview-import.json', replacement)

  await expectOperationStatus(page, 'インポート確認: 1件')
  await expect(page.getByText('現在3件 → インポート後1件')).toBeVisible()
  await expect(page.getByText('Preview Pudding')).not.toBeVisible()

  const beforeConfirm = (await request.get('/api/items').then((res) => res.json())) as { items: { name: string }[] }
  expect(beforeConfirm.items.map((saved) => saved.name).sort()).toEqual(['Solito MAGO', 'T-SITEのカフェ', 'とみ田'].sort())

  await importCancelButton(page).click()
  await expect(page.getByText('インポートをキャンセルしました。')).toBeVisible()
  await expect(page.getByText('1位: Solito MAGO')).toBeVisible()

  await uploadJsonImportFile(page, 'preview-import.json', replacement)
  await importConfirmButton(page).click()

  await expectOperationStatus(page, 'インポート成功: 1件を反映しました。')
  await expect(page.getByText('1位: Preview Pudding')).toBeVisible()
  await expect(page.getByText('Solito MAGO')).not.toBeVisible()
})
