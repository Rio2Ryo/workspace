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
        .map(({ id, pattern }) => (id ? `rule:${id}` : `pattern:${String(pattern)}`))
        .join(', ')
      overlaps.push(
        `${scope} @ ${Array.from(sources).sort((a, b) => a.localeCompare(b, 'en')).join(' + ')} -> ${ruleIds}`,
      )
    }
  }

  return overlaps.sort((a, b) => a.localeCompare(b, 'en'))
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
