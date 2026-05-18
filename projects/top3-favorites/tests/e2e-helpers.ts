import { expect, type APIRequestContext } from '@playwright/test'

export async function resetItemsByReplace(request: APIRequestContext) {
  const response = await request.post('/api/items?mode=replace', { data: { items: [] } })
  expect(response.ok(), 'resetItemsByReplace should clear API data before each test').toBe(true)
}

export async function resetItemsByDelete(request: APIRequestContext) {
  await resetItemsByReplace(request)
}
