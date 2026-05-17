import { useEffect, useMemo, useState } from 'react'

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

function rankItems(items: FavoriteItem[], target?: FavoriteItem): FavoriteItem[] {
  const source = target ? [...items.filter((item) => item.id !== target.id), target] : items
  return source
    .sort((a, b) => a.rank - b.rank || b.updatedAt.localeCompare(a.updatedAt))
    .reduce<FavoriteItem[]>((acc, item) => {
      if (target && item.id === target.id) {
        acc.splice(target.rank - 1, 0, item)
      } else {
        acc.push(item)
      }
      return acc
    }, [])
    .slice(0, 3)
    .map((item, index) => ({ ...item, rank: (index + 1) as Rank }))
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

  const loadItems = async () => {
    setIsLoading(true)
    try {
      const data = await api<{ items: FavoriteItem[]; tags: string[] }>('/api/items')
      setItems(data.items)
      setTags(data.tags)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'データ取得に失敗しました')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadItems()
  }, [])

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

  const updateDraft = (patch: Partial<Draft>) => setDraft((prev) => ({ ...prev, ...patch }))
  const updateEditingDraft = (patch: Partial<Draft>) => setEditingDraft((prev) => ({ ...prev, ...patch }))

  const selectTag = (tag: string) => {
    setSelectedTag(tag)
    setDraft((prev) => ({ ...prev, tag }))
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
    } finally {
      setIsSaving(false)
    }
  }

  const addSamples = async () => {
    setIsSaving(true)
    try {
      let latest: FavoriteItem[] = items
      for (const sample of sampleItems) {
        const data = await api<{ items: FavoriteItem[] }>('/api/items', { method: 'POST', body: JSON.stringify(sample) })
        latest = data.items
      }
      setItems(latest)
      setTags(Array.from(new Set(latest.map((item) => item.tag))).sort((a, b) => a.localeCompare(b, 'ja')))
      setNotice('サンプルをDBに保存しました。')
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'サンプル保存に失敗しました')
    } finally {
      setIsSaving(false)
    }
  }

  const startEdit = (item: FavoriteItem) => {
    setEditingId(item.id)
    setEditingDraft({ tag: item.tag, location: item.location, name: item.name, rank: item.rank, memo: item.memo })
  }

  const saveEdit = async () => {
    if (!editingId) return
    setIsSaving(true)
    try {
      const data = await api<{ items: FavoriteItem[] }>('/api/items', {
        method: 'PUT',
        body: JSON.stringify({ id: editingId, ...editingDraft }),
      })
      setItems(data.items)
      setTags(Array.from(new Set(data.items.map((item) => item.tag))).sort((a, b) => a.localeCompare(b, 'ja')))
      setEditingId(null)
      setNotice('編集を保存しました。')
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : '編集保存に失敗しました')
    } finally {
      setIsSaving(false)
    }
  }

  const removeItem = async (id: string) => {
    setIsSaving(true)
    try {
      const data = await api<{ items: FavoriteItem[] }>(`/api/items?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      setItems(data.items)
      setTags(Array.from(new Set(data.items.map((item) => item.tag))).sort((a, b) => a.localeCompare(b, 'ja')))
      setNotice('削除しました。')
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : '削除に失敗しました')
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

        <TagPicker tags={tags} activeTag={draft.tag} selectedTag={selectedTag} onSelect={selectTag} onClear={() => setSelectedTag('')} />

        <div className="form-grid">
          <label>
            <span>タグ</span>
            <input value={draft.tag} onChange={(e) => updateDraft({ tag: e.target.value })} placeholder="例: カフェラテ" list="tag-options" />
            <datalist id="tag-options">{tags.map((tag) => <option key={tag} value={tag} />)}</datalist>
          </label>
          <label>
            <span>場所</span>
            <input value={draft.location} onChange={(e) => updateDraft({ location: e.target.value })} placeholder="例: 松戸 / 柏の葉" />
          </label>
          <label className="wide">
            <span>店舗名</span>
            <input value={draft.name} onChange={(e) => updateDraft({ name: e.target.value })} placeholder="例: Solito MAGO" />
          </label>
        </div>

        <div className="rank-picker" aria-label="順位を選択">
          {[1, 2, 3].map((rank) => (
            <button key={rank} className={draft.rank === rank ? 'rank active' : 'rank'} onClick={() => updateDraft({ rank: rank as Rank })}>
              {rank}位に入れる
            </button>
          ))}
        </div>

        <label>
          <span>メモ</span>
          <textarea value={draft.memo} onChange={(e) => updateDraft({ memo: e.target.value })} placeholder="例: ミルク感が強くて、今日飲んだ中で一番うまい" rows={2} />
        </label>

        <div className="preview-panel">
          <div className="row between no-margin">
            <div>
              <strong>{currentTag || 'タグ未入力'} のTop3プレビュー</strong>
              <p className="hint compact">店舗名を入れると、保存後の順位が見えます。</p>
            </div>
            <button onClick={saveNew} disabled={isSaving}>{isSaving ? '保存中…' : 'DBに保存'}</button>
          </div>
          <CompactTop3 items={previewTop3} previewName={draft.name} empty="まだ登録なし。ここが1位候補です。" />
        </div>

        <div className="row feedback">
          <button className="ghost" onClick={addSamples} disabled={isSaving}>サンプルをDB保存</button>
          {error && <p className="error">{error}</p>}
          {notice && <p className="notice">{notice}</p>}
        </div>
      </section>

      <section className="card">
        <div className="section-head">
          <div>
            <h2>探す</h2>
            <p className="hint">タグを選ぶか、店舗名・場所・メモで検索できます。</p>
          </div>
          {selectedTag && <button className="ghost" onClick={() => setSelectedTag('')}>タグ解除</button>}
        </div>

        <input className="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="例: カフェラテ / 柏の葉 / Solito" />
        <TagPicker tags={tags} activeTag={selectedTag} selectedTag={selectedTag} onSelect={setSelectedTag} onClear={() => setSelectedTag('')} />

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
                      <EditForm draft={editingDraft} tags={tags} onChange={updateEditingDraft} onSave={saveEdit} onCancel={() => setEditingId(null)} />
                    ) : (
                      <details>
                        <summary>
                          <span className="summary-title">{item.rank}位: {item.name}</span>
                          {item.location && <span className="summary-meta">{item.location}</span>}
                        </summary>
                        <div className="details-body">
                          {item.memo && <p className="memo">{item.memo}</p>}
                          <div className="row no-margin">
                            <a href={item.mapsUrl || buildMapsUrl(item)} target="_blank" rel="noreferrer">Mapsで開く</a>
                            <button className="ghost" onClick={() => startEdit(item)}>編集</button>
                            <button className="danger" onClick={() => removeItem(item.id)}>削除</button>
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
  tags,
  activeTag,
  selectedTag,
  onSelect,
  onClear,
}: {
  tags: string[]
  activeTag: string
  selectedTag: string
  onSelect: (tag: string) => void
  onClear: () => void
}) {
  if (tags.length === 0) return <p className="hint">登録済みタグはまだありません。</p>
  return (
    <div className="tags" aria-label="タグ選択">
      {tags.map((tag) => (
        <button key={tag} className={activeTag === tag || selectedTag === tag ? 'chip active-chip' : 'chip'} onClick={() => onSelect(tag)}>
          #{tag}
        </button>
      ))}
      {selectedTag && <button className="ghost small" onClick={onClear}>すべて</button>}
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
        <input value={draft.tag} onChange={(e) => onChange({ tag: e.target.value })} placeholder="タグ" list="edit-tag-options" />
        <datalist id="edit-tag-options">{tags.map((tag) => <option key={tag} value={tag} />)}</datalist>
        <input value={draft.location} onChange={(e) => onChange({ location: e.target.value })} placeholder="場所" />
        <input value={draft.name} onChange={(e) => onChange({ name: e.target.value })} placeholder="店舗名" />
      </div>
      <div className="rank-picker compact-picker">
        {[1, 2, 3].map((rank) => (
          <button key={rank} className={draft.rank === rank ? 'rank active' : 'rank'} onClick={() => onChange({ rank: rank as Rank })}>
            {rank}位
          </button>
        ))}
      </div>
      <textarea value={draft.memo} onChange={(e) => onChange({ memo: e.target.value })} rows={2} placeholder="メモ" />
      <div className="row">
        <button onClick={onSave}>保存</button>
        <button className="ghost" onClick={onCancel}>キャンセル</button>
      </div>
    </div>
  )
}
