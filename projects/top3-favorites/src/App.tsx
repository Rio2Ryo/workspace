import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { IMPORT_PREVIEW_SUMMARY_SCHEMA, IMPORT_PREVIEW_SUMMARY_VERSION } from './shared/import-preview-summary-contract.mjs'
import { normalizeTagKey, normalizeTagText } from './shared/tag-normalization.mjs'

type Rank = 1 | 2 | 3

type FavoriteItem = {
  id: string
  tag: string
  location: string
  name: string
  rank: Rank
  memo: string
  mapsUrl: string
  placeId: string
  createdAt: string
  updatedAt: string
}

type Draft = {
  tag: string
  location: string
  name: string
  rank: Rank
  memo: string
}

type ImportExcludedDetail = {
  name: string
  tag: string
  reason: string
}

const SYNC_BREAK_NOTICE = '手入力によりタグ連動を解除しました。'

const DAILY_THEMES = [
  '今日よかったもの Top3',
  '最近よく行く場所 Top3',
  '今食べたいもの Top3',
  '作業が進む音楽 Top3',
  '買ってよかったもの Top3',
  'また行きたい店 Top3',
  '人にすすめたいもの Top3',
]
const todayTheme = DAILY_THEMES[new Date().getDay()]

type PendingImport = {
  items: FavoriteItem[]
  filename: string
  originalCount: number
  excludedNames: string[]
  excludedNameLabels: string[]
  excludedNameReasonLabels: string[]
  excludedDetails: ImportExcludedDetail[]
}

type ImportValidationIssue = {
  filename: string
  row: string
  path: string
  field: string
  fix: string
  invalidValue: string
  message: string
  totalIssues: number
  relatedIssues: Array<Pick<ImportValidationIssue, 'row' | 'path' | 'field' | 'invalidValue' | 'fix'>>
}

const initialDraft: Draft = {
  tag: 'カフェラテ',
  location: '',
  name: '',
  rank: 1,
  memo: '',
}

const sampleItems: Draft[] = [
  { tag: 'カフェラテ', location: '柏の葉', rank: 1, name: 'Solito MAGO', memo: 'ラテアートがきれい。ミルク感も好き' },
  { tag: 'カフェラテ', location: '柏の葉', rank: 2, name: 'T-SITEのカフェ', memo: '作業ついでに寄りやすい' },
  { tag: 'つけ麺', location: '松戸', rank: 1, name: 'とみ田', memo: '濃厚つけ麺が強い' },
]

function normalizeTag(tag: string): string {
  return normalizeTagText(tag)
}

function buildMapsUrl(input: Pick<FavoriteItem, 'name' | 'tag' | 'location'> | Draft): string {
  const query = [input.name, input.location, input.tag].filter(Boolean).join(' ')
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

function draftToPreview(draft: Draft): FavoriteItem {
  const now = new Date().toISOString()
  return {
    id: '__preview__',
    tag: normalizeTag(draft.tag),
    location: draft.location.trim(),
    name: draft.name.trim(),
    rank: draft.rank,
    memo: draft.memo.trim(),
    mapsUrl: buildMapsUrl(draft),
    placeId: '',
    createdAt: now,
    updatedAt: now,
  }
}

function compareTop3Items(a: FavoriteItem, b: FavoriteItem): number {
  return (
    a.rank - b.rank ||
    b.updatedAt.localeCompare(a.updatedAt) ||
    a.name.localeCompare(b.name, 'ja') ||
    a.id.localeCompare(b.id)
  )
}

function rankItems(items: FavoriteItem[], target?: FavoriteItem): FavoriteItem[] {
  const source = target ? [...items.filter((item) => item.id !== target.id), target] : items
  return source
    .sort(compareTop3Items)
    .reduce<FavoriteItem[]>((acc, item) => {
      if (target && item.id === target.id) {
        acc.splice(target.rank - 1, 0, item)
      } else {
        acc.push(item)
      }
      return acc
    }, [])
    .slice(0, 3)
}

function formatImportValidationValue(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value)
  if (value === undefined) return '未設定'
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

function importItemValidationIssue(value: unknown, index: number, filename: string): ImportValidationIssue | null {
  const row = `${index + 1}件目`
  const prefix = `ファイル「${filename}」の${row}`
  const detail = (field: string, fix: string): ImportValidationIssue => {
    const path = field === 'item' ? `$.items[${index}]` : `$.items[${index}].${field}`
    const invalidValue = formatImportValidationValue(field === 'item' ? value : (value as Record<string, unknown>)?.[field])
    return {
      filename,
      row,
      path,
      field,
      fix,
      invalidValue,
      message: `${prefix} / フィールド: ${field} / 修正: ${fix}`,
      totalIssues: 1,
      relatedIssues: [{ row, path, field, invalidValue, fix }],
    }
  }
  if (!value || typeof value !== 'object') return detail('item', '各行をオブジェクト形式にしてください。')
  const o = value as Record<string, unknown>

  const id = typeof o.id === 'string' ? o.id.trim() : ''
  const tag = typeof o.tag === 'string' ? o.tag.trim() : ''
  const name = typeof o.name === 'string' ? o.name.trim() : ''

  if (id.length === 0) return detail('id', 'IDを入力してください。')
  if (tag.length === 0) return detail('tag', 'タグを入力してください。')
  if (typeof o.location !== 'string') return detail('location', '場所を文字列で入力してください。')
  if (name.length === 0) return detail('name', '店舗名を入力してください。')
  if (!(o.rank === 1 || o.rank === 2 || o.rank === 3 || o.rank === '1' || o.rank === '2' || o.rank === '3')) return detail('rank', '順位は1〜3で入力してください。')
  if (typeof o.memo !== 'string') return detail('memo', 'メモを文字列で入力してください。')
  return null
}

function normalizeImportItem(value: FavoriteItem): FavoriteItem {
  const rankNum = Number(value.rank)
  const rank = (rankNum === 2 || rankNum === 3 ? rankNum : 1) as Rank
  const now = new Date().toISOString()
  const normalized = {
    ...value,
    id: value.id.trim(),
    tag: normalizeTagText(value.tag),
    location: value.location.trim(),
    name: value.name.trim(),
    memo: value.memo.trim(),
    rank,
    placeId: typeof value.placeId === 'string' ? value.placeId.trim() : '',
    createdAt: typeof value.createdAt === 'string' && value.createdAt.trim() ? value.createdAt.trim() : now,
    updatedAt: typeof value.updatedAt === 'string' && value.updatedAt.trim() ? value.updatedAt.trim() : now,
  }
  return { ...normalized, mapsUrl: buildMapsUrl(normalized) }
}

function duplicateImportIdError(items: FavoriteItem[], filename: string): string | null {
  const firstById = new Map<string, { item: FavoriteItem; index: number }>()
  for (const [index, item] of items.entries()) {
    const id = item.id.trim()
    const first = firstById.get(id)
    if (first) {
      const firstName = first.item.name.trim() || '店舗名なし'
      const duplicateName = item.name.trim() || '店舗名なし'
      return `ファイル「${filename}」のID「${id}」が${first.index + 1}件目「${firstName}」と${index + 1}件目「${duplicateName}」で重複しています。`
    }
    firstById.set(id, { item, index })
  }
  return null
}

function themeKey(item: Pick<FavoriteItem, 'tag'>): string {
  return normalizeTagKey(item.tag)
}

function analyzeImportedTop3(items: FavoriteItem[]): { items: FavoriteItem[]; excludedDetails: ImportExcludedDetail[] } {
  const byTheme = new Map<string, FavoriteItem[]>()
  for (const item of items) {
    const key = themeKey(item)
    byTheme.set(key, [...(byTheme.get(key) ?? []), item])
  }

  const normalized: FavoriteItem[] = []
  const excludedDetails: ImportExcludedDetail[] = []
  for (const list of byTheme.values()) {
    const sorted = [...list].sort(compareTop3Items)
    const tag = sorted[0]?.tag.trim() || 'このタグ'
    const top3 = sorted
      .slice(0, 3)
      .map((item, index) => ({ ...item, rank: (index + 1) as Rank }))
    normalized.push(...top3)
    excludedDetails.push(
      ...sorted.slice(3).map((item, index) => ({
        name: item.name.trim(),
        tag,
        reason: `${tag}でTop3外: ${index + 4}位相当`,
      })),
    )
  }
  return {
    items: normalized,
    excludedDetails: excludedDetails.filter((detail) => detail.name),
  }
}

function normalizeExcludedNameKey(name: string): string {
  return name
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('ja')
}

function buildExcludedNameLabel(detail: ImportExcludedDetail, nameCounts: Map<string, number>): string {
  const name = detail.name.trim()
  if (!name) return ''
  const normalizedName = normalizeExcludedNameKey(name)
  return (nameCounts.get(normalizedName) ?? 0) > 1 ? `${detail.tag}: ${name}` : name
}

function countExcludedNames(details: ImportExcludedDetail[]): Map<string, number> {
  const nameCounts = new Map<string, number>()
  for (const detail of details) {
    const normalizedName = normalizeExcludedNameKey(detail.name)
    if (!normalizedName) continue
    nameCounts.set(normalizedName, (nameCounts.get(normalizedName) ?? 0) + 1)
  }
  return nameCounts
}

function buildExcludedNameLabels(details: ImportExcludedDetail[]): string[] {
  const nameCounts = countExcludedNames(details)

  return details
    .map((detail) => buildExcludedNameLabel(detail, nameCounts))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'ja'))
}

