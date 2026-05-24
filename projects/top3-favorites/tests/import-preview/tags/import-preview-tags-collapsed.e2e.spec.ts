import { expect, test } from '@playwright/test'
import { createImportTestItem, importPreviewImpactTags, resetItemsByReplace, uploadJsonImportFile,
  importPreviewListItems,
} from '../../e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('impact tags are collapsed when many tags are affected', async ({ page }) => {
  await page.goto('/')

  const payload = ['Aタグ', 'Bタグ', 'Cタグ', 'Dタグ', 'Eタグ', 'Fタグ'].map((tag, index) =>
    createImportTestItem(`${index + 1}`, tag, `${tag[0]}1`, 1),
  )

  await uploadJsonImportFile(page, 'impact-many-tags.json', payload)

  const tags = importPreviewImpactTags(page)
  await expect(tags).toContainText('影響タグ: 5件')
  await expect(importPreviewListItems(tags)).toHaveText(['Aタグ', 'Bタグ', 'Cタグ', 'Dタグ', 'Eタグ'])
  await expect(tags).toContainText('ほか1件')
})
