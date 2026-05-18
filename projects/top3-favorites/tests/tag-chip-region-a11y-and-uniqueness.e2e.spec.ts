import { expect, test } from '@playwright/test'
import { resetItemsByReplace } from './e2e-helpers'

const item = (id: string, tag: string, rank: 1 | 2 | 3, name: string) => ({
  id,
  tag,
  location: 'テスト地点',
  rank,
  name,
  memo: '',
  placeId: '',
  mapsUrl: '',
  createdAt: '2026-05-18T00:00:00.000Z',
  updatedAt: '2026-05-18T00:00:00.000Z',
})

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request, [
    item('same-tag-1', '重複タグ', 1, '重複タグA'),
    item('same-tag-2', '重複タグ', 2, '重複タグB'),
    item('other-tag-1', '別タグ', 1, '別タグA'),
  ])
})

test('tag chip regions have distinct accessible labels and show each tag once per region', async ({ page }) => {
  await page.goto('/')

  const registrationTags = page.getByLabel('登録タグ選択')
  const searchTags = page.getByLabel('検索タグ選択')

  await expect(registrationTags).toBeVisible()
  await expect(searchTags).toBeVisible()

  await expect(registrationTags.getByRole('button', { name: '#重複タグ' })).toHaveCount(1)
  await expect(registrationTags.getByRole('button', { name: '#別タグ' })).toHaveCount(1)
  await expect(searchTags.getByRole('button', { name: '#重複タグ' })).toHaveCount(1)
  await expect(searchTags.getByRole('button', { name: '#別タグ' })).toHaveCount(1)

  await searchTags.getByRole('button', { name: '#重複タグ' }).click()
  await expect(page.getByText(/1位: 重複タグA/)).toBeVisible()
  await expect(page.getByText(/2位: 重複タグB/)).toBeVisible()
  await expect(page.getByText(/1位: 別タグA/)).not.toBeVisible()
})
