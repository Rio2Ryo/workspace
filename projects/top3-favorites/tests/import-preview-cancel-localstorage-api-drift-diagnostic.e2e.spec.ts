import { expect, test } from '@playwright/test'
import {
  cancelImportAndWaitForStatus,
  canonicalizeItemsById,
  fetchItems,
  importPreviewSummary,
  readLocalStorageSnapshot,
  reloadPageAndWaitForSearchReady,
  resetItemsByReplace,
  uploadJsonImportFile,
} from './e2e-helpers'

type Item = {
  id: string
  tag: string
  location: string
  name: string
  rank: number
  memo: string
  mapsUrl: string
  placeId: string
  createdAt: string
  updatedAt: string
}


test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('diagnostic: canceling import preview keeps API data and localStorage unchanged', async ({ page, request }) => {
  await page.goto('/')

  const now = '2026-05-18T00:00:00.000Z'
  const baseline: Item[] = [
    { id: 'base-1', tag: '既存', location: '柏', name: 'Baseline A', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]
  await resetItemsByReplace(request, baseline)
  await reloadPageAndWaitForSearchReady(page)

  const beforeApi = await fetchItems<{ items: Item[] }>(request)
  const beforeLocalStorage = await readLocalStorageSnapshot(page)

  const importItems: Item[] = [
    { id: 'imp-1', tag: '新規', location: '浅草', name: 'Import A', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'imp-2', tag: '新規', location: '浅草', name: 'Import B', rank: 2, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]

  await uploadJsonImportFile(page, 'cancel-drift-diagnostic.json', importItems)
  await expect(importPreviewSummary(page)).toBeVisible()

  await cancelImportAndWaitForStatus(page, 'インポートをキャンセルしました。')
  await expect(importPreviewSummary(page)).toHaveCount(0)

  const afterApi = await fetchItems<{ items: Item[] }>(request)
  const afterLocalStorage = await readLocalStorageSnapshot(page)

  expect(canonicalizeItemsById(afterApi.items)).toBe(canonicalizeItemsById(beforeApi.items))
  expect(afterLocalStorage).toEqual(beforeLocalStorage)
})
