import { expect, test, type Page } from '@playwright/test'
import { dbPersistenceStatus } from './e2e-helpers'

function installFatalBrowserErrorCapture(page: Page) {
  const fatalErrors: string[] = []

  page.on('console', (msg) => {
    if (msg.type() === 'error') fatalErrors.push(msg.text())
  })
  page.on('pageerror', (error) => fatalErrors.push(error.message))

  return fatalErrors
}

test('startup renders without fatal console or page errors', async ({ page }) => {
  const fatalErrors = installFatalBrowserErrorCapture(page)

  await page.route('**/api/items', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], tags: [] }),
      })
      return
    }
    await route.continue()
  })

  await page.goto('/')

  await expect(dbPersistenceStatus(page)).toContainText('DB保存')
  await expect(page.getByRole('heading', { name: '好きな店を、タグ別Top3で残す' })).toBeVisible()
  expect(fatalErrors).toEqual([])
})
