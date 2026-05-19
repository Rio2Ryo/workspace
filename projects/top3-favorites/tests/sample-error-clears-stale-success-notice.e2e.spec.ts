import { expect, test } from '@playwright/test'
import { resetItemsByReplace, clickSampleSaveButton, expectOperationAlert, fetchItems, postItem } from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('failed sample save clears stale success notice and keeps existing data visible', async ({ page, request }) => {
  await postItem(request, { tag: 'カフェラテ', location: '柏の葉', rank: 1, name: 'Existing Keep', memo: '' })
  await page.goto('/')
  await expect(page.getByText('1位: Existing Keep')).toBeVisible()

  await page.route('**/api/items**', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'サンプル保存APIが一時的に利用できません。' }),
      })
      return
    }
    await route.continue()
  })

  await clickSampleSaveButton(page)

  await expectOperationAlert(page, 'サンプル保存APIが一時的に利用できません。')
  await expect(page.getByText('カフェラテ の1位に保存しました。')).toHaveCount(0)
  await expect(page.getByText('1位: Existing Keep')).toBeVisible()

  const apiData = await fetchItems<{ items: { name: string }[] }>(request)
  expect(apiData.items.map((item) => item.name)).toEqual(['Existing Keep'])
})
