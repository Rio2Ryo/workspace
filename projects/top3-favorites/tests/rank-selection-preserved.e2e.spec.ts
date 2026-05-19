import { expect, test } from '@playwright/test'
import { resetItemsByReplace, registrationSaveButton, expectOperationStatus, registrationRankButton, registrationLocationField, registrationNameField, registrationTagField } from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('saving with rank 3 keeps the selected rank in API and list output', async ({ page, request }) => {
  await page.goto('/')

  await registrationTagField(page).fill('ランチ')
  await registrationLocationField(page).fill('松戸')
  await registrationNameField(page).fill('三番目食堂')
  const rank3Button = registrationRankButton(page, 3)
  await rank3Button.click()
  await expect(rank3Button).toHaveClass(/active/)
  await registrationSaveButton(page).click()
  await expectOperationStatus(page, '3位に保存しました。')

  const data = (await request.get('/api/items').then((res) => res.json())) as {
    items: { tag: string; name: string; rank: number }[]
  }
  const saved = data.items.find((item) => item.tag === 'ランチ' && item.name === '三番目食堂')
  expect(saved).toBeTruthy()
  expect(saved?.rank).toBe(3)

  const group = page.locator('.group').filter({ has: page.getByRole('heading', { name: 'ランチ' }) })
  await expect(group.locator('summary').filter({ hasText: /3位:\s*三番目食堂/ })).toBeVisible()
})
