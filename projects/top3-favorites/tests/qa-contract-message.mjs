export function contractMessage({ scope, rule, expected, fix }) {
  return `[Contract][${scope}] ${rule} | expected: ${expected} | fix: ${fix}`
}

export function summarizeItems(items, limit = 5) {
  if (!items || items.length === 0) return '- (none)'
  const head = items.slice(0, limit).map((item) => `- ${item}`).join('\n')
  const rest = items.length - Math.min(items.length, limit)
  return rest > 0 ? `${head}\n- ... and ${rest} more` : head
}

export function missingItemsMessage({ scope, rule, fix, items, limit = 5 }) {
  return `${contractMessage({ scope, rule, expected: 'no missing items', fix })}\n${summarizeItems(items, limit)}`
}
