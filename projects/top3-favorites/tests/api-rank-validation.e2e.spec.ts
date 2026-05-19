import { expect, test } from '@playwright/test'
import {
  fetchItems,
  postItem,
  putItem,
  resetItemsByReplace,
} from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('API create rejects invalid rank with a localized repair hint instead of silently normalizing to 1', async ({ request }) => {
  const res = await postItem(
    request,
    { tag: '検証', location: '代々木', rank: 4, name: 'Invalid Rank Create', memo: '' },
    { expectedStatus: 400 },
  )

  expect(res.status()).toBe(400)
  await expect(res.json()).resolves.toEqual({
    error: 'API create / フィールド: rank / 修正: 順位は1〜3で入力してください。',
  })

  const apiData = await fetchItems<{ items: Array<{ name: string }> }>(request)
  expect(apiData.items.some((item) => item.name === 'Invalid Rank Create')).toBe(false)
})

test('API edit rejects invalid rank with a localized repair hint and preserves the existing item', async ({ request }) => {
  const created = await postItem(request, { tag: '検証', location: '代々木', rank: 2, name: 'Valid Rank Base', memo: '' })
  expect(created.status()).toBe(200)
  const createdBody = (await created.json()) as { item: { id: string } }

  const res = await putItem(
    request,
    { id: createdBody.item.id, tag: '検証', location: '代々木', rank: 9, name: 'Invalid Rank Edit', memo: '' },
    { expectedStatus: 400 },
  )

  expect(res.status()).toBe(400)
  await expect(res.json()).resolves.toEqual({
    error: 'API edit / フィールド: rank / 修正: 順位は1〜3で入力してください。',
  })

  const apiData = await fetchItems<{
    items: Array<{ id: string; name: string; rank: number }>
  }>(request)
  expect(apiData.items).toContainEqual(expect.objectContaining({ id: createdBody.item.id, name: 'Valid Rank Base', rank: 2 }))
  expect(apiData.items.some((item) => item.name === 'Invalid Rank Edit')).toBe(false)
})

test('API create identifies the missing required field with a localized repair hint', async ({ request }) => {
  const missingTag = await postItem(
    request,
    { tag: '   ', location: '代々木', rank: 1, name: 'Missing Tag Create', memo: '' },
    { expectedStatus: 400 },
  )
  expect(missingTag.status()).toBe(400)
  await expect(missingTag.json()).resolves.toEqual({
    error: 'API create / フィールド: tag / 修正: タグを入力してください。',
  })

  const missingName = await postItem(
    request,
    { tag: '検証', location: '代々木', rank: 1, name: '   ', memo: '' },
    { expectedStatus: 400 },
  )
  expect(missingName.status()).toBe(400)
  await expect(missingName.json()).resolves.toEqual({
    error: 'API create / フィールド: name / 修正: 店舗名を入力してください。',
  })

  const apiData = await fetchItems<{ items: Array<{ name: string }> }>(request)
  expect(apiData.items.some((item) => item.name === 'Missing Tag Create')).toBe(false)
})

test('API edit identifies the missing required field with a localized repair hint and preserves the existing item', async ({ request }) => {
  const created = await postItem(request, { tag: '検証', location: '代々木', rank: 2, name: 'Required Field Base', memo: '' })
  expect(created.status()).toBe(200)
  const createdBody = (await created.json()) as { item: { id: string } }

  const missingTag = await putItem(
    request,
    { id: createdBody.item.id, tag: '   ', location: '代々木', rank: 2, name: 'Invalid Missing Tag Edit', memo: '' },
    { expectedStatus: 400 },
  )
  expect(missingTag.status()).toBe(400)
  await expect(missingTag.json()).resolves.toEqual({
    error: 'API edit / フィールド: tag / 修正: タグを入力してください。',
  })

  const missingName = await putItem(
    request,
    { id: createdBody.item.id, tag: '検証', location: '代々木', rank: 2, name: '   ', memo: '' },
    { expectedStatus: 400 },
  )
  expect(missingName.status()).toBe(400)
  await expect(missingName.json()).resolves.toEqual({
    error: 'API edit / フィールド: name / 修正: 店舗名を入力してください。',
  })

  const apiData = await fetchItems<{
    items: Array<{ id: string; name: string; tag: string }>
  }>(request)
  expect(apiData.items).toContainEqual(expect.objectContaining({ id: createdBody.item.id, tag: '検証', name: 'Required Field Base' }))
  expect(apiData.items.some((item) => item.name === 'Invalid Missing Tag Edit')).toBe(false)
})

test('API edit identifies a missing target item with a localized recovery hint and leaves data unchanged', async ({ request }) => {
  const created = await postItem(request, { tag: '検証', location: '代々木', rank: 1, name: 'Existing Item Before Missing Target Edit', memo: '' })
  expect(created.status()).toBe(200)
  const createdBody = (await created.json()) as { item: { id: string } }

  const res = await putItem(
    request,
    { id: 'missing-edit-target', tag: '検証', location: '代々木', rank: 1, name: 'Should Not Be Inserted By Edit', memo: '' },
    { expectedStatus: 404 },
  )

  expect(res.status()).toBe(404)
  await expect(res.json()).resolves.toEqual({
    error: 'API edit / フィールド: id / 修正: 更新対象が見つかりません。最新データを再読み込みしてください。',
  })

  const apiData = await fetchItems<{
    items: Array<{ id: string; name: string }>
  }>(request)
  expect(apiData.items).toContainEqual(expect.objectContaining({ id: createdBody.item.id, name: 'Existing Item Before Missing Target Edit' }))
  expect(apiData.items.some((item) => item.name === 'Should Not Be Inserted By Edit')).toBe(false)
})
