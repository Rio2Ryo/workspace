import { expect, test } from '@playwright/test'
import {
  canonicalizeItemsById,
  expectOperationAlert,
  fetchItems,
  jsonExportButton,
  readLocalStorageSnapshot,
  registrationLocationField,
  registrationNameField,
  registrationTagField,
  resetItemsByReplace,
  saveRegistrationAndWaitForStatus,
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

test('diagnostic: invalid import failure keeps API data and localStorage unchanged', async ({ page, request }) => {
  await page.goto('/')

  await registrationTagField(page).fill('失敗診断')
  await registrationLocationField(page).fill('柏')
  await registrationNameField(page).fill('Failure Baseline')
  await saveRegistrationAndWaitForStatus(page, '失敗診断 の1位に保存しました。')

  const beforeApi = await fetchItems<{ items: Item[] }>(request)
  const beforeLocalStorage = await readLocalStorageSnapshot(page)

  await uploadJsonImportFile(page, 'broken-diagnostic.json', '{ bad json')
  await expectOperationAlert(page, 'JSON構文を解析できません。')

  const afterApi = await fetchItems<{ items: Item[] }>(request)
  const afterLocalStorage = await readLocalStorageSnapshot(page)

  expect(canonicalizeItemsById(afterApi.items)).toBe(canonicalizeItemsById(beforeApi.items))
  expect(afterLocalStorage).toEqual(beforeLocalStorage)
})

test('diagnostic: export guard on empty data does not mutate API/localStorage', async ({ page, request }) => {
  await page.goto('/')

  const beforeApi = await fetchItems<{ items: Item[] }>(request)
  const beforeLocalStorage = await readLocalStorageSnapshot(page)

  const exportButton = jsonExportButton(page)
  await expect(exportButton).toBeDisabled()
  await expect(page.getByText('エクスポート対象データがありません。まず1件以上保存してください。')).toBeVisible()

  const afterApi = await fetchItems<{ items: Item[] }>(request)
  const afterLocalStorage = await readLocalStorageSnapshot(page)

  expect(canonicalizeItemsById(afterApi.items)).toBe(canonicalizeItemsById(beforeApi.items))
  expect(afterLocalStorage).toEqual(beforeLocalStorage)
})