function buildExcludedNameReasonLabels(details: ImportExcludedDetail[]): string[] {
  return buildExcludedDetailsWithLabels(details)
    .filter((detail) => detail.label && detail.reason)
    .map((detail) => `${detail.label}（${detail.reason}）`)
    .sort((a, b) => a.localeCompare(b, 'ja'))
}

function buildExcludedDetailsWithLabels(details: ImportExcludedDetail[]): Array<ImportExcludedDetail & { label: string }> {
  const nameCounts = countExcludedNames(details)
  return details.map((detail) => ({
    ...detail,
    label: buildExcludedNameLabel(detail, nameCounts),
  }))
}

function buildNormalizedExcludedNameGroups(details: ImportExcludedDetail[]): Array<{ key: string; names: string[]; labels: string[] }> {
  const nameCounts = countExcludedNames(details)
  const groups = new Map<string, { names: string[]; labels: string[] }>()
  for (const detail of details) {
    const name = detail.name.trim()
    const key = normalizeExcludedNameKey(name)
    if (!key || !name) continue
    const group = groups.get(key) ?? { names: [], labels: [] }
    const label = buildExcludedNameLabel(detail, nameCounts)
    if (!group.names.includes(name)) group.names.push(name)
    if (label && !group.labels.includes(label)) group.labels.push(label)
    groups.set(key, group)
  }

  return Array.from(groups.entries())
    .filter(([, group]) => group.names.length > 1)
    .map(([key, group]) => ({ key, names: group.names, labels: group.labels }))
    .sort((a, b) => a.key.localeCompare(b.key, 'ja'))
}

function buildExcludedLeadLabel(details: ImportExcludedDetail[]): string {
  const firstDetail = buildExcludedDetailsWithLabels(details).find((detail) => detail.label)
  return firstDetail?.label ?? ''
}

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options?.headers ?? {}),
    },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? 'API error')
  return data as T
}

function readImportFileText(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text()

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }
      reject(new Error('FileReader returned non-text import data'))
    }
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed to read import data'))
    reader.readAsText(file)
  })
}

