import { expect, test } from '@playwright/test'
import {
  canonicalizeItemsById,
  confirmImportAndWaitForStatus,
  downloadJsonExport,
  fetchItems,
  parseDownloadedJsonFile,
  readLocalStorageSnapshot,
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

function withCanonicalMapsUrls(items: Item[]): Item[] {
  return items.map((item) => {
    const { mapsUrl, ...rest } = item
    void mapsUrl

    return {
      ...rest,
      mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        [item.name, item.location, item.tag].join(' '),
      )}`,
    }
  })
}


test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('diagnostic: confirming import preview keeps API/export canonical sync without localStorage drift', async ({ page, request }) => {
  await page.goto('/')

  const beforeLocalStorage = await readLocalStorageSnapshot(page)

  const now = '2026-05-18T00:00:00.000Z'
  const importItems: Item[] = [
    { id: 'confirm-1', tag: '確定', location: '浅草', name: 'Confirm A', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'confirm-2', tag: '確定', location: '浅草', name: 'Confirm B', rank: 2, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]

  await uploadJsonImportFile(page, 'confirm-drift-diagnostic.json', importItems)
  await confirmImportAndWaitForStatus(page, 'インポート成功: 2件を反映しました。')

  const apiAfterConfirm = await fetchItems<{ items: Item[] }>(request)
  const expectedImportedItems = withCanonicalMapsUrls(importItems)
  expect(canonicalizeItemsById(apiAfterConfirm.items)).toBe(canonicalizeItemsById(expectedImportedItems))

  const download = await downloadJsonExport(page)
  const exported = await parseDownloadedJsonFile<Item[]>(download)
  expect(canonicalizeItemsById(exported.parsed)).toBe(canonicalizeItemsById(apiAfterConfirm.items))

  const afterLocalStorage = await readLocalStorageSnapshot(page)
  expect(afterLocalStorage).toEqual(beforeLocalStorage)
})
