import { stat } from 'node:fs/promises'
import { expect, test, type Page, type TestInfo } from '@playwright/test'
import {
  importPreviewPanel,
  importValidationErrorDetails,
  rankedItemSummary,
  replaceItems,
  resetItemsByReplace,
  uploadJsonImportFile,
} from './e2e-helpers'

type ScreenshotName = '01-home-seeded-list' | '02-import-preview' | '03-import-validation-error'

const now = '2026-05-24T00:00:00.000Z'

const seededItems = [
  item('seed-1', 'ラーメン', '松戸', '中華蕎麦 とみ田', 1, '濃厚つけ麺の定番'),
  item('seed-2', 'ラーメン', '柏', 'AKEBI', 2, '駅近で寄りやすい'),
  item('seed-3', 'カフェ', '柏の葉', 'KASHIWANOHA T-SITE Cafe', 1, '作業しやすい'),
]

const previewItems = [
  item('preview-1', 'スイーツ', '流山おおたかの森', '森のプリン屋', 1, '手土産向き'),
  item('preview-2', 'スイーツ', '柏', '柏ショコラ', 2, 'チョコが濃い'),
]

function item(id: string, tag: string, location: string, name: string, rank: number, memo: string) {
  return {
    id,
    tag,
    location,
    name,
    rank,
    memo,
    mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} ${location} ${tag}`)}`,
    placeId: '',
    createdAt: now,
    updatedAt: now,
  }
}

async function capture(page: Page, testInfo: TestInfo, name: ScreenshotName) {
  const path = testInfo.outputPath(`${name}.png`)
  await page.screenshot({ path, fullPage: true })
  const { size } = await stat(path)
  expect(size, `${name}.png should be a non-empty screenshot artifact`).toBeGreaterThan(10_000)
  await testInfo.attach(name, { path, contentType: 'image/png' })
}

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('captures current UI screenshots for seeded list, import preview, and validation failure states', async ({ page, request }, testInfo) => {
  await replaceItems(request, { items: seededItems })
  await page.goto('/')
  await expect(rankedItemSummary(page, 1, '中華蕎麦 とみ田')).toBeVisible()
  await capture(page, testInfo, '01-home-seeded-list')

  await uploadJsonImportFile(page, 'screenshot-preview.json', previewItems)
  await expect(importPreviewPanel(page)).toBeVisible()
  await capture(page, testInfo, '02-import-preview')

  await uploadJsonImportFile(page, 'screenshot-invalid.json', [{ ...previewItems[0], name: '' }])
  await expect(importValidationErrorDetails(page)).toBeVisible()
  await capture(page, testInfo, '03-import-validation-error')
})
