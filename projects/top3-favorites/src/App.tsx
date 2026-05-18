import { useEffect, useMemo, useRef, useState } from 'react'

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

function normalizeTagForSync(value: string): string {
  return value
    .replace(/\u3000/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

type PendingImport = {
  items: FavoriteItem[]
  filename: string
  originalCount: number
  excludedNames: string[]
  excludedNameLabels: string[]
  excludedDetails: ImportExcludedDetail[]
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
  return tag.trim()
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

function importItemValidationError(value: unknown, index: number, filename: string): string | null {
  const row = `${index + 1}件目`
  const prefix = `ファイル「${filename}」の${row}`
  const detail = (field: string, fix: string) => `${prefix} / フィールド: ${field} / 修正: ${fix}`
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
    tag: value.tag.trim(),
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
  return item.tag.trim().toLowerCase()
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

function buildExcludedNameLabels(details: ImportExcludedDetail[]): string[] {
  const nameCounts = new Map<string, number>()
  for (const detail of details) {
    const name = detail.name.trim()
    if (!name) continue
    nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1)
  }

  return details
    .map((detail) => {
      const name = detail.name.trim()
      if (!name) return ''
      return (nameCounts.get(name) ?? 0) > 1 ? `${detail.tag}: ${name}` : name
    })
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'ja'))
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
  const [isImpactTagsExpanded, setIsImpactTagsExpanded] = useState(false)
  const [isExcludedNamesExpanded, setIsExcludedNamesExpanded] = useState(false)
  const [isExcludedDetailsExpanded, setIsExcludedDetailsExpanded] = useState(false)
  const [isImpactTermsHelperExpanded, setIsImpactTermsHelperExpanded] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const clearFeedback = (options?: { pendingImport?: boolean }) => {
    setError('')
    setNotice('')
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
    if (selectedTag && normalizeTagForSync(draft.tag) !== normalizeTagForSync(selectedTag)) setSelectedTag('')
  }, [draft.tag, selectedTag])

  useEffect(() => {
    if (notice !== SYNC_BREAK_NOTICE) return
    const id = window.setTimeout(() => {
      setNotice((prev) => (prev === SYNC_BREAK_NOTICE ? '' : prev))
    }, 3000)
    return () => window.clearTimeout(id)
  }, [notice])

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
    return {
      version: 1,
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
    if (isExcludedNamesExpanded) return { visible: pendingImport.excludedNameLabels, hiddenCount: 0 }
    const visible = pendingImport.excludedNameLabels.slice(0, 3)
    const hiddenCount = Math.max(0, pendingImport.excludedNameLabels.length - visible.length)
    return { visible, hiddenCount }
  }, [isExcludedNamesExpanded, pendingImport])

  const importPreviewLiveSummary = useMemo(() => {
    if (!pendingImport || !pendingImportImpact) return ''
    const noChange = pendingImportImpact.added === 0 && pendingImportImpact.removed === 0 && pendingImportImpact.excluded === 0
    if (noChange) return `差分なし。インポート後${pendingImport.items.length}件。`
    const excludedLead = pendingImport.excludedDetails[0]?.name?.trim() ?? ''
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
    if (!pendingImport) return { visible: [] as PendingImport['excludedDetails'], hiddenCount: 0 }
    if (isExcludedDetailsExpanded) return { visible: pendingImport.excludedDetails, hiddenCount: 0 }
    const visible = pendingImport.excludedDetails.slice(0, 3)
    const hiddenCount = Math.max(0, pendingImport.excludedDetails.length - visible.length)
    return { visible, hiddenCount }
  }, [isExcludedDetailsExpanded, pendingImport])

  const updateDraft = (patch: Partial<Draft>) => setDraft((prev) => ({ ...prev, ...patch }))
  const updateEditingDraft = (patch: Partial<Draft>) => setEditingDraft((prev) => ({ ...prev, ...patch }))

  const updateDraftTag = (tag: string) => {
    const normalizedSelected = normalizeTagForSync(selectedTag ?? '')
    const normalizedInput = normalizeTagForSync(tag)
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
        tag: prevSelected && normalizeTagForSync(prevDraft.tag) === normalizeTagForSync(prevSelected) ? '' : prevDraft.tag,
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

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(items, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    a.href = url
    a.download = `top3-favorites-${stamp}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    setError('')
    setNotice('JSONをエクスポートしました。')
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
      const text = await file.text()
      const parsed = JSON.parse(text) as unknown
      if (!Array.isArray(parsed)) {
        setError('インポート失敗: JSON配列形式ではありません。既存データは保持しました。')
        setNotice('')
        setPendingImport(null)
        return
      }
      const importValidationError = parsed
        .map((item, index) => importItemValidationError(item, index, file.name))
        .find((message): message is string => Boolean(message))
      if (importValidationError) {
        setError(`インポート失敗: ${importValidationError}既存データは保持しました。`)
        setNotice('')
        setPendingImport(null)
        return
      }
      const duplicateImportError = duplicateImportIdError(parsed as FavoriteItem[], file.name)
      if (duplicateImportError) {
        setError(`インポート失敗: ${duplicateImportError}既存データは保持しました。`)
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
      setPendingImport({
        items: normalized,
        filename: file.name,
        originalCount: normalizedInput.length,
        excludedNames,
        excludedNameLabels,
        excludedDetails: analyzed.excludedDetails,
      })
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

  return (
    <main className="container">
      <header className="hero">
        <p className="eyebrow">Top3 Favorites</p>
        <h1>好きな店を、タグ別Top3で残す</h1>
        <p className="sub">タグを選ぶ → いまの順位を見る → 店舗と場所を入れて保存。</p>
      </header>

      <section className="card input-card">
        <div className="section-head">
          <div>
            <h2>登録する</h2>
            <p className="hint">登録済みタグはポチッと選択。なければ入力すると新規タグになります。</p>
          </div>
          <span className={isLoading ? 'status loading' : 'status'}>{isLoading ? 'DB読込中' : 'DB保存'}</span>
        </div>

        <TagPicker label="登録タグ選択" tags={tags} activeTag={draft.tag} selectedTag={selectedTag} onSelect={selectTag} onClear={clearSelectedTag} />
        {isImportPreviewActive && <p className="hint compact" data-testid="import-lock-hint">インポート確認中のため登録フォームは一時ロック中です。</p>}
        {selectedTag && (
          <p className="hint compact" data-testid="tag-sync-status">
            検索タグ「{selectedTag}」と登録タグを連動中
          </p>
        )}

        <div className="form-grid">
          <label>
            <span>タグ</span>
            <input value={draft.tag} onChange={(e) => updateDraftTag(e.target.value)} placeholder="例: カフェラテ" list="tag-options" disabled={isImportPreviewActive} />
            <datalist id="tag-options">{tags.map((tag) => <option key={tag} value={tag} />)}</datalist>
          </label>
          <label>
            <span>場所</span>
            <input value={draft.location} onChange={(e) => updateDraft({ location: e.target.value })} placeholder="例: 松戸 / 柏の葉" disabled={isImportPreviewActive} />
          </label>
          <label className="wide">
            <span>店舗名</span>
            <input value={draft.name} onChange={(e) => updateDraft({ name: e.target.value })} placeholder="例: Solito MAGO" disabled={isImportPreviewActive} />
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
            >
              {rank}位に入れる
            </button>
          ))}
        </div>

        <label>
          <span>メモ</span>
          <textarea value={draft.memo} onChange={(e) => updateDraft({ memo: e.target.value })} placeholder="例: ミルク感が強くて、今日飲んだ中で一番うまい" rows={2} disabled={isImportPreviewActive} />
        </label>

        <div className="preview-panel">
          <div className="row between no-margin">
            <div>
              <strong>{currentTag || 'タグ未入力'} のTop3プレビュー</strong>
              <p className="hint compact">店舗名を入れると、保存後の順位が見えます。</p>
            </div>
            <button onClick={saveNew} disabled={isSaving || !!pendingImport}>{isSaving ? '保存中…' : 'DBに保存'}</button>
          </div>
          <CompactTop3 items={previewTop3} previewName={draft.name} empty="まだ登録なし。ここが1位候補です。" />
        </div>

        <div className="row feedback">
          <button className="ghost" onClick={addSamples} disabled={isSaving || !!pendingImport}>サンプルをDB保存</button>
          {loadError && <button className="ghost" onClick={retryLoadItems} disabled={isLoading}>データを再読み込み</button>}
          {error && <p className="error" role="alert">{error}</p>}
          {notice && <p className="notice" role="status" aria-live="polite">{notice}</p>}
        </div>
      </section>

      <section className="card">
        <h2>データ管理</h2>
        <p className="hint">DBデータをJSONでエクスポート/インポートできます。</p>
        <div className="row">
          <button onClick={exportJson} disabled={items.length === 0 || !!pendingImport}>JSONエクスポート</button>
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
        {pendingImport && <p className="hint compact" data-testid="import-export-lock-hint">インポート確認中のため、現在DBのJSONエクスポートは一時停止中です。</p>}
        {items.length === 0 && <p className="hint compact">エクスポート対象データがありません。まず1件以上保存してください。</p>}
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
                    <p
                      id="import-preview-excluded-names"
                      className="hint compact"
                      data-testid="import-preview-excluded-names"
                      aria-label="Top3外で除外予定の店舗名プレビュー"
                      data-excluded-name-count={pendingImport.excludedNames.length}
                      data-excluded-name-labels={pendingImport.excludedNameLabels.join('|')}
                    >
                      除外予定の店舗: {excludedNamesPreview.visible.join(', ')}
                      {excludedNamesPreview.hiddenCount > 0 ? `（ほか${excludedNamesPreview.hiddenCount}件）` : ''}
                    </p>
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
                    <p id="import-preview-excluded-details" className="hint compact" data-testid="import-preview-excluded-details">
                      除外理由: {excludedDetailsPreview.visible.map((detail) => `・${detail.name}（${detail.reason}）`).join(' / ')}
                      {excludedDetailsPreview.hiddenCount > 0 ? `（ほか${excludedDetailsPreview.hiddenCount}件）` : ''}
                    </p>
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
                      <p id="import-preview-terms-helper" className="hint compact" data-testid="import-preview-terms-helper">
                        削除予定: 現在DBにあるが、インポート後データに含まれない項目 / 正規化除外: インポートJSON内で同一タグTop3に収まらず取り込まれない項目
                      </p>
                    )}
                    {pendingImportImpact.added === 0 && pendingImportImpact.removed === 0 && pendingImportImpact.excluded === 0 && (
                      <p className="hint compact" data-testid="import-preview-no-change">差分なし（このインポートでデータ変更はありません）</p>
                    )}
                    <p
                      id="import-preview-impact-tags"
                      className="hint compact"
                      data-testid="import-preview-impact-tags"
                      data-impact-tag-count={pendingImportImpact.tags.length}
                      data-impact-tags={pendingImportImpact.tags.join('|')}
                    >
                      影響タグ: {pendingImportImpactTagPreview.visible.length ? pendingImportImpactTagPreview.visible.join(', ') : 'なし'}
                      {pendingImportImpactTagPreview.hiddenCount > 0 ? `（ほか${pendingImportImpactTagPreview.hiddenCount}件）` : ''}
                    </p>
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
          <p className="hint compact" data-testid="import-list-action-lock-hint">
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
                            <button className="ghost" onClick={() => startEdit(item)} aria-label={`${item.name}を編集`} disabled={!!pendingImport}>編集</button>
                            <button className="danger" onClick={() => removeItem(item)} aria-label={`${item.name}を削除`} disabled={!!pendingImport}>削除</button>
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
