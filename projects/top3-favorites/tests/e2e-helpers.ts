import { readFile } from 'node:fs/promises'
import { expect, type APIRequestContext, type Download, type Locator, type Page } from '@playwright/test'
import { validateImportPreviewSummary } from '../src/shared/import-preview-summary-contract.mjs'

export async function resetItemsByReplace(request: APIRequestContext, items: unknown[] = []) {
  const response = await request.post('/api/items?mode=replace', { data: { items } })
  expect(response.ok(), 'resetItemsByReplace should atomically replace API data before each test').toBe(true)
}

export async function resetItemsByDelete(request: APIRequestContext) {
  await resetItemsByReplace(request)
}


export async function clickSampleSaveButton(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'サンプルをDB保存' }).click()
}

export async function saveSampleItems(page: Page): Promise<void> {
  await clickSampleSaveButton(page)
  await expect(page.getByRole('status')).toContainText('サンプルをDBに保存しました。')
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
  await page.getByRole('button', { name: 'JSONエクスポート' }).click()
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
