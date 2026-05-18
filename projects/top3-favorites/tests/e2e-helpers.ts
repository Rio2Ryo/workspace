import { expect, type APIRequestContext } from '@playwright/test'

export async function resetItemsByReplace(request: APIRequestContext, items: unknown[] = []) {
  const response = await request.post('/api/items?mode=replace', { data: { items } })
  expect(response.ok(), 'resetItemsByReplace should atomically replace API data before each test').toBe(true)
}

export async function resetItemsByDelete(request: APIRequestContext) {
  await resetItemsByReplace(request)
}
