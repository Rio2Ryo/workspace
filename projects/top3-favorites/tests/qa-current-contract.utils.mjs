import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'

export async function collectBracketScopesFromTestTitles(fileUrl) {
  const source = await readFile(fileUrl, 'utf8')
  const scopes = new Set()
  const titleRegex = /test\(\s*(["'`])\[(.+?)\]/g
  let m
  while ((m = titleRegex.exec(source)) !== null) {
    scopes.add(m[2])
  }
  return Array.from(scopes).sort((a, b) => a.localeCompare(b, 'en'))
}

export async function collectFiles(dirUrl, predicate) {
  const entries = await readdir(dirUrl, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const childUrl = new URL(entry.name, dirUrl)
    if (entry.isDirectory()) {
      files.push(...await collectFiles(new URL(`${entry.name}/`, dirUrl), predicate))
      continue
    }
    if (predicate(entry.name)) {
      files.push(childUrl)
    }
  }

  return files
}

export async function collectSpecUrlsByNamePredicate(rootUrl, namePredicate) {
  return collectFiles(new URL('tests/', `${rootUrl}/`), (name) => namePredicate(name) && name.endsWith('.e2e.spec.ts'))
}

export async function findScopeRuleOverlaps(contractTestPaths, scopeLimitRules) {
  const scopeSources = new Map()

  for (const path of contractTestPaths) {
    const sourcePath = path.pathname.split('/').pop() ?? path.pathname
    for (const scope of await collectBracketScopesFromTestTitles(path)) {
      const sources = scopeSources.get(scope) ?? new Set()
      sources.add(sourcePath)
      scopeSources.set(scope, sources)
    }
  }

  const overlaps = []
  for (const [scope, sources] of scopeSources.entries()) {
    const matched = scopeLimitRules.filter(({ pattern }) => pattern.test(scope))
    if (matched.length > 1) {
      const ruleIds = matched
        .map(({ id, description, pattern }) => {
          if (!id) return `pattern:${String(pattern)}`
          return description ? `rule:${id}(${description})` : `rule:${id}`
        })
        .join(', ')
      overlaps.push(
        `${scope} @ ${Array.from(sources).sort((a, b) => a.localeCompare(b, 'en')).join(' + ')} -> ${ruleIds}`,
      )
    }
  }

  return overlaps.sort((a, b) => a.localeCompare(b, 'en'))
}

export function analyzeDuplicates(values) {
  return values.filter((v, i, arr) => arr.indexOf(v) !== i)
}

export function analyzeEnumList(values, { allowed = null, locale = 'en' } = {}) {
  const invalid = allowed ? values.filter((v) => !allowed.has(v)) : []
  const duplicates = analyzeDuplicates(values)
  const unsorted = values
    .filter((v, i, arr) => i > 0 && arr[i - 1].localeCompare(v, locale) > 0)
    .sort((a, b) => a.localeCompare(b, locale))

  return { invalid, duplicates, unsorted }
}

export function assertDeepFrozen(value, { label = 'value', visit = new Set(), skip = () => false } = {}) {
  if (value == null) return
  if (typeof value !== 'object' && typeof value !== 'function') return
  if (visit.has(value) || skip(value)) return
  visit.add(value)

  assert.equal(Object.isFrozen(value), true, `${label} must be deeply frozen`)

  const entries = [
    ...Object.entries(value),
    ...Object.getOwnPropertySymbols(value).map((sym) => [sym, value[sym]]),
  ]

  for (const [key, child] of entries) {
    assertDeepFrozen(child, {
      label: `${label}.${String(key)}`,
      visit,
      skip,
    })
  }
}

export async function findBeforeEachOffenders(rootUrl, specUrls, blockPattern) {
  const offenders = []

  for (const specUrl of specUrls) {
    const source = await readFile(specUrl, 'utf8')
    const beforeEachBlocks = source.match(/test\.beforeEach\([\s\S]*?\n\}\)/g) ?? []

    for (const block of beforeEachBlocks) {
      if (blockPattern.test(block)) {
        offenders.push(specUrl.pathname.replace(rootUrl.pathname, ''))
        break
      }
    }
  }

  return offenders.sort()
}
