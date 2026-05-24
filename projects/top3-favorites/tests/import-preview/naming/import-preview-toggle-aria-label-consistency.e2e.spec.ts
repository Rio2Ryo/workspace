import { expect, test } from '@playwright/test'
import {
  createTagRankSeriesPayload,
  importPreviewPanel,
  importPreviewToggleExcludedDetails,
  importPreviewToggleImpactTags,
  importPreviewToggleTermsHelper,
  resetItemsByDelete,
  uploadJsonImportFile,
} from '../../e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByDelete(request)
})

test('all import preview toggles use consistent aria-label prefix without colliding with the panel label', async ({ page }) => {
  await page.goto('/')

  const payload = createTagRankSeriesPayload(['A', 'B', 'C', 'D', 'E', 'F'])

  await uploadJsonImportFile(page, 'toggle-aria-label-consistency.json', payload)

  const tagsToggle = importPreviewToggleImpactTags(page)
  const excludedToggle = importPreviewToggleExcludedDetails(page)
  const termsToggle = importPreviewToggleTermsHelper(page)

  await expect(importPreviewPanel(page)).toHaveCount(1)
  await expect(tagsToggle).toHaveAttribute('aria-label', /^インポート詳細: 影響タグを全件表示/)
  await expect(excludedToggle).toHaveAttribute('aria-label', /^インポート詳細: 除外理由を全件表示/)
  await expect(termsToggle).toHaveAttribute('aria-label', /^インポート詳細: 差分用語の詳細説明を表示/)

  await tagsToggle.click()
  await excludedToggle.click()
  await termsToggle.click()

  await expect(importPreviewPanel(page)).toHaveCount(1)
  await expect(tagsToggle).toHaveAttribute('aria-label', /^インポート詳細: 影響タグを折りたたむ/)
  await expect(excludedToggle).toHaveAttribute('aria-label', /^インポート詳細: 除外理由を折りたたむ/)
  await expect(termsToggle).toHaveAttribute('aria-label', /^インポート詳細: 差分用語の詳細説明を隠す/)
})
