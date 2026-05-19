import { expect, test } from '@playwright/test'
import {
  confirmImportAndWaitForStatus,
  mapsLink,
  rankedItemSummary,
  resetItemsByReplace,
  uploadJsonImportFile,
} from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('maps link ignores imported mapsUrl and uses Google Maps query built from item fields', async ({ page }) => {
  await page.goto('/')

  const now = new Date().toISOString()
  const imported = [
    {
      id: 'evil-maps-1',
      tag: 'カレー',
      location: '神田',
      name: '安全カレー店',
      rank: 1,
      memo: 'import maps safety',
      mapsUrl: 'https://evil.example/phishing',
      placeId: '',
      createdAt: now,
      updatedAt: now,
    },
  ]

  await uploadJsonImportFile(page, 'import-evil-maps.json', imported)

  await confirmImportAndWaitForStatus(page, 'インポート成功: 1件を反映しました。')

  await rankedItemSummary(page, 1, '安全カレー店').click()
  const mapsAnchor = mapsLink(page).first()
  await expect(mapsAnchor).toBeVisible()

  const href = await mapsAnchor.getAttribute('href')
  expect(href).toBeTruthy()
  const url = new URL(href as string)

  expect(url.origin).toBe('https://www.google.com')
  expect(url.pathname).toBe('/maps/search/')
  expect(url.searchParams.get('api')).toBe('1')

  const query = url.searchParams.get('query') ?? ''
  expect(query).toContain('安全カレー店')
  expect(query).toContain('神田')
  expect(query).toContain('カレー')
})
