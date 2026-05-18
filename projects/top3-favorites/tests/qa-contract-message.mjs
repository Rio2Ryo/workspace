import { contractMessageLimits, scopeLimitRules } from './qa-current-contract.config.mjs'

export function contractMessage({ scope, rule, expected, fix }) {
  return `[Contract][${scope}] ${rule} | expected: ${expected} | fix: ${fix}`
}

export function summarizeItems(items, limit = contractMessageLimits.default) {
  if (!items || items.length === 0) return '- (none)'
  const head = items.slice(0, limit).map((item) => `- ${item}`).join('\n')
  const rest = items.length - Math.min(items.length, limit)
  return rest > 0 ? `${head}\n- ... and ${rest} more` : head
}

export function resolveLimitForScope(scope) {
  for (const { pattern, limit } of scopeLimitRules) {
    if (pattern.test(scope)) return limit
  }
  return contractMessageLimits.default
}

export function formatContextPairs(context, { locale = 'en', sortMode = 'key' } = {}) {
  if (!context) return ''
  if (typeof context === 'string') return context

  const entries = Object.entries(context).map(([k, v]) => {
    const rawValues = Array.isArray(v) ? v.map(String) : [String(v)]
    return {
      key: k,
      values: rawValues,
      rendered: rawValues.join(', '),
      valueCount: Array.isArray(v) ? v.length : 1,
    }
  })

  entries.sort((a, b) => {
    if (sortMode === 'valueCountDesc' && a.valueCount !== b.valueCount) {
      return b.valueCount - a.valueCount
    }
    return a.key.localeCompare(b.key, locale)
  })

  if (entries.length === 0) return ''
  return entries.map(({ key, rendered }) => `${key}=${rendered}`).join(' | ')
}

export function missingItemsMessage({ scope, rule, fix, items, limit, context = '', contextSortMode = 'key' }) {
  const resolvedLimit = limit ?? resolveLimitForScope(scope)
  const renderedContext = formatContextPairs(context, { sortMode: contextSortMode })
  const contextBlock = renderedContext ? `\ncontext: ${renderedContext}` : ''
  return `${contractMessage({ scope, rule, expected: 'no missing items', fix })}${contextBlock}\n${summarizeItems(items, resolvedLimit)}`
}

export function configuredObservedOverview(configured, observed, { locale = 'en' } = {}) {
  const cfg = [...configured].sort((a, b) => a.localeCompare(b, locale)).join(', ')
  const obs = [...observed].sort((a, b) => a.localeCompare(b, locale)).join(', ')
  return `configured=[${cfg}] observed=[${obs}]`
}
