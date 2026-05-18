import { expect, test } from '@playwright/test'

test.beforeEach(async ({ request }) => {
  const data = (await request.get('/api/items').then((res) => res.json())) as { items: { id: string }[] }
  for (const item of data.items) {
    await request.delete(`/api/items?id=${encodeURIComponent(item.id)}`)
  }
})

test('import preview metrics/helpers use unified import-preview-* testid naming', async ({ page, request }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'サンプルをDB保存' }).click()
  await expect(page.getByRole('status')).toContainText('サンプルをDBに保存しました。')

  const current = (await request.get('/api/items').then((res) => res.json())) as { items: unknown[] }
  await page.locator('input[type="file"][accept*="json"]').setInputFiles({
    name: 'preview-testid-consistency.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(current.items), 'utf-8'),
  })

  await expect(page.getByTestId('import-preview-direction-metrics')).toBeVisible()
  await expect(page.getByTestId('import-preview-metric-added')).toBeVisible()
  await expect(page.getByTestId('import-preview-metric-kept')).toBeVisible()
  await expect(page.getByTestId('import-preview-metric-removed')).toBeVisible()

  await page.getByTestId('import-preview-toggle-terms-helper').click()
  await expect(page.getByTestId('import-preview-terms-helper')).toBeVisible()
})