export function App() {
  const [items, setItems] = useState<FavoriteItem[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [draft, setDraft] = useState<Draft>(initialDraft)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingDraft, setEditingDraft] = useState<Draft>(initialDraft)
  const [query, setQuery] = useState('')
  const [selectedTag, setSelectedTag] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loadError, setLoadError] = useState(false)
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null)
  const [importValidationIssue, setImportValidationIssue] = useState<ImportValidationIssue | null>(null)
  const [clipboardFallback, setClipboardFallback] = useState<{ label: string; text: string } | null>(null)
  const [manualExport, setManualExport] = useState<{ filename: string; text: string } | null>(null)
  const [selectedImportValidationField, setSelectedImportValidationField] = useState('')
  const [isImportValidationRepairListExpanded, setIsImportValidationRepairListExpanded] = useState(false)
  const [isImpactTagsExpanded, setIsImpactTagsExpanded] = useState(false)
  const [isExcludedNamesExpanded, setIsExcludedNamesExpanded] = useState(false)
  const [isExcludedDetailsExpanded, setIsExcludedDetailsExpanded] = useState(false)
  const [isImpactTermsHelperExpanded, setIsImpactTermsHelperExpanded] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const tagInputRef = useRef<HTMLInputElement | null>(null)
  const errorAlertRef = useRef<HTMLDivElement | null>(null)
  const clipboardFallbackRef = useRef<HTMLTextAreaElement | null>(null)
  const manualExportRef = useRef<HTMLTextAreaElement | null>(null)

  const clearFeedback = (options?: { pendingImport?: boolean }) => {
    setError('')
    setNotice('')
    setClipboardFallback(null)
    setManualExport(null)
    setImportValidationIssue(null)
    setSelectedImportValidationField('')
    setIsImportValidationRepairListExpanded(false)
    if (options?.pendingImport) {
      setPendingImport(null)
      setIsImpactTagsExpanded(false)
      setIsExcludedNamesExpanded(false)
      setIsExcludedDetailsExpanded(false)
      setIsImpactTermsHelperExpanded(false)
    }
  }

  const loadItems = async () => {
    setIsLoading(true)
    try {
      const data = await api<{ items: FavoriteItem[]; tags: string[] }>('/api/items')
      setItems(data.items)
      setTags(data.tags)
      setError('')
      setLoadError(false)
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'データ取得に失敗しました')
      setLoadError(true)
      return false
    } finally {
      setIsLoading(false)
    }
  }

  const retryLoadItems = async () => {
    clearFeedback()
    const ok = await loadItems()
    if (ok) setNotice('データを再読み込みしました。')
  }

  useEffect(() => {
    void loadItems()
  }, [])

  useEffect(() => {
    if (selectedTag && normalizeTagKey(draft.tag) !== normalizeTagKey(selectedTag)) setSelectedTag('')
  }, [draft.tag, selectedTag])

  useEffect(() => {
    if (notice !== SYNC_BREAK_NOTICE) return
    const id = window.setTimeout(() => {
      setNotice((prev) => (prev === SYNC_BREAK_NOTICE ? '' : prev))
    }, 3000)
    return () => window.clearTimeout(id)
  }, [notice])

  useLayoutEffect(() => {
    if (!error) return
    errorAlertRef.current?.focus()
  }, [error, importValidationIssue])

  useEffect(() => {
    if (!clipboardFallback) return
    clipboardFallbackRef.current?.focus()
    clipboardFallbackRef.current?.select()
  }, [clipboardFallback])

  useEffect(() => {
    if (!manualExport) return
    manualExportRef.current?.focus()
    manualExportRef.current?.select()
  }, [manualExport])

  const isImportPreviewActive = !!pendingImport

  const currentTag = normalizeTag(draft.tag)
  const currentTop3 = useMemo(
    () => rankItems(items.filter((item) => item.tag === currentTag)),
    [currentTag, items],
  )

  const previewTop3 = useMemo(() => {
    if (!draft.name.trim() || !currentTag) return currentTop3
    return rankItems(currentTop3, draftToPreview(draft))
  }, [currentTag, currentTop3, draft])

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const activeTag = selectedTag || ''
    const filtered = items.filter((item) => {
      const hay = `${item.tag} ${item.location} ${item.name} ${item.memo}`.toLowerCase()
      return (!activeTag || item.tag === activeTag) && (!q || hay.includes(q))
    })

    const map = new Map<string, FavoriteItem[]>()
    for (const item of filtered) {
      map.set(item.tag, [...(map.get(item.tag) ?? []), item])
    }
    return Array.from(map.entries())
      .map(([tag, list]) => [tag, rankItems(list)] as const)
      .sort((a, b) => a[0].localeCompare(b[0], 'ja'))
  }, [items, query, selectedTag])

  const pendingImportImpact = useMemo(() => {
    if (!pendingImport) return null
    const currentIds = new Set(items.map((item) => item.id))
    const importIds = new Set(pendingImport.items.map((item) => item.id))
    const added = pendingImport.items.filter((item) => !currentIds.has(item.id)).length
    const kept = pendingImport.items.filter((item) => currentIds.has(item.id)).length
    const removed = items.filter((item) => !importIds.has(item.id)).length
    const excluded = pendingImport.originalCount - pendingImport.items.length
    const tagSet = new Set<string>()
    for (const item of items) tagSet.add(item.tag)
    for (const item of pendingImport.items) tagSet.add(item.tag)
    return { added, kept, removed, excluded, tags: Array.from(tagSet).filter(Boolean).sort((a, b) => a.localeCompare(b, 'ja')) }
  }, [items, pendingImport])

  const pendingImportSummary = useMemo(() => {
    if (!pendingImport || !pendingImportImpact) return null
    const excludedDetailsWithLabels = buildExcludedDetailsWithLabels(pendingImport.excludedDetails)
    const normalizedExcludedNameGroups = buildNormalizedExcludedNameGroups(pendingImport.excludedDetails)
    return {
      schema: IMPORT_PREVIEW_SUMMARY_SCHEMA,
      version: IMPORT_PREVIEW_SUMMARY_VERSION,
      before: items.length,
      after: pendingImport.items.length,
      normalizationBefore: pendingImport.originalCount,
      normalizationAfter: pendingImport.items.length,
      added: pendingImportImpact.added,
      kept: pendingImportImpact.kept,
      removed: pendingImportImpact.removed,
      excluded: pendingImportImpact.excluded,
      tags: pendingImportImpact.tags,
      excludedNames: pendingImport.excludedNames,
      excludedNameLabels: pendingImport.excludedNameLabels,
      excludedNameReasonLabels: pendingImport.excludedNameReasonLabels,
      excludedDetailLabels: excludedDetailsWithLabels.map((detail) => detail.label).filter(Boolean),
      normalizedExcludedNameGroups,
      excludedDetails: pendingImport.excludedDetails,
    }
  }, [items.length, pendingImport, pendingImportImpact])

  const pendingImportImpactTagPreview = useMemo(() => {
    if (!pendingImportImpact) return { visible: [] as string[], hiddenCount: 0 }
    if (isImpactTagsExpanded) return { visible: pendingImportImpact.tags, hiddenCount: 0 }
    const visible = pendingImportImpact.tags.slice(0, 5)
    const hiddenCount = Math.max(0, pendingImportImpact.tags.length - visible.length)
    return { visible, hiddenCount }
  }, [isImpactTagsExpanded, pendingImportImpact])

  const excludedNamesPreview = useMemo(() => {
    if (!pendingImport) return { visible: [] as string[], hiddenCount: 0 }
    if (isExcludedNamesExpanded) return { visible: pendingImport.excludedNameReasonLabels, hiddenCount: 0 }
    const visible = pendingImport.excludedNameReasonLabels.slice(0, 3)
    const hiddenCount = Math.max(0, pendingImport.excludedNameReasonLabels.length - visible.length)
    return { visible, hiddenCount }
  }, [isExcludedNamesExpanded, pendingImport])

  const normalizedExcludedNameGroups = useMemo(
    () => (pendingImport ? buildNormalizedExcludedNameGroups(pendingImport.excludedDetails) : []),
    [pendingImport],
  )

  const normalizedExcludedNameGroupLabel = normalizedExcludedNameGroups
    .map((group) => group.labels.join(' / '))
    .join(', ')

  const normalizedExcludedNameGroupData = normalizedExcludedNameGroups
    .map((group) => `${group.key}=${group.labels.join('/')}`)
    .join('|')

  const importPreviewLiveSummary = useMemo(() => {
    if (!pendingImport || !pendingImportImpact) return ''
    const noChange = pendingImportImpact.added === 0 && pendingImportImpact.removed === 0 && pendingImportImpact.excluded === 0
    if (noChange) return `差分なし。インポート後${pendingImport.items.length}件。`
    const excludedLead = buildExcludedLeadLabel(pendingImport.excludedDetails)
    const parts = [
      `追加${pendingImportImpact.added}件`,
      `削除予定${pendingImportImpact.removed}件`,
      pendingImportImpact.excluded > 0
        ? `正規化除外${pendingImportImpact.excluded}件${excludedLead ? `（例: ${excludedLead}）` : ''}`
        : '',
      `インポート後${pendingImport.items.length}件。`,
    ].filter(Boolean)
    return parts.join(' / ')
  }, [pendingImport, pendingImportImpact])

  const excludedDetailsPreview = useMemo(() => {
    if (!pendingImport) return { visible: [] as Array<ImportExcludedDetail & { label: string }>, hiddenCount: 0 }
    const detailsWithLabels = buildExcludedDetailsWithLabels(pendingImport.excludedDetails)
    if (isExcludedDetailsExpanded) return { visible: detailsWithLabels, hiddenCount: 0 }
    const visible = detailsWithLabels.slice(0, 3)
    const hiddenCount = Math.max(0, detailsWithLabels.length - visible.length)
    return { visible, hiddenCount }
  }, [isExcludedDetailsExpanded, pendingImport])

  const updateDraft = (patch: Partial<Draft>) => setDraft((prev) => ({ ...prev, ...patch }))
  const updateEditingDraft = (patch: Partial<Draft>) => setEditingDraft((prev) => ({ ...prev, ...patch }))

  const updateDraftTag = (tag: string) => {
    const normalizedSelected = normalizeTagKey(selectedTag ?? '')
    const normalizedInput = normalizeTagKey(tag)
    const shouldClearSync = !!normalizedSelected && normalizedSelected !== normalizedInput
    setDraft((prev) => ({ ...prev, tag }))
    if (shouldClearSync) {
      setSelectedTag('')
      setNotice(SYNC_BREAK_NOTICE)
      setError('')
    }
  }

  const selectTag = (tag: string) => {
    setSelectedTag(tag)
    setDraft((prev) => ({ ...prev, tag }))
    setPendingImport(null)
    if (notice === SYNC_BREAK_NOTICE) {
      setNotice('')
    }
  }

  const clearSelectedTag = () => {
    setPendingImport(null)
    setSelectedTag((prevSelected) => {
      setDraft((prevDraft) => ({
        ...prevDraft,
        tag: prevSelected && normalizeTagKey(prevDraft.tag) === normalizeTagKey(prevSelected) ? '' : prevDraft.tag,
      }))
      return ''
    })
  }

  const saveNew = async () => {
    if (!draft.tag.trim() || !draft.name.trim()) {
      setError('タグと店舗名は必須です。')
      setNotice('')
      return
    }
    setIsSaving(true)
    try {
      const data = await api<{ items: FavoriteItem[]; item: FavoriteItem }>('/api/items', {
        method: 'POST',
        body: JSON.stringify(draft),
      })
      setItems(data.items)
      setTags(Array.from(new Set(data.items.map((item) => item.tag))).sort((a, b) => a.localeCompare(b, 'ja')))
      setDraft((prev) => ({ ...prev, name: '', memo: '' }))
      setSelectedTag(data.item.tag)
      setError('')
      setNotice(`${data.item.tag} の${data.item.rank}位に保存しました。`)
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存に失敗しました')
      setNotice('')
    } finally {
      setIsSaving(false)
    }
  }

  const addSamples = async () => {
    setIsSaving(true)
    try {
      const now = new Date().toISOString()
      const sampleFavorites = sampleItems.map((sample, index): FavoriteItem => {
        const item = {
          id: `sample-${index}-${crypto.randomUUID()}`,
          tag: sample.tag.trim(),
          location: sample.location.trim(),
          name: sample.name.trim(),
          rank: sample.rank,
          memo: sample.memo.trim(),
          placeId: '',
          createdAt: now,
          updatedAt: now,
          mapsUrl: '',
        }
        return { ...item, mapsUrl: buildMapsUrl(item) }
      })
      const analyzed = analyzeImportedTop3([...items, ...sampleFavorites])
      const data = await api<{ items: FavoriteItem[] }>('/api/items?mode=replace', {
        method: 'POST',
        body: JSON.stringify({ items: analyzed.items }),
      })
      const latest = data.items
      setItems(latest)
      setTags(Array.from(new Set(latest.map((item) => item.tag))).sort((a, b) => a.localeCompare(b, 'ja')))
      setNotice('サンプルをDBに保存しました。')
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'サンプル保存に失敗しました')
      setNotice('')
    } finally {
      setIsSaving(false)
    }
  }

  const importValidationFieldCounts = importValidationIssue
    ? Array.from(
      importValidationIssue.relatedIssues.reduce<Map<string, number>>((counts, issue) => {
        counts.set(issue.field, (counts.get(issue.field) ?? 0) + 1)
        return counts
      }, new Map()),
      ([field, count]) => ({ field, count }),
    ).sort((left, right) => right.count - left.count)
    : []

  const visibleImportValidationIssues = importValidationIssue
    ? selectedImportValidationField
      ? importValidationIssue.relatedIssues.filter((issue) => issue.field === selectedImportValidationField)
      : importValidationIssue.relatedIssues
    : []

  const importValidationRepairListLimit = 5
  const shouldCollapseImportValidationRepairList = !selectedImportValidationField && !isImportValidationRepairListExpanded
  const displayedImportValidationIssues = shouldCollapseImportValidationRepairList
    ? visibleImportValidationIssues.slice(0, importValidationRepairListLimit)
    : visibleImportValidationIssues
  const hiddenImportValidationIssueCount = Math.max(0, visibleImportValidationIssues.length - displayedImportValidationIssues.length)
  const shouldToggleImportValidationRepairList = !selectedImportValidationField && visibleImportValidationIssues.length > importValidationRepairListLimit

  const selectedImportValidationFieldCount = visibleImportValidationIssues.length

  const importValidationCopyTargetSummary = importValidationIssue
    ? selectedImportValidationField
      ? `${selectedImportValidationField} ${visibleImportValidationIssues.length}件 / 全${importValidationIssue.totalIssues}件`
      : `全${importValidationIssue.totalIssues}件`
    : ''

  const showClipboardFallback = (label: string, text: string) => {
    setClipboardFallback({ label, text })
    setNotice(`${label}をコピーできませんでした。下の手動コピー用テキストを選択してコピーしてください。`)
  }

  const copyImportValidationPaths = async () => {
    if (!importValidationIssue) return
    const paths = [
      `ファイル: ${importValidationIssue.filename}`,
      `対象: ${importValidationCopyTargetSummary}`,
      ...visibleImportValidationIssues.map((issue) => issue.path),
    ].join('\n')
    try {
      await navigator.clipboard.writeText(paths)
      setClipboardFallback(null)
      setNotice('JSONパス一覧をコピーしました。')
    } catch {
      showClipboardFallback('JSONパス一覧', paths)
    }
  }

  const copyImportValidationRepairs = async () => {
    if (!importValidationIssue) return
    const repairs = [
      `ファイル: ${importValidationIssue.filename}`,
      `対象: ${importValidationCopyTargetSummary}`,
      ...visibleImportValidationIssues.map((issue) => `${issue.row} / ${issue.path} / ${issue.field} / 入力値: ${issue.invalidValue} / ${issue.fix}`),
    ].join('\n')
    try {
      await navigator.clipboard.writeText(repairs)
      setClipboardFallback(null)
      setNotice('修正対象一覧をコピーしました。')
    } catch {
      showClipboardFallback('修正対象一覧', repairs)
    }
  }

  const copyImportExcludedNames = async () => {
    if (!pendingImport) return
    const labels = pendingImport.excludedNameReasonLabels.join('\n')
    try {
      await navigator.clipboard.writeText(labels)
      setNotice('正規化除外店舗一覧をコピーしました。')
    } catch {
      setNotice('正規化除外店舗一覧をコピーできませんでした。画面上の店舗名を手動でコピーしてください。')
    }
  }

  const copyImportExcludedNameLabels = async () => {
    if (!pendingImport) return
    const labels = pendingImport.excludedNameLabels.join('\n')
    try {
      await navigator.clipboard.writeText(labels)
      setNotice('正規化除外店舗名だけをコピーしました。')
    } catch {
      setNotice('正規化除外店舗名だけをコピーできませんでした。画面上の店舗名を手動でコピーしてください。')
    }
  }

  const copyImportExcludedNameVariants = async () => {
    if (normalizedExcludedNameGroups.length === 0) return
    const labels = normalizedExcludedNameGroups
      .map((group) => `${group.key}: ${group.labels.join(' / ')}`)
      .join('\n')
    try {
      await navigator.clipboard.writeText(labels)
      setNotice('表記ゆれ候補をコピーしました。')
    } catch {
      setNotice('表記ゆれ候補をコピーできませんでした。画面上の候補を手動でコピーしてください。')
    }
  }

  const exportJson = () => {
    const text = JSON.stringify(items, null, 2)
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    const filename = `top3-favorites-${stamp}.json`
    let url: string | null = null
    let a: HTMLAnchorElement | null = null

    try {
      const blob = new Blob([text], { type: 'application/json' })
      url = URL.createObjectURL(blob)
      a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      setError('')
      setManualExport(null)
      setNotice('JSONをエクスポートしました。')
    } catch {
      setError('')
      setManualExport({ filename, text })
      setNotice('JSONファイルを自動保存できませんでした。下のJSONをコピーして手動で保存してください。')
    } finally {
      if (a?.parentNode) a.parentNode.removeChild(a)
      if (url) URL.revokeObjectURL(url)
    }
  }

  const copyManualExportJson = async () => {
    if (!manualExport) return
    try {
      await navigator.clipboard.writeText(manualExport.text)
      setError('')
      setNotice('手動保存JSONをコピーしました。')
    } catch {
      setError('')
      setNotice('手動保存JSONをコピーできませんでした。選択済みのJSONを手動でコピーしてください。')
      requestAnimationFrame(() => {
        manualExportRef.current?.focus()
        manualExportRef.current?.select()
      })
    }
  }

  const triggerImport = () => {
    clearFeedback()
    setEditingId(null)
    fileRef.current?.click()
  }

  const onImportFile: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    try {
      const text = await readImportFileText(file)
      const parsed = JSON.parse(text) as unknown
      if (!Array.isArray(parsed)) {
        setError('インポート失敗: JSON配列形式ではありません。既存データは保持しました。')
        setNotice('')
        setPendingImport(null)
        return
      }
      const importValidationIssues = parsed
        .map((item, index) => importItemValidationIssue(item, index, file.name))
        .filter((issue): issue is ImportValidationIssue => Boolean(issue))
      const importValidationIssue = importValidationIssues[0]
      if (importValidationIssue) {
        const issueWithCount = {
          ...importValidationIssue,
          totalIssues: importValidationIssues.length,
          relatedIssues: importValidationIssues.map(({ row, path, field, invalidValue, fix }) => ({ row, path, field, invalidValue, fix })),
        }
        setError(`インポート失敗: ${issueWithCount.message}既存データは保持しました。`)
        setImportValidationIssue(issueWithCount)
        setSelectedImportValidationField('')
        setIsImportValidationRepairListExpanded(false)
        setNotice('')
        setPendingImport(null)
        return
      }
      const duplicateImportError = duplicateImportIdError(parsed as FavoriteItem[], file.name)
      if (duplicateImportError) {
        setError(`インポート失敗: ${duplicateImportError}既存データは保持しました。`)
        setImportValidationIssue(null)
        setSelectedImportValidationField('')
        setIsImportValidationRepairListExpanded(false)
        setNotice('')
        setPendingImport(null)
        return
      }

      const normalizedInput = (parsed as FavoriteItem[]).map(normalizeImportItem)
      const analyzed = analyzeImportedTop3(normalizedInput)
      const normalized = analyzed.items
      const normalizedIds = new Set(normalized.map((item) => item.id))
      const excludedNames = normalizedInput
        .filter((item) => !normalizedIds.has(item.id))
        .map((item) => item.name.trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'ja'))
      const excludedNameLabels = buildExcludedNameLabels(analyzed.excludedDetails)
      const excludedNameReasonLabels = buildExcludedNameReasonLabels(analyzed.excludedDetails)
      setPendingImport({
        items: normalized,
        filename: file.name,
        originalCount: normalizedInput.length,
        excludedNames,
        excludedNameLabels,
        excludedNameReasonLabels,
        excludedDetails: analyzed.excludedDetails,
      })
      setImportValidationIssue(null)
      setSelectedImportValidationField('')
      setIsImpactTagsExpanded(false)
      setIsExcludedNamesExpanded(false)
      setIsExcludedDetailsExpanded(false)
      setIsImpactTermsHelperExpanded(false)
      setError('')
      setNotice(`インポート確認: ${normalized.length}件。内容を確認してから反映してください。`)
    } catch (error) {
      if (error instanceof SyntaxError) {
        setError(`インポート失敗: ファイル「${file.name}」のJSON構文を解析できません。既存データは保持しました。`)
      } else {
        setError('インポート失敗: JSONの読み取りに失敗しました。既存データは保持しました。')
      }
      setImportValidationIssue(null)
      setSelectedImportValidationField('')
      setNotice('')
      setPendingImport(null)
    }
  }

  const applyPendingImport = async () => {
    if (!pendingImport) return
    setIsSaving(true)
    try {
      const data = await api<{ items: FavoriteItem[] }>('/api/items?mode=replace', {
        method: 'POST',
        body: JSON.stringify({ items: pendingImport.items }),
      })
      setItems(data.items)
      setTags(Array.from(new Set(data.items.map((item) => item.tag))).sort((a, b) => a.localeCompare(b, 'ja')))
      setSelectedTag('')
      setQuery('')
      setPendingImport(null)
      setError('')
      setNotice(`インポート成功: ${data.items.length}件を反映しました。`)
    } catch (e) {
      setError(e instanceof Error ? `インポート失敗: ${e.message}` : 'インポート失敗: API反映に失敗しました。既存データは保持しました。')
      setNotice('')
    } finally {
      setIsSaving(false)
    }
  }

  const cancelPendingImport = () => {
    setPendingImport(null)
    setError('')
    setNotice('インポートをキャンセルしました。')
    window.requestAnimationFrame(() => tagInputRef.current?.focus())
  }

  const startEdit = (item: FavoriteItem) => {
    setEditingId(item.id)
    setEditingDraft({ tag: item.tag, location: item.location, name: item.name, rank: item.rank, memo: item.memo })
    clearFeedback({ pendingImport: true })
  }

  const cancelEdit = () => {
    setEditingId(null)
    clearFeedback()
  }

  const saveEdit = async () => {
    if (!editingId) return
    if (!editingDraft.tag.trim() || !editingDraft.name.trim()) {
      setError('タグと店舗名は必須です。')
      setNotice('')
      return
    }
    setIsSaving(true)
    try {
      const data = await api<{ items: FavoriteItem[] }>('/api/items', {
        method: 'PUT',
        body: JSON.stringify({ id: editingId, ...editingDraft }),
      })
      setItems(data.items)
      const nextTags = Array.from(new Set(data.items.map((item) => item.tag))).sort((a, b) => a.localeCompare(b, 'ja'))
      setTags(nextTags)
      setSelectedTag((prev) => {
        const next = prev && !nextTags.includes(prev) ? '' : prev
        if (next === '') setDraft((draftPrev) => ({ ...draftPrev, tag: '' }))
        return next
      })
      setEditingId(null)
      setNotice('編集を保存しました。')
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : '編集保存に失敗しました')
      setNotice('')
    } finally {
      setIsSaving(false)
    }
  }

  const removeItem = async (item: FavoriteItem) => {
    const ok = window.confirm(`${item.name} をTop3から削除しますか？`)
    if (!ok) return

    setIsSaving(true)
    try {
      const data = await api<{ items: FavoriteItem[] }>(`/api/items?id=${encodeURIComponent(item.id)}`, { method: 'DELETE' })
      setItems(data.items)
      const nextTags = Array.from(new Set(data.items.map((item) => item.tag))).sort((a, b) => a.localeCompare(b, 'ja'))
      setTags(nextTags)
      setSelectedTag((prev) => {
        const selectedTagStillExists = prev ? data.items.some((nextItem) => nextItem.tag === prev) : true
        const next = prev && !selectedTagStillExists ? '' : prev
        if (next === '') setDraft((draftPrev) => ({ ...draftPrev, tag: '' }))
        return next
      })
      setNotice('削除しました。')
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : '削除に失敗しました')
      setNotice('')
    } finally {
      setIsSaving(false)
    }
  }

  const importLockDescriptionId = pendingImport ? 'import-lock-hint' : undefined
  const listActionLockDescriptionId = pendingImport ? 'import-list-action-lock-hint' : undefined
  const exportButtonDescriptionIds = [
    pendingImport ? 'import-export-lock-hint' : '',
    items.length === 0 ? 'export-empty-hint' : '',
  ].filter(Boolean).join(' ') || undefined

  return (
    <main className="container">
      <header className="hero">
        <p className="eyebrow">偏愛トップ3</p>
        <h1>好きな店を、タグ別Top3で残す</h1>
        <p className="sub">タグを選ぶ → いまの順位を見る → 店舗と場所を入れて保存。</p>
      </header>

      <section className="card input-card">
        <div className="section-head">
          <div>
            <h2>登録する</h2>
            <p className="hint" data-testid="daily-theme">今日のお題: {todayTheme}</p>
            <p className="hint">登録済みタグはポチッと選択。なければ入力すると新規タグになります。</p>
          </div>
          <span data-testid="db-persistence-status" className={isLoading ? 'status loading' : 'status'}>{isLoading ? 'DB読込中' : 'DB保存'}</span>
        </div>

        <TagPicker label="登録タグ選択" tags={tags} activeTag={draft.tag} selectedTag={selectedTag} onSelect={selectTag} onClear={clearSelectedTag} />
        {isImportPreviewActive && <p id="import-lock-hint" className="hint compact" data-testid="import-lock-hint">インポート確認中のため登録フォームは一時ロック中です。</p>}
        {selectedTag && (
          <p className="hint compact" data-testid="tag-sync-status">
            検索タグ「{selectedTag}」と登録タグを連動中
          </p>
        )}

        <div className="form-grid">
          <label>
            <span>タグ</span>
            <input ref={tagInputRef} value={draft.tag} onChange={(e) => updateDraftTag(e.target.value)} placeholder="例: カフェラテ" list="tag-options" disabled={isImportPreviewActive} aria-describedby={importLockDescriptionId} />
            <datalist id="tag-options">{tags.map((tag) => <option key={tag} value={tag} />)}</datalist>
          </label>
          <label>
            <span>場所</span>
            <input value={draft.location} onChange={(e) => updateDraft({ location: e.target.value })} placeholder="例: 松戸 / 柏の葉" disabled={isImportPreviewActive} aria-describedby={importLockDescriptionId} />
          </label>
          <label className="wide">
            <span>店舗名</span>
            <input value={draft.name} onChange={(e) => updateDraft({ name: e.target.value })} placeholder="例: Solito MAGO" disabled={isImportPreviewActive} aria-describedby={importLockDescriptionId} />
          </label>
        </div>

        <div className="rank-picker" aria-label="順位を選択">
          {[1, 2, 3].map((rank) => (
            <button
              key={rank}
              className={draft.rank === rank ? 'rank active' : 'rank'}
              onClick={() => updateDraft({ rank: rank as Rank })}
              aria-label={`登録 ${rank}位に入れる`}
              disabled={isImportPreviewActive}
              aria-describedby={importLockDescriptionId}
            >
              {rank}位に入れる
            </button>
          ))}
        </div>

        <label>
          <span>メモ</span>
          <textarea value={draft.memo} onChange={(e) => updateDraft({ memo: e.target.value })} placeholder="例: ミルク感が強くて、今日飲んだ中で一番うまい" rows={2} disabled={isImportPreviewActive} aria-describedby={importLockDescriptionId} />
        </label>

        <div className="preview-panel">
          <div className="row between no-margin">
            <div>
              <strong>{currentTag || 'タグ未入力'} のTop3プレビュー</strong>
              <p className="hint compact">店舗名を入れると、保存後の順位が見えます。</p>
            </div>
            <button onClick={saveNew} disabled={isSaving || !!pendingImport} aria-describedby={importLockDescriptionId}>{isSaving ? '保存中…' : 'DBに保存'}</button>
          </div>
          <CompactTop3 items={previewTop3} previewName={draft.name} empty="まだ登録なし。ここが1位候補です。" />
        </div>

        <div className="row feedback">
          <button className="ghost" onClick={addSamples} disabled={isSaving || !!pendingImport} aria-describedby={importLockDescriptionId}>サンプルをDB保存</button>
          {loadError && <button className="ghost" onClick={retryLoadItems} disabled={isLoading}>データを再読み込み</button>}
          {error && (
            <div className="error" role="alert" ref={errorAlertRef} tabIndex={-1}>
              <p>{error}</p>
              {importValidationIssue && error.includes(importValidationIssue.message) && (
                <div
                  className="import-validation-error-details"
                  data-testid="import-validation-error-details"
                  aria-label="インポートエラーの修正情報"
                >
                  <dl>
                    <div>
                      <dt>ファイル</dt>
                      <dd>{importValidationIssue.filename}</dd>
                    </div>
                    <div>
                      <dt>行</dt>
                      <dd>{importValidationIssue.row}</dd>
                    </div>
                    <div>
                      <dt>JSONパス</dt>
                      <dd>{importValidationIssue.path}</dd>
                    </div>
                    <div>
                      <dt>フィールド</dt>
                      <dd>{importValidationIssue.field}</dd>
                    </div>
                    <div>
                      <dt>修正</dt>
                      <dd>{importValidationIssue.fix}</dd>
                    </div>
                    <div>
                      <dt>検出件数</dt>
                      <dd>
                        合計{importValidationIssue.totalIssues}件
                        {importValidationIssue.totalIssues > 1 ? `（ほか${importValidationIssue.totalIssues - 1}件も修正してください）` : ''}
                      </dd>
                    </div>
                  </dl>
                  <div className="row no-margin">
                    <button className="ghost" type="button" onClick={triggerImport}>修正したJSONを再選択</button>
                  </div>
                  {importValidationFieldCounts.length > 1 && (
                    <div className="import-validation-field-summary" data-testid="import-validation-field-summary">
                      <p className="hint compact">フィールド別内訳</p>
                      <ul>
                        {importValidationFieldCounts.map(({ field, count }) => (
                          <li key={field}>
                            <button
                              className="ghost compact"
                              type="button"
                              aria-pressed={selectedImportValidationField === field}
                              onClick={() => setSelectedImportValidationField((prev) => (prev === field ? '' : field))}
                            >
                              {field}の修正対象だけ表示
                            </button>
                            <span>{field}: {count}件</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {importValidationIssue.relatedIssues.length > 1 && (
                    <div className="import-validation-error-list">
                      <p className="hint compact">検出した修正対象</p>
                      {selectedImportValidationField && (
                        <div className="row no-margin">
                          <p className="hint compact">表示中: {selectedImportValidationField} の修正対象{selectedImportValidationFieldCount}件</p>
                          <button className="ghost compact" type="button" onClick={() => setSelectedImportValidationField('')}>すべての修正対象を表示</button>
                        </div>
                      )}
                      {!selectedImportValidationField && shouldToggleImportValidationRepairList && (
                        <p className="hint compact">
                          {isImportValidationRepairListExpanded
                            ? `表示中: 全${visibleImportValidationIssues.length}件`
                            : `表示中: 先頭${displayedImportValidationIssues.length}件（ほか${hiddenImportValidationIssueCount}件）`}
                        </p>
                      )}
                      <button className="ghost" type="button" onClick={copyImportValidationPaths}>JSONパス一覧をコピー</button>
                      <button className="ghost" type="button" onClick={copyImportValidationRepairs}>修正対象一覧をコピー</button>
                      <ol>
                        {displayedImportValidationIssues.map((issue) => (
                          <li key={`${issue.row}-${issue.path}-${issue.field}`}>{issue.row} / {issue.path} / {issue.field} / 入力値: {issue.invalidValue} / {issue.fix}</li>
                        ))}
                      </ol>
                      {!selectedImportValidationField && shouldToggleImportValidationRepairList && (
                        <button
                          className="ghost compact"
                          type="button"
                          aria-expanded={isImportValidationRepairListExpanded}
                          onClick={() => setIsImportValidationRepairListExpanded((prev) => !prev)}
                        >
                          {isImportValidationRepairListExpanded ? '修正対象を折りたたむ' : '修正対象を全件表示'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          {notice && <p className="notice" role="status" aria-live="polite">{notice}</p>}
          {clipboardFallback && (
            <label className="clipboard-fallback">
              手動コピー用テキスト
              <textarea
                ref={clipboardFallbackRef}
                readOnly
                rows={Math.min(8, Math.max(3, clipboardFallback.text.split('\n').length))}
                value={clipboardFallback.text}
                aria-describedby="clipboard-fallback-hint"
              />
              <span id="clipboard-fallback-hint" className="hint compact">
                {clipboardFallback.label}を選択済みです。ブラウザのコピー制限が出る場合は、この欄を手動でコピーしてください。
              </span>
            </label>
          )}
          {manualExport && (
            <div className="manual-export-json">
              <label htmlFor="manual-export-json-text">手動保存用JSON</label>
              <textarea
                id="manual-export-json-text"
                ref={manualExportRef}
                readOnly
                rows={Math.min(10, Math.max(4, manualExport.text.split('\n').length))}
                value={manualExport.text}
                aria-describedby="manual-export-json-hint"
              />
              <span id="manual-export-json-hint" className="hint compact">
                推奨ファイル名: {manualExport.filename}。このJSONをコピーして、同名の .json ファイルとして保存してください。
              </span>
              <button type="button" className="ghost" onClick={copyManualExportJson}>手動保存JSONをコピー</button>
            </div>
          )}
        </div>
      </section>

      <section className="card">
        <h2>データ管理</h2>
        <p className="hint">DBデータをJSONでエクスポート/インポートできます。</p>
        <div className="row">
          <button onClick={exportJson} disabled={items.length === 0 || !!pendingImport} aria-describedby={exportButtonDescriptionIds}>JSONエクスポート</button>
          <button className="ghost" onClick={triggerImport}>JSONインポート</button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={onImportFile}
          />
        </div>
        <p className="hint">インポートは全件バリデーション成功時のみ反映。失敗時は既存データ保持（fail-closed）。</p>
        {pendingImport && <p id="import-export-lock-hint" className="hint compact" data-testid="import-export-lock-hint">インポート確認中のため、現在DBのJSONエクスポートは一時停止中です。</p>}
        {items.length === 0 && <p id="export-empty-hint" className="hint compact">エクスポート対象データがありません。まず1件以上保存してください。</p>}
        {pendingImport && (
          <div className="preview-panel" aria-label="インポート確認" data-testid="import-preview-summary" data-summary-json={pendingImportSummary ? JSON.stringify(pendingImportSummary) : ''}>
            <div className="row between no-margin">
              <div>
                <strong>インポート確認</strong>
                <p className="hint compact">{pendingImport.filename}</p>
                <p className="hint compact" data-testid="import-preview-replace-hint">別ファイルを選ぶと現在のプレビューを置き換えます。反映するには「この内容でインポート」を押してください。</p>
                <p className="hint compact" data-testid="import-preview-counts" data-before-count={items.length} data-after-count={pendingImport.items.length}>現在{items.length}件 → インポート後{pendingImport.items.length}件</p>
                <p className="hint compact" data-testid="import-preview-live" aria-live="polite" aria-atomic="true">
                  {importPreviewLiveSummary}
                </p>
                {pendingImport.originalCount !== pendingImport.items.length && (
                  <p
                    className="hint compact"
                    data-testid="import-preview-normalization"
                    data-normalization-before-count={pendingImport.originalCount}
                    data-normalization-after-count={pendingImport.items.length}
                  >
                    同一タグはTop3に正規化: {pendingImport.originalCount}件中{pendingImport.items.length}件を反映予定
                  </p>
                )}
                {pendingImport.excludedNames.length > 0 && (
                  <>
                    <div
                      id="import-preview-excluded-names"
                      className="hint compact import-preview-detail-list"
                      data-testid="import-preview-excluded-names"
                      aria-label="Top3外で正規化除外予定の店舗名プレビュー"
                      data-excluded-name-count={pendingImport.excludedNames.length}
                      data-excluded-name-labels={pendingImport.excludedNameLabels.join('|')}
                      data-excluded-name-reason-labels={pendingImport.excludedNameReasonLabels.join('|')}
                    >
                      <p className="import-preview-detail-heading">正規化除外予定の店舗:</p>
                      <ul>
                        {excludedNamesPreview.visible.map((name) => (
                          <li key={name}>{name}</li>
                        ))}
                      </ul>
                      {excludedNamesPreview.hiddenCount > 0 && (
                        <p className="import-preview-detail-more">ほか{excludedNamesPreview.hiddenCount}件</p>
                      )}
                      <button className="ghost small" type="button" onClick={copyImportExcludedNames}>正規化除外店舗一覧をコピー</button>
                      <button className="ghost small" type="button" onClick={copyImportExcludedNameLabels}>店舗名だけコピー</button>
                    </div>
                    {normalizedExcludedNameGroups.length > 0 && (
                      <>
                        <p
                          className="hint compact"
                          data-testid="import-preview-excluded-name-variants"
                          data-normalized-excluded-name-groups={normalizedExcludedNameGroupData}
                        >
                          表記ゆれ候補: {normalizedExcludedNameGroupLabel}
                        </p>
                        <button className="ghost small" type="button" onClick={copyImportExcludedNameVariants}>表記ゆれ候補をコピー</button>
                      </>
                    )}
                    {pendingImport.excludedNames.length > 3 && (
                      <button
                        className="ghost small"
                        onClick={() => setIsExcludedNamesExpanded((prev) => !prev)}
                        data-testid="import-preview-toggle-excluded-names"
                        aria-controls="import-preview-excluded-names"
                        aria-expanded={isExcludedNamesExpanded}
                        aria-label={`インポート詳細: ${isExcludedNamesExpanded ? '除外店舗名を折りたたむ' : '除外店舗名を全件表示'}`}
                      >
                        {isExcludedNamesExpanded ? '除外店舗名を折りたたむ' : '除外店舗名を全件表示'}
                      </button>
                    )}
                  </>
                )}
                {pendingImport.excludedDetails.length > 0 && (
                  <>
                    <div
                      id="import-preview-excluded-details"
                      className="hint compact import-preview-reason-list"
                      data-testid="import-preview-excluded-details"
                      aria-label="Top3外で正規化除外された理由"
                    >
                      <p className="import-preview-reason-heading">除外理由:</p>
                      <ul>
                        {excludedDetailsPreview.visible.map((detail) => (
                          <li key={`${detail.tag}-${detail.name}-${detail.reason}`}>
                            {detail.label}（{detail.reason}）
                          </li>
                        ))}
                      </ul>
                      {excludedDetailsPreview.hiddenCount > 0 && (
                        <p className="import-preview-reason-more">ほか{excludedDetailsPreview.hiddenCount}件</p>
                      )}
                    </div>
                    {pendingImport.excludedDetails.length > 3 && (
                      <button
                        className="ghost small"
                        onClick={() => setIsExcludedDetailsExpanded((prev) => !prev)}
                        data-testid="import-preview-toggle-excluded-details"
                        aria-controls="import-preview-excluded-details"
                        aria-expanded={isExcludedDetailsExpanded}
                        aria-label={`インポート詳細: ${isExcludedDetailsExpanded ? '除外理由を折りたたむ' : '除外理由を全件表示'}`}
                      >
                        {isExcludedDetailsExpanded ? '除外理由を折りたたむ' : '除外理由を全件表示'}
                      </button>
                    )}
                  </>
                )}
                {pendingImportImpact && (
                  <>
                    <p
                      className="hint compact"
                      data-testid="import-preview-impact-math"
                      data-added-count={pendingImportImpact.added}
                      data-kept-count={pendingImportImpact.kept}
                      data-removed-count={pendingImportImpact.removed}
                      data-excluded-count={pendingImportImpact.excluded}
                    >
                      追加{pendingImportImpact.added}件 / 更新・保持{pendingImportImpact.kept}件 / 削除予定{pendingImportImpact.removed}件
                      {pendingImportImpact.excluded > 0 ? ` / 正規化除外${pendingImportImpact.excluded}件` : ''}
                    </p>
                    <p className="hint compact" data-testid="import-preview-direction-metrics">
                      <span className={`impact-plus${pendingImportImpact.added === 0 ? ' is-zero' : ''}`} data-testid="import-preview-metric-added" aria-label={`追加 ${pendingImportImpact.added}件`}>+{pendingImportImpact.added} 追加</span>
                      {' / '}
                      <span className={`impact-neutral${pendingImportImpact.kept === 0 ? ' is-zero' : ''}`} data-testid="import-preview-metric-kept" aria-label={`保持 ${pendingImportImpact.kept}件`}>±{pendingImportImpact.kept} 保持</span>
                      {' / '}
                      <span className={`impact-minus${pendingImportImpact.removed === 0 ? ' is-zero' : ''}`} data-testid="import-preview-metric-removed" aria-label={`削除予定 ${pendingImportImpact.removed}件`}>-{pendingImportImpact.removed} 削除予定</span>
                    </p>
                    <button
                      className="ghost small"
                      onClick={() => setIsImpactTermsHelperExpanded((prev) => !prev)}
                      data-testid="import-preview-toggle-terms-helper"
                      aria-controls="import-preview-terms-helper"
                      aria-expanded={isImpactTermsHelperExpanded}
                      aria-label={`インポート詳細: ${isImpactTermsHelperExpanded ? '差分用語の詳細説明を隠す' : '差分用語の詳細説明を表示'}`}
                    >
                      {isImpactTermsHelperExpanded ? '差分用語の詳細説明を隠す' : '差分用語の詳細説明を表示'}
                    </button>
                    {isImpactTermsHelperExpanded && (
                      <dl
                        id="import-preview-terms-helper"
                        className="hint compact import-preview-terms-list"
                        data-testid="import-preview-terms-helper"
                        aria-label="差分用語の説明"
                      >
                        <div>
                          <dt>削除予定</dt>
                          <dd>現在DBにあるが、インポート後データに含まれない項目</dd>
                        </div>
                        <div>
                          <dt>正規化除外</dt>
                          <dd>インポートJSON内で同一タグTop3に収まらず取り込まれない項目</dd>
                        </div>
                      </dl>
                    )}
                    {pendingImportImpact.added === 0 && pendingImportImpact.removed === 0 && pendingImportImpact.excluded === 0 && (
                      <p className="hint compact" data-testid="import-preview-no-change">差分なし（このインポートでデータ変更はありません）</p>
                    )}
                    <div
                      id="import-preview-impact-tags"
                      className="hint compact import-preview-detail-list"
                      data-testid="import-preview-impact-tags"
                      data-impact-tag-count={pendingImportImpact.tags.length}
                      data-impact-tags={pendingImportImpact.tags.join('|')}
                      aria-label="インポート影響タグプレビュー"
                    >
                      <p className="import-preview-detail-heading">
                        影響タグ: {pendingImportImpactTagPreview.visible.length ? `${pendingImportImpactTagPreview.visible.length}件` : 'なし'}
                      </p>
                      {pendingImportImpactTagPreview.visible.length > 0 && (
                        <ul aria-label="インポートで影響を受けるタグ">
                          {pendingImportImpactTagPreview.visible.map((tag) => (
                            <li key={tag}>{tag}</li>
                          ))}
                        </ul>
                      )}
                      {pendingImportImpactTagPreview.hiddenCount > 0 && (
                        <p className="import-preview-detail-more">ほか{pendingImportImpactTagPreview.hiddenCount}件</p>
                      )}
                    </div>
                    {pendingImportImpact.tags.length > 5 && (
                      <button
                        className="ghost small"
                        onClick={() => setIsImpactTagsExpanded((prev) => !prev)}
                        data-testid="import-preview-toggle-impact-tags"
                        aria-controls="import-preview-impact-tags"
                        aria-expanded={isImpactTagsExpanded}
                        aria-label={`インポート詳細: ${isImpactTagsExpanded ? '影響タグを折りたたむ' : '影響タグを全件表示'}`}
                      >
                        {isImpactTagsExpanded ? '影響タグを折りたたむ' : '影響タグを全件表示'}
                      </button>
                    )}
                  </>
                )}
              </div>
              <div className="row no-margin">
                <button onClick={applyPendingImport} disabled={isSaving}>{isSaving ? '反映中…' : 'この内容でインポート'}</button>
                <button className="ghost" onClick={cancelPendingImport} disabled={isSaving}>インポートをキャンセル</button>
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="card">
        <div className="section-head">
          <div>
            <h2>探す</h2>
            <p className="hint">タグを選ぶか、店舗名・場所・メモで検索できます。</p>
          </div>
          {selectedTag && <button className="ghost" onClick={clearSelectedTag}>クリア</button>}
        </div>

        <input
          className="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="例: カフェラテ / 柏の葉 / Solito"
          aria-label="Top3検索"
        />
        <TagPicker label="検索タグ選択" tags={tags} activeTag={selectedTag} selectedTag={selectedTag} onSelect={selectTag} onClear={clearSelectedTag} showClearButton={false} />

        {pendingImport && filteredGroups.length > 0 && (
          <p id="import-list-action-lock-hint" className="hint compact" data-testid="import-list-action-lock-hint">
            インポート確認中のため、既存Top3の編集・削除は一時停止中です。
          </p>
        )}
        {filteredGroups.length === 0 ? (
          <p className="hint empty">該当するTop3がありません。</p>
        ) : (
          filteredGroups.map(([tag, list]) => (
            <div className="group" key={tag}>
              <h3>{tag}</h3>
              <ul>
                {list.map((item) => (
                  <li key={item.id} className="item">
                    {editingId === item.id ? (
                      <EditForm draft={editingDraft} tags={tags} onChange={updateEditingDraft} onSave={saveEdit} onCancel={cancelEdit} />
                    ) : (
                      <details>
                        <summary>
                          <span className="summary-title">{item.rank}位: {item.name}</span>
                          {item.location && <span className="summary-meta">{item.location}</span>}
                        </summary>
                        <div className="details-body">
                          <p className="memo">{item.memo || '（メモなし）'}</p>
                          <div className="row no-margin">
                            <a href={buildMapsUrl(item)} target="_blank" rel="noreferrer">Mapsで開く</a>
                            <button className="ghost" onClick={() => startEdit(item)} aria-label={`${item.name}を編集`} disabled={!!pendingImport} aria-describedby={listActionLockDescriptionId}>編集</button>
                            <button className="danger" onClick={() => removeItem(item)} aria-label={`${item.name}を削除`} disabled={!!pendingImport} aria-describedby={listActionLockDescriptionId}>削除</button>
                          </div>
                        </div>
                      </details>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>
    </main>
  )
}

function TagPicker({
  label,
  tags,
  activeTag,
  selectedTag,
  onSelect,
  onClear,
  showClearButton = true,
}: {
  label: string
  tags: string[]
  activeTag: string
  selectedTag: string
  onSelect: (tag: string) => void
  onClear: () => void
  showClearButton?: boolean
}) {
  if (tags.length === 0) return <p className="hint">登録済みタグはまだありません。</p>
  return (
    <div className="tags" aria-label={label}>
      {tags.map((tag) => (
        <button key={tag} className={activeTag === tag || selectedTag === tag ? 'chip active-chip' : 'chip'} onClick={() => onSelect(tag)}>
          #{tag}
        </button>
      ))}
      {showClearButton && selectedTag && <button className="ghost small" onClick={onClear}>クリア</button>}
    </div>
  )
}

function CompactTop3({ items, empty, previewName }: { items: FavoriteItem[]; empty: string; previewName?: string }) {
  if (items.length === 0) return <p className="hint empty">{empty}</p>
  return (
    <ol className="top3-list compact-list">
      {items.map((item) => (
        <li key={item.id} className={previewName && item.name === previewName.trim() ? 'preview-new' : ''}>
          <span className="rank-badge">{item.rank}</span>
          <div>
            <strong>{item.name}</strong>
            {item.location && <p>{item.location}</p>}
          </div>
        </li>
      ))}
    </ol>
  )
}

function EditForm({
  draft,
  tags,
  onChange,
  onSave,
  onCancel,
}: {
  draft: Draft
  tags: string[]
  onChange: (patch: Partial<Draft>) => void
  onSave: () => void
  onCancel: () => void
}) {
  return (
    <div className="edit-form">
      <div className="form-grid">
        <input value={draft.tag} onChange={(e) => onChange({ tag: e.target.value })} placeholder="タグ" list="edit-tag-options" aria-label="編集 タグ" />
        <datalist id="edit-tag-options">{tags.map((tag) => <option key={tag} value={tag} />)}</datalist>
        <input value={draft.location} onChange={(e) => onChange({ location: e.target.value })} placeholder="場所" aria-label="編集 場所" />
        <input value={draft.name} onChange={(e) => onChange({ name: e.target.value })} placeholder="店舗名" aria-label="編集 店舗名" />
      </div>
      <div className="rank-picker compact-picker">
        {[1, 2, 3].map((rank) => (
          <button
            key={rank}
            className={draft.rank === rank ? 'rank active' : 'rank'}
            onClick={() => onChange({ rank: rank as Rank })}
            aria-label={`編集 ${rank}位に変更`}
          >
            {rank}位
          </button>
        ))}
      </div>
      <textarea value={draft.memo} onChange={(e) => onChange({ memo: e.target.value })} rows={2} placeholder="メモ" aria-label="編集 メモ" />
      <div className="row">
        <button onClick={onSave} aria-label="編集を保存">保存</button>
        <button className="ghost" onClick={onCancel} aria-label="編集をキャンセル">キャンセル</button>
      </div>
    </div>
  )
}
