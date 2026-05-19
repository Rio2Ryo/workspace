import { readFile } from 'node:fs/promises'
import { expect, type APIRequestContext, type Dialog, type Download, type Locator, type Page } from '@playwright/test'
import { validateImportPreviewSummary } from '../src/shared/import-preview-summary-contract.mjs'

export async function resetItemsByReplace(request: APIRequestContext, items: unknown[] = []) {
  const response = await request.post('/api/items?mode=replace', { data: { items } })
  expect(response.ok(), 'resetItemsByReplace should atomically replace API data before each test').toBe(true)
}

export async function resetItemsByDelete(request: APIRequestContext) {
  await resetItemsByReplace(request)
}


export function sampleSaveButton(page: Page): Locator {
  return page.getByRole('button', { name: 'サンプルをDB保存' })
}

export async function clickSampleSaveButton(page: Page): Promise<void> {
  await sampleSaveButton(page).click()
}

export function operationStatus(page: Page): Locator {
  return page.getByRole('status')
}

export async function expectOperationStatus(page: Page, text: string | RegExp): Promise<void> {
  await expect(operationStatus(page)).toContainText(text)
}

export function operationAlert(page: Page): Locator {
  return page.getByRole('alert')
}

export async function expectOperationAlert(page: Page, text: string | RegExp): Promise<void> {
  await expect(operationAlert(page)).toContainText(text)
}

export async function saveSampleItems(page: Page): Promise<void> {
  await clickSampleSaveButton(page)
  await expectOperationStatus(page, 'サンプルをDBに保存しました。')
}

export function reloadDataButton(page: Page): Locator {
  return page.getByRole('button', { name: 'データを再読み込み' })
}

export function searchSection(page: Page): Locator {
  return page.locator('section.card').filter({ has: page.getByRole('heading', { name: '探す' }) })
}

export async function reloadPageAndWaitForSearchReady(page: Page): Promise<void> {
  await page.reload()
  await expect(searchSection(page)).toBeVisible()
}

export function searchInput(page: Page): Locator {
  return page.getByRole('textbox', { name: 'Top3検索' })
}

export function searchClearButton(searchSection: Locator): Locator {
  return searchSection.getByRole('button', { name: 'クリア' })
}

export async function clearSearchTagFilter(searchSection: Locator): Promise<void> {
  const clearButton = searchClearButton(searchSection)
  await expect(clearButton).toBeVisible()
  await clearButton.click()
}

export function tagFilterButton(scope: Page | Locator, tag: string): Locator {
  const name = `#${tag}`
  return scope.getByRole('button', { name })
}


export function registrationTagField(page: Page): Locator {
  return page.getByRole('combobox', { name: 'タグ' })
}

export function registrationLocationField(page: Page): Locator {
  return page.getByRole('textbox', { name: '場所' })
}

export function registrationNameField(page: Page): Locator {
  return page.getByRole('textbox', { name: '店舗名' })
}

export function registrationMemoField(page: Page): Locator {
  return page.getByRole('textbox', { name: 'メモ' })
}

export function registrationSaveButton(page: Page): Locator {
  return page.getByRole('button', { name: 'DBに保存' })
}

export function registrationRankButton(page: Page, rank: 1 | 2 | 3): Locator {
  return page.getByRole('button', { name: `登録 ${rank}位に入れる` })
}

export function editRankButton(page: Page, rank: 1 | 2 | 3): Locator {
  return page.getByRole('button', { name: `編集 ${rank}位に変更` })
}

export function editNameField(page: Page): Locator {
  return page.getByRole('textbox', { name: '編集 店舗名' })
}

export function editTagField(page: Page): Locator {
  return page.getByRole('combobox', { name: '編集 タグ' })
}

export function editLocationField(page: Page): Locator {
  return page.getByRole('textbox', { name: '編集 場所' })
}

export function editMemoField(page: Page): Locator {
  return page.getByRole('textbox', { name: '編集 メモ' })
}

export function editSaveButton(page: Page): Locator {
  return page.getByRole('button', { name: '編集を保存' })
}

export function editCancelButton(page: Page): Locator {
  return page.getByRole('button', { name: '編集をキャンセル' })
}

export function itemEditButton(scope: Page | Locator, itemName: string | RegExp): Locator {
  const name = typeof itemName === 'string' ? `${itemName}を編集` : itemName
  return scope.getByRole('button', { name })
}

export function itemDeleteButton(scope: Page | Locator, itemName: string | RegExp): Locator {
  const name = typeof itemName === 'string' ? `${itemName}を削除` : itemName
  return scope.getByRole('button', { name })
}

async function handleNextDeleteDialog(page: Page, action: 'accept' | 'dismiss', expectedMessage?: string | RegExp): Promise<void> {
  const dialog = await page.waitForEvent('dialog')
  assertDeleteDialogMessage(dialog, expectedMessage)
  if (action === 'accept') {
    await dialog.accept()
    return
  }
  await dialog.dismiss()
}

function assertDeleteDialogMessage(dialog: Dialog, expectedMessage?: string | RegExp): void {
  const message = dialog.message()
  if (expectedMessage instanceof RegExp) {
    expect(message).toMatch(expectedMessage)
    return
  }
  if (expectedMessage) {
    expect(message).toContain(expectedMessage)
  }
}

export function acceptNextDeleteDialog(page: Page, expectedMessage?: string | RegExp): Promise<void> {
  return handleNextDeleteDialog(page, 'accept', expectedMessage)
}

export function dismissNextDeleteDialog(page: Page, expectedMessage?: string | RegExp): Promise<void> {
  return handleNextDeleteDialog(page, 'dismiss', expectedMessage)
}

export function jsonImportButton(page: Page): Locator {
  return page.getByRole('button', { name: 'JSONインポート' })
}

export function jsonExportButton(page: Page): Locator {
  return page.getByRole('button', { name: 'JSONエクスポート' })
}

export function importConfirmButton(page: Page): Locator {
  return page.getByRole('button', { name: 'この内容でインポート' })
}

export function importCancelButton(page: Page): Locator {
  return page.getByRole('button', { name: 'インポートをキャンセル' })
}

export async function uploadJsonImportFile(page: Page, name: string, body: string | unknown): Promise<void> {
  const buffer = Buffer.from(typeof body === 'string' ? body : JSON.stringify(body), 'utf-8')
  await page.locator('input[type="file"][accept*="json"]').setInputFiles({
    name,
    mimeType: 'application/json',
    buffer,
  })
}

export async function parseImportPreviewSummary<T = Record<string, unknown>>(summaryLocator: Locator): Promise<T> {
  const summaryJson = await summaryLocator.getAttribute('data-summary-json')
  expect(summaryJson, 'import preview summary should expose data-summary-json').toBeTruthy()
  const summary = JSON.parse(summaryJson as string) as T
  expect(validateImportPreviewSummary(summary), 'import preview summary should match the shared contract').toBeNull()
  return summary
}

export async function downloadJsonExport(page: Page): Promise<Download> {
  const downloadPromise = page.waitForEvent('download')
  await jsonExportButton(page).click()
  return downloadPromise
}

export async function parseDownloadedJsonFile<T = unknown>(download: Download): Promise<{ filename: string; raw: string; parsed: T }> {
  const filename = download.suggestedFilename()
  expect(filename).toMatch(/^top3-favorites-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.json$/)

  const artifactPath = await download.path()
  expect(artifactPath, 'export download should produce a readable local artifact path').toBeTruthy()

  const raw = await readFile(artifactPath as string, 'utf-8')
  const parsed = JSON.parse(raw) as T
  return { filename, raw, parsed }
}
