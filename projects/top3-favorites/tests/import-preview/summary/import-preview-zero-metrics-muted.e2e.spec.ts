import { expect, test } from '@playwright/test'
import { resetItemsByReplace } from '../../e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('zero-value impact metric is marked as muted for quick visual scan', async ({ page, request }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'サンプルをDB保存' }).click()
  await expect(page.getByRole('status')).toContainText('サンプルをDBに保存しました。')

  // Re-import the exact same payload: added=0, kept=3, removed=0
  const current = (await request.get('/api/items').then((res) => res.json())) as { items: unknown[] }
  await page.locator('input[type="file"][accept*="json"]').setInputFiles({
    name: 'same-data.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(current.items), 'utf-8'),
  })

  await expect(page.getByTestId('import-preview-metric-added')).toHaveClass(/is-zero/)
  await expect(page.getByTestId('import-preview-metric-kept')).not.toHaveClass(/is-zero/)
  await expect(page.getByTestId('import-preview-metric-removed')).toHaveClass(/is-zero/)
})
