import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('..', import.meta.url)
const helperPath = new URL('tests/e2e-helpers.ts', `${root}/`)
const testsRoot = new URL('tests/', `${root}/`)
const packagePath = new URL('package.json', `${root}/`)
const allowedDirectHeadingNames = new Set(['好きな店を、タグ別Top3で残す', '探す'])

async function listE2eSpecs(dirUrl) {
  const entries = await readdir(dirUrl, { withFileTypes: true })
  const specs = []

  for (const entry of entries) {
    const childUrl = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, dirUrl)
    if (entry.isDirectory()) {
      specs.push(...(await listE2eSpecs(childUrl)))
      continue
    }
    if (entry.isFile() && entry.name.endsWith('.e2e.spec.ts')) specs.push(childUrl)
  }

  return specs.sort((a, b) => a.pathname.localeCompare(b.pathname))
}

function relativePath(url) {
  return url.pathname.replace(root.pathname, '').replace(/^\/+/, '')
}

function importsHelper(source, helperName) {
  return new RegExp(`import \\{[^}]*\\b${helperName}\\b[^}]*\\} from '(?:\\.\\/|\\.\\.\\/)*e2e-helpers'`).test(source)
}

test('[E2E-Helper][tag-heading] E2E specs use shared tag heading locator for visible tag assertions', async () => {
  const offenders = []
  const directHeadingPattern = /(?:page|searchSection|[^\s.]+)\.getByRole\(['"]heading['"],\s*\{\s*name:\s*['"]([^'"]+)['"]\s*\}\)/g
  const specs = await listE2eSpecs(testsRoot)

  for (const specUrl of specs) {
    const source = await readFile(specUrl, 'utf8')
    const path = relativePath(specUrl)
    const directTagHeadings = [...source.matchAll(directHeadingPattern)]
      .map((match) => match[1])
      .filter((name) => !allowedDirectHeadingNames.has(name))

    if (directTagHeadings.length > 0) {
      offenders.push(`${path}: direct tag heading locator(s): ${directTagHeadings.join(', ')}`)
    }
    if (/tagHeading\(/.test(source) && !importsHelper(source, 'tagHeading')) {
      offenders.push(`${path}: tagHeading call without named import`)
    }
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    `Tag heading visibility should be asserted through tagHeading(scope, tag): ${offenders.join(', ')}`,
  )
})

test('[E2E-Helper][tag-heading] helper owns the tag heading accessible role contract', async () => {
  const source = await readFile(helperPath, 'utf8')

  assert.match(
    source,
    /export function tagHeading\(scope: Page \| Locator, tag: string\): Locator/,
    'tests/e2e-helpers.ts should export tagHeading(scope, tag)',
  )
  assert.match(source, /tagHeading[\s\S]*getByRole\(['"]heading['"],[\s\S]*name:\s*tag/, 'tagHeading should own heading role + tag accessible-name lookup')
})

test('[App][config-quality] full verification runs tag heading helper contract', async () => {
  const pkg = JSON.parse(await readFile(packagePath, 'utf8'))

  assert.equal(pkg.scripts['test:tag-heading-helper-contract'], 'node --test tests/tag-heading-helper-contract.test.mjs')
  assert.match(pkg.scripts['test:full'], /pnpm test:tag-heading-helper-contract/, 'pnpm test:full should include the tag heading helper contract')
})
