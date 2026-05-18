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

export function formatContextPairs(context, { locale = 'en' } = {}) {
  if (!context) return ''
  if (typeof context === 'string') return context
  const entries = Object.entries(context)
    .map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : String(v)])
    .sort((a, b) => a[0].localeCompare(b[0], locale))
  if (entries.length === 0) return ''
  return entries.map(([k, v]) => `${k}=${v}`).join(' | ')
}

export function missingItemsMessage({ scope, rule, fix, items, limit, context = '' }) {
  const resolvedLimit = limit ?? resolveLimitForScope(scope)
  const renderedContext = formatContextPairs(context)
  const contextBlock = renderedContext ? `\ncontext: ${renderedContext}` : ''
  return `${contractMessage({ scope, rule, expected: 'no missing items', fix })}${contextBlock}\n${summarizeItems(items, resolvedLimit)}`
}

export function configuredObservedOverview(configured, observed, { locale = 'en' } = {}) {
  const cfg = [...configured].sort((a, b) => a.localeCompare(b, locale)).join(', ')
  const obs = [...observed].sort((a, b) => a.localeCompare(b, locale)).join(', ')
  return `configured=[${cfg}] observed=[${obs}]`
}
