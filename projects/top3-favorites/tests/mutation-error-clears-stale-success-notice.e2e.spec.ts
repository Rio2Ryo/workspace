import { expect, test } from '@playwright/test'

test.beforeEach(async ({ request }) => {
  const data = (await request.get('/api/items').then((res) => res.json())) as { items: { id: string }[] }
  for (const item of data.items) {
    await request.delete(`/api/items?id=${encodeURIComponent(item.id)}`)
  }
})

async function seedOne(page: import('@playwright/test').Page, name: string) {
  await page.goto('/')
  await page.getByLabel('タグ', { exact: true }).fill('カフェラテ')
  await page.getByLabel('場所', { exact: true }).fill('柏の葉')
  await page.getByLabel('店舗名', { exact: true }).fill(name)
  await page.getByRole('button', { name: 'DBに保存' }).click()
  await expect(page.getByRole('status')).toContainText('カフェラテ の1位に保存しました。')
}

test('failed edit clears stale success notice and keeps edit draft for retry', async ({ page }) => {
  await seedOne(page, 'Edit Base')

  await page.getByText('1位: Edit Base').click()
  await page.getByRole('button', { name: 'Edit Baseを編集' }).click()
  await page.getByLabel('編集 店舗名').fill('Edit Retry Candidate')

  await page.route('**/api/items', async (route) => {
    if (route.request().method() === 'PUT') {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: '編集APIが一時的に利用できません。' }),
      })
      return
    }
    await route.continue()
  })

  await page.getByRole('button', { name: '編集を保存' }).click()

  await expect(page.getByRole('alert')).toContainText('編集APIが一時的に利用できません。')
  await expect(page.getByText('カフェラテ の1位に保存しました。')).toHaveCount(0)
  await expect(page.getByLabel('編集 店舗名')).toHaveValue('Edit Retry Candidate')
})

test('failed delete clears stale success notice and keeps item visible', async ({ page }) => {
  await seedOne(page, 'Delete Base')

  await page.getByText('1位: Delete Base').click()
  await page.route('**/api/items?**', async (route) => {
    if (route.request().method() === 'DELETE') {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: '削除APIが一時的に利用できません。' }),
      })
      return
    }
    await route.continue()
  })
  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('Delete Base をTop3から削除しますか？')
    await dialog.accept()
  })

  await page.getByRole('button', { name: 'Delete Baseを削除' }).click()

  await expect(page.getByRole('alert')).toContainText('削除APIが一時的に利用できません。')
  await expect(page.getByText('カフェラテ の1位に保存しました。')).toHaveCount(0)
  await expect(page.getByText('1位: Delete Base')).toBeVisible()
})
