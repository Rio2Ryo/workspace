export function normalizeTagText(value) {
  return typeof value === 'string' ? value.normalize('NFKC').replace(/\s+/g, ' ').trim() : ''
}

export function normalizeTagKey(value) {
  return normalizeTagText(value).toLocaleLowerCase('ja')
}
