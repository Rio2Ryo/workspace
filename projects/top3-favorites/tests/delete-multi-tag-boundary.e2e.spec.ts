import { expect, test } from '@playwright/test'
import { resetItemsByReplace , itemDeleteButton} from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('delete removes only the confirmed target item when multiple tags exist', async ({ page, request }) => {
  // Seed multiple tags/items through the same API the UI uses, then exercise the real delete control.
  await request.post('/api/items', { data: { tag: 'カフェラテ', location: '柏の葉', rank: 1, name: '削除対象A', memo: '' } })
  await request.post('/api/items', { data: { tag: 'つけ麺', location: '松戸', rank: 1, name: '残すB', memo: '' } })
  await request.post('/api/items', { data: { tag: 'プリン', location: '浅草', rank: 1, name: '残すC', memo: '' } })

  await page.goto('/')

  // Open target item and delete only that one
  const searchSection = page.locator('section.card').filter({ has: page.getByRole('heading', { name: '探す' }) })
  await searchSection.getByRole('button', { name: '#カフェラテ' }).click()
  await expect(searchSection.getByText(/\d位: 削除対象A/)).toBeVisible()
  await searchSection.getByText(/\d位: 削除対象A/).click()

  let sawDialog = false
  page.once('dialog', async (dialog) => {
    sawDialog = true
    expect(dialog.message()).toContain('削除対象A をTop3から削除しますか？')
    await dialog.accept()
  })

  await itemDeleteButton(page, '削除対象A').click()

  expect(sawDialog).toBe(true)
  await expect(page.getByRole('status')).toContainText('削除しました。')

  // Target should be deleted
  await expect(page.getByText('削除対象A')).not.toBeVisible()

  // Filter should auto-clear when the selected tag disappears
  await expect(searchSection.getByRole('button', { name: 'クリア' })).not.toBeVisible()

  // Other-tag items must remain
  await expect(searchSection.getByText('残すB')).toBeVisible()
  await expect(searchSection.getByText('残すC')).toBeVisible()
})
