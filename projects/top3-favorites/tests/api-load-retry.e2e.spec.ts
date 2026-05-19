import { expect, test } from '@playwright/test'
import {
  expectOperationAlert,
  expectOperationStatus,
  operationAlert,
  rankedItemSummary,
  reloadDataButton,
  tagHeading,
} from './e2e-helpers'

test('initial API load failure shows a retry action and recovers without page reload', async ({ page }) => {
  let apiHits = 0
  await page.route('**/api/items', async (route) => {
    if (route.request().method() === 'GET') {
      apiHits += 1
      if (apiHits === 1) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'temporary outage' }),
        })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: 'retry-1',
              tag: '復旧タグ',
              location: '柏の葉',
              name: '復旧した店',
              rank: 1,
              memo: '再読込で表示される',
              mapsUrl: 'https://www.google.com/maps/search/?api=1&query=%E5%BE%A9%E6%97%A7%E3%81%97%E3%81%9F%E5%BA%97',
              placeId: '',
              createdAt: '2026-05-18T00:00:00.000Z',
              updatedAt: '2026-05-18T00:00:00.000Z',
            },
          ],
          tags: ['復旧タグ'],
        }),
      })
      return
    }
    await route.continue()
  })

  await page.goto('/')

  await expectOperationAlert(page, 'temporary outage')
  await reloadDataButton(page).click()

  await expect(operationAlert(page)).toHaveCount(0)
  await expectOperationStatus(page, 'データを再読み込みしました。')
  await expect(tagHeading(page, '復旧タグ')).toBeVisible()
  await expect(rankedItemSummary(page, 1, '復旧した店')).toBeVisible()
  expect(apiHits).toBe(2)
})
