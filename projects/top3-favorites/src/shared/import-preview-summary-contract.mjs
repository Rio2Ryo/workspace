export const IMPORT_PREVIEW_SUMMARY_SCHEMA = 'top3-import-preview-summary'
export const IMPORT_PREVIEW_SUMMARY_VERSION = 1

const NUMBER_FIELDS = [
  'before',
  'after',
  'normalizationBefore',
  'normalizationAfter',
  'added',
  'kept',
  'removed',
  'excluded',
]

const STRING_ARRAY_FIELDS = [
  'tags',
  'excludedNames',
  'excludedNameLabels',
  'excludedNameReasonLabels',
  'excludedDetailLabels',
]

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function validateExcludedDetails(value) {
  if (!Array.isArray(value)) return 'excludedDetails must be an array'
  const invalidIndex = value.findIndex(
    (detail) =>
      !isObject(detail) ||
      typeof detail.tag !== 'string' ||
      typeof detail.name !== 'string' ||
      typeof detail.reason !== 'string',
  )
  return invalidIndex === -1 ? null : `excludedDetails[${invalidIndex}] must include string tag/name/reason`
}

function validateNormalizedExcludedNameGroups(value) {
  if (!Array.isArray(value)) return 'normalizedExcludedNameGroups must be an array'
  const invalidIndex = value.findIndex(
    (group) =>
      !isObject(group) ||
      typeof group.key !== 'string' ||
      !isStringArray(group.names) ||
      !isStringArray(group.labels),
  )
  return invalidIndex === -1
    ? null
    : `normalizedExcludedNameGroups[${invalidIndex}] must include string key and string[] names/labels`
}

export function validateImportPreviewSummary(summary) {
  if (!isObject(summary)) return 'summary must be an object'
  if (summary.schema !== IMPORT_PREVIEW_SUMMARY_SCHEMA) {
    return `schema must be ${IMPORT_PREVIEW_SUMMARY_SCHEMA}`
  }
  if (summary.version !== IMPORT_PREVIEW_SUMMARY_VERSION) {
    return `version must be ${IMPORT_PREVIEW_SUMMARY_VERSION}`
  }

  for (const field of NUMBER_FIELDS) {
    if (typeof summary[field] !== 'number' || !Number.isFinite(summary[field])) {
      return `${field} must be a finite number`
    }
  }

  for (const field of STRING_ARRAY_FIELDS) {
    if (!isStringArray(summary[field])) return `${field} must be a string array`
  }

  const groupError = validateNormalizedExcludedNameGroups(summary.normalizedExcludedNameGroups)
  if (groupError) return groupError

  const detailError = validateExcludedDetails(summary.excludedDetails)
  if (detailError) return detailError

  if (summary.added + summary.kept !== summary.after) return 'added + kept must equal after'
  if (summary.before - summary.removed !== summary.kept) return 'before - removed must equal kept'
  if (summary.normalizationBefore - summary.normalizationAfter !== summary.excluded) {
    return 'normalizationBefore - normalizationAfter must equal excluded'
  }
  if (summary.excludedNames.length !== summary.excludedNameLabels.length) {
    return 'excludedNames and excludedNameLabels must have the same length'
  }
  if (summary.excludedNames.length !== summary.excludedNameReasonLabels.length) {
    return 'excludedNames and excludedNameReasonLabels must have the same length'
  }
  return null
}
