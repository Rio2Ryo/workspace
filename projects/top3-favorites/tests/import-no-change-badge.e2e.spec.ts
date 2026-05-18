import { expect, test } from '@playwright/test'

test.beforeEach(async ({ request }) => {
  await request.post('/api/items?mode=replace', { data: { items: [] } })
})

test('import preview shows explicit no-change badge when payload matches current data', async ({ page, request }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'サンプルをDB保存' }).click()
  await expect(page.getByRole('status')).toContainText('サンプルをDBに保存しました。')

  const current = (await request.get('/api/items').then((res) => res.json())) as { items: unknown[] }

  await page.locator('input[type="file"][accept*="json"]').setInputFiles({
    name: 'same-data.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(current.items), 'utf-8'),
  })

  await expect(page.getByTestId('import-preview-counts')).toHaveAttribute('data-before-count', '3')
  await expect(page.getByTestId('import-preview-counts')).toHaveAttribute('data-after-count', '3')
  await expect(page.getByTestId('import-preview-no-change')).toHaveText('差分なし（このインポートでデータ変更はありません）')
})
