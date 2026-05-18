import { readdir, readFile } from 'node:fs/promises'

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
