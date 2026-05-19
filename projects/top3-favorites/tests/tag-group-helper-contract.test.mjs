import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('..', import.meta.url)
const helperPath = new URL('tests/e2e-helpers.ts', `${root}/`)
const testsRoot = new URL('tests/', `${root}/`)
const packagePath = new URL('package.json', `${root}/`)

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

test('[E2E-Helper][tag-group] E2E specs use shared tag group locator for grouped Top3 sections', async () => {
  const offenders = []
  const specs = await listE2eSpecs(testsRoot)

  for (const specUrl of specs) {
    const source = await readFile(specUrl, 'utf8')
    const path = relativePath(specUrl)
    const directGroupHeading = /\.locator\(['"]\.group['"]\)\.filter\(\{\s*has:\s*(?:page|searchSection|[^\s.]+)\.getByRole\(['"]heading['"],\s*\{\s*name:/.test(source)
    const usesHelper = /tagGroup\(/.test(source)

    if (directGroupHeading) offenders.push(`${path}: direct .group heading filter locator`)
    if (usesHelper && !importsHelper(source, 'tagGroup')) {
      offenders.push(`${path}: tagGroup call without named import`)
    }
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    `Grouped Top3 sections should be located through tagGroup(scope, tag): ${offenders.join(', ')}`,
  )
})

test('[E2E-Helper][tag-group] helper owns the grouped Top3 section structure', async () => {
  const source = await readFile(helperPath, 'utf8')

  assert.match(
    source,
    /export function tagGroup\(scope: Page \| Locator, tag: string\): Locator/,
    'tests/e2e-helpers.ts should export tagGroup(scope, tag)',
  )
  assert.match(source, /tagGroup[\s\S]*locator\(['"]\.group['"]\)[\s\S]*getByRole\(['"]heading['"],[\s\S]*name:\s*tag/, 'tagGroup should own the .group + heading structure')
}
)

test('[App][config-quality] full verification runs tag group helper contract', async () => {
  const pkg = JSON.parse(await readFile(packagePath, 'utf8'))

  assert.equal(pkg.scripts['test:tag-group-helper-contract'], 'node --test tests/tag-group-helper-contract.test.mjs')
  assert.match(pkg.scripts['test:full'], /pnpm test:tag-group-helper-contract/, 'pnpm test:full should include the tag group helper contract')
})
