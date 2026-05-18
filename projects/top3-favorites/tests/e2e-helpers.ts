import { expect, type APIRequestContext, type Locator } from '@playwright/test'
import { validateImportPreviewSummary } from '../src/shared/import-preview-summary-contract.mjs'

export async function resetItemsByReplace(request: APIRequestContext, items: unknown[] = []) {
  const response = await request.post('/api/items?mode=replace', { data: { items } })
  expect(response.ok(), 'resetItemsByReplace should atomically replace API data before each test').toBe(true)
}

export async function resetItemsByDelete(request: APIRequestContext) {
  await resetItemsByReplace(request)
}

export async function parseImportPreviewSummary<T = Record<string, unknown>>(summaryLocator: Locator): Promise<T> {
  const summaryJson = await summaryLocator.getAttribute('data-summary-json')
  expect(summaryJson, 'import preview summary should expose data-summary-json').toBeTruthy()
  const summary = JSON.parse(summaryJson as string) as T
  expect(validateImportPreviewSummary(summary), 'import preview summary should match the shared contract').toBeNull()
  return summary
}
