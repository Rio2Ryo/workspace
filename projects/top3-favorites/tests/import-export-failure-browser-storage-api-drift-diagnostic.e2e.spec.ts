import { expect, test } from '@playwright/test'
import {
  canonicalizeItemsById,
  confirmImportAndWaitForStatus,
  expectOperationAlert,
  expectOperationStatus,
  fetchItems,
  installClipboardRecorder,
  installExportDownloadBlocker,
  jsonExportButton,
  manualExportCopyButton,
  manualExportJsonText,
  readClipboardRecorder,
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
function canonicalItemSemantics(items: Item[]): string {
  return JSON.stringify([...items].map((item) => ({
    id: item.id,
    tag: item.tag,
    location: item.location,
    name: item.name,
    rank: item.rank,
    memo: item.memo,
    mapsUrl: item.mapsUrl,
    placeId: item.placeId,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  })).sort((a, b) => a.id.localeCompare(b.id)))
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

test('diagnostic: blocked browser download exposes manual export JSON without mutating data', async ({ page, request }) => {
  await page.goto('/')

  await registrationTagField(page).fill('保存制限')
  await registrationLocationField(page).fill('柏')
  await registrationNameField(page).fill('Blocked Export Baseline')
  await saveRegistrationAndWaitForStatus(page, '保存制限 の1位に保存しました。')

  const beforeApi = await fetchItems<{ items: Item[] }>(request)
  const beforeLocalStorage = await readLocalStorageSnapshot(page)

  await installExportDownloadBlocker(page)
  await jsonExportButton(page).click()

  await expectOperationStatus(page, 'JSONファイルを自動保存できませんでした。下のJSONをコピーして手動で保存してください。')
  await expect(manualExportJsonText(page)).toBeVisible()
  await expect(manualExportJsonText(page)).toBeFocused()
  const manualJson = await manualExportJsonText(page).inputValue()
  const parsedManualJson = JSON.parse(manualJson) as Item[]
  expect(canonicalizeItemsById(parsedManualJson)).toBe(canonicalizeItemsById(beforeApi.items))

  const afterApi = await fetchItems<{ items: Item[] }>(request)
  const afterLocalStorage = await readLocalStorageSnapshot(page)

  expect(canonicalizeItemsById(afterApi.items)).toBe(canonicalizeItemsById(beforeApi.items))
  expect(afterLocalStorage).toEqual(beforeLocalStorage)
})

test('diagnostic: blocked browser download can copy manual export JSON as an importable artifact', async ({ page, request }) => {
  await page.goto('/')
  await installClipboardRecorder(page, 'manual-export-json')

  await registrationTagField(page).fill('手動復旧')
  await registrationLocationField(page).fill('柏')
  await registrationNameField(page).fill('Manual Copy Baseline')
  await saveRegistrationAndWaitForStatus(page, '手動復旧 の1位に保存しました。')

  const beforeApi = await fetchItems<{ items: Item[] }>(request)

  await installExportDownloadBlocker(page)
  await jsonExportButton(page).click()
  await expect(manualExportJsonText(page)).toBeVisible()

  await manualExportCopyButton(page).click()
  await expectOperationStatus(page, '手動保存JSONをコピーしました。')
  const copiedJson = await readClipboardRecorder(page, 'manual-export-json')
  expect(copiedJson).toBe(await manualExportJsonText(page).inputValue())
  expect(canonicalizeItemsById(JSON.parse(copiedJson ?? '[]') as Item[])).toBe(canonicalizeItemsById(beforeApi.items))

  await resetItemsByReplace(request)
  await uploadJsonImportFile(page, 'manual-export-roundtrip.json', copiedJson ?? '[]')
  await expectOperationStatus(page, 'インポート確認: 1件')
  await confirmImportAndWaitForStatus(page, 'インポート成功: 1件を反映しました。')

  const restoredApi = await fetchItems<{ items: Item[] }>(request)
  expect(canonicalItemSemantics(restoredApi.items)).toBe(canonicalItemSemantics(beforeApi.items))
})
