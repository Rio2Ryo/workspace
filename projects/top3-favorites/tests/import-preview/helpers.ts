import type { APIRequestContext } from '@playwright/test'

export async function resetItemsByReplace(request: APIRequestContext) {
  await request.post('/api/items?mode=replace', { data: { items: [] } })
}

export async function resetItemsByDelete(request: APIRequestContext) {
  const data = (await request.get('/api/items').then((res) => res.json())) as { items: { id: string }[] }
  for (const item of data.items) {
    await request.delete(`/api/items?id=${encodeURIComponent(item.id)}`)
  }
}
