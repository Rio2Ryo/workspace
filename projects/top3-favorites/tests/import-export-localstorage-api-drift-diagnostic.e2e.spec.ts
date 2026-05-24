import { expect, test } from '@playwright/test'
import {
  canonicalizeItemsById,
  confirmImportAndWaitForStatus,
  downloadJsonExport,
  fetchItems,
  parseDownloadedJsonFile,
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


function findAppDataLikeLocalStorageKeys(snapshot: Record<string, string>): string[] {
  return Object.keys(snapshot).filter((key) => /(top3|favorite|item|import|export|cache)/i.test(key))
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

test('diagnostic: import/export flow keeps API canonical data and does not introduce localStorage drift', async ({ page, request }) => {
  await page.goto('/')

  const beforeLocalStorage = await readLocalStorageSnapshot(page)

  const now = '2026-05-18T00:00:00.000Z'
  const importItems: Item[] = [
    { id: 'diag-1', tag: 'プリン', location: '浅草', name: 'Diag A', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'diag-2', tag: 'プリン', location: '浅草', name: 'Diag B', rank: 2, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]

  await uploadJsonImportFile(page, 'diagnostic-import.json', importItems)
  await confirmImportAndWaitForStatus(page, 'インポート成功: 2件を反映しました。')

  const apiAfterImport = await fetchItems<{ items: Item[] }>(request)
  const expectedImportedItems = withCanonicalMapsUrls(importItems)
  expect(canonicalizeItemsById(apiAfterImport.items)).toBe(canonicalizeItemsById(expectedImportedItems))

  const exportDownload = await downloadJsonExport(page)
  const exported = await parseDownloadedJsonFile<Item[]>(exportDownload)
  expect(canonicalizeItemsById(exported.parsed)).toBe(canonicalizeItemsById(apiAfterImport.items))

  await reloadPageAndWaitForSearchReady(page)
  const apiAfterReload = await fetchItems<{ items: Item[] }>(request)
  expect(canonicalizeItemsById(apiAfterReload.items)).toBe(canonicalizeItemsById(expectedImportedItems))

  const afterLocalStorage = await readLocalStorageSnapshot(page)
  const appDataLikeKeys = findAppDataLikeLocalStorageKeys(afterLocalStorage)

  // Diagnostic contract:
  // - import/export should not create app-data persistence keys in localStorage
  // - existing unrelated localStorage entries must remain unchanged
  expect(appDataLikeKeys).toEqual([])
  expect(afterLocalStorage).toEqual(beforeLocalStorage)
})
