import { useEffect, useMemo, useRef, useState } from 'react'

type FavoriteItem = {
  id: string
  tags: string[]
  rank: 1 | 2 | 3
  name: string
  memo: string
  createdAt: string
}

type Draft = {
  category: string
  area: string
  name: string
  rank: 1 | 2 | 3
  memo: string
}

const STORAGE_KEY = 'top3-favorites-items'

const sampleItems: Omit<FavoriteItem, 'id' | 'createdAt'>[] = [
  { tags: ['カフェラテ', '柏の葉'], rank: 1, name: 'Solito MAGO', memo: 'ラテアートがきれい。ミルク感も好き' },
  { tags: ['カフェラテ', '柏の葉'], rank: 2, name: 'T-SITEのカフェ', memo: '作業ついでに寄りやすい' },
  { tags: ['つけ麺', '松戸'], rank: 1, name: 'とみ田', memo: '濃厚つけ麺が強い' },
]

function normalizeTag(tag: string): string {
  return tag.trim().replace(/^#/, '')
}

function normalizeTags(tags: string[]): string[] {
  return Array.from(new Set(tags.map(normalizeTag).filter(Boolean)))
}

function themeKeyFromTags(tags: string[]): string {
  return normalizeTags(tags)[0] ?? ''
}

function themeLabel(tags: string[]): string {
  return normalizeTags(tags)[0] ?? ''
}

function itemContext(tags: string[]): string {
  return normalizeTags(tags).slice(1).join(' / ')
}

function isValidRank(v: unknown): v is 1 | 2 | 3 {
  return v === 1 || v === 2 || v === 3
}

function toValidItem(v: unknown): FavoriteItem | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>

  const id = typeof o.id === 'string' ? o.id : ''
  const name = typeof o.name === 'string' ? o.name.trim() : ''
  const memo = typeof o.memo === 'string' ? o.memo : ''
  const createdAt = typeof o.createdAt === 'string' ? o.createdAt : new Date().toISOString()
  const rankRaw = typeof o.rank === 'number' ? o.rank : Number(o.rank)
  const tagsRaw = Array.isArray(o.tags) ? o.tags : []
  const tags = normalizeTags(tagsRaw.filter((t): t is string => typeof t === 'string'))

  if (!id || !name || !isValidRank(rankRaw) || tags.length === 0) return null

  return { id, tags, rank: rankRaw, name, memo, createdAt }
}

function loadItems(): FavoriteItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.map((v) => toValidItem(v)).filter((v): v is FavoriteItem => v !== null)
  } catch {
    return []
  }
}

function rebalanceTheme(items: FavoriteItem[], target: FavoriteItem): FavoriteItem[] {
  const targetTheme = themeKeyFromTags(target.tags)
  const sameTheme = items
    .filter((i) => themeKeyFromTags(i.tags) === targetTheme)
    .filter((i) => i.id !== target.id)
    .sort((a, b) => a.rank - b.rank || b.createdAt.localeCompare(a.createdAt))

  const inserted: FavoriteItem[] = []
  let pushed = false
  for (const item of sameTheme) {
    if (!pushed && inserted.length === target.rank - 1) {
      inserted.push(target)
      pushed = true
    }
    inserted.push(item)
  }
  if (!pushed) inserted.push(target)

  const normalized = inserted.slice(0, 3).map((item, idx) => ({
    ...item,
    rank: (idx + 1) as 1 | 2 | 3,
  }))

  const others = items.filter((i) => themeKeyFromTags(i.tags) !== targetTheme)
  return [...others, ...normalized]
}

function buildMapsQuery(item: FavoriteItem): string {
  const q = `${item.name} ${item.tags.join(' ')}`.trim()
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
}

function toDraftItem(draft: Draft, id?: string, createdAt?: string): FavoriteItem {
  return {
    id: id ?? crypto.randomUUID(),
    tags: normalizeTags([draft.category, draft.area]),
    rank: draft.rank,
    name: draft.name.trim(),
    memo: draft.memo.trim(),
    createdAt: createdAt ?? new Date().toISOString(),
  }
}

const initialDraft: Draft = {
  category: 'カフェラテ',
  area: '',
  name: '',
  rank: 1,
  memo: '',
}

export function App() {
  const [items, setItems] = useState<FavoriteItem[]>([])
  const [draft, setDraft] = useState<Draft>(initialDraft)
  const [filterText, setFilterText] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingDraft, setEditingDraft] = useState<Draft>(initialDraft)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const fileRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setItems(loadItems())
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  }, [items])

  const draftTags = useMemo(() => normalizeTags([draft.category, draft.area]), [draft.category, draft.area])
  const draftThemeKey = useMemo(() => themeKeyFromTags(draftTags), [draftTags])

  const currentTop3 = useMemo(() => {
    if (!draftThemeKey) return []
    return items
      .filter((item) => themeKeyFromTags(item.tags) === draftThemeKey)
      .sort((a, b) => a.rank - b.rank || b.createdAt.localeCompare(a.createdAt))
  }, [draftThemeKey, items])

  const previewTop3 = useMemo(() => {
    if (!draft.name.trim() || draftTags.length === 0) return currentTop3
    return rebalanceTheme(items, toDraftItem(draft)).filter((item) => themeKeyFromTags(item.tags) === draftThemeKey)
  }, [currentTop3, draft, draftTags.length, draftThemeKey, items])

  const allTags = useMemo(() => {
    const set = new Set<string>()
    items.forEach((item) => item.tags.forEach((t) => set.add(t)))
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ja'))
  }, [items])

  const grouped = useMemo(() => {
    const q = filterText.trim().toLowerCase()
    const map = new Map<string, FavoriteItem[]>()
    for (const item of items) {
      const hay = `${item.tags.join(' ')} ${item.name} ${item.memo}`.toLowerCase()
      if (q && !hay.includes(q)) continue
      const key = themeKeyFromTags(item.tags)
      const arr = map.get(key) ?? []
      arr.push(item)
      map.set(key, arr)
    }
    return Array.from(map.values())
      .map((list) => [...list].sort((a, b) => a.rank - b.rank || b.createdAt.localeCompare(a.createdAt)))
      .sort((a, b) => themeLabel(a[0].tags).localeCompare(themeLabel(b[0].tags), 'ja'))
  }, [filterText, items])

  const updateDraft = (patch: Partial<Draft>) => setDraft((prev) => ({ ...prev, ...patch }))
  const updateEditingDraft = (patch: Partial<Draft>) => setEditingDraft((prev) => ({ ...prev, ...patch }))

  const addItem = () => {
    if (!draft.category.trim() || !draft.name.trim()) {
      setError('「何のTop3か」と「店舗名」は必須です。')
      setNotice('')
      return
    }
    const next = toDraftItem(draft)
    setItems((prev) => rebalanceTheme(prev, next))
    setDraft((prev) => ({ ...prev, name: '', memo: '' }))
    setError('')
    setNotice(`${themeLabel(next.tags)} の ${next.rank}位に追加しました。`)
  }

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id))
    if (editingId === id) setEditingId(null)
  }

  const startEdit = (item: FavoriteItem) => {
    setEditingId(item.id)
    setEditingDraft({
      category: item.tags[0] ?? '',
      area: item.tags.slice(1).join(' '),
      name: item.name,
      rank: item.rank,
      memo: item.memo,
    })
  }

  const saveEdit = () => {
    if (!editingId) return
    if (!editingDraft.category.trim() || !editingDraft.name.trim()) {
      setError('編集時も「何のTop3か」と「店舗名」は必須です。')
      setNotice('')
      return
    }

    setItems((prev) => {
      const old = prev.find((i) => i.id === editingId)
      if (!old) return prev
      const base = prev.filter((i) => i.id !== editingId)
      return rebalanceTheme(base, toDraftItem(editingDraft, old.id, old.createdAt))
    })
    setEditingId(null)
    setError('')
    setNotice('編集を保存しました。')
  }

  const addSampleData = () => {
    setItems((prev) => {
      let next = [...prev]
      for (const sample of sampleItems) {
        next = rebalanceTheme(next, {
          ...sample,
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
        })
      }
      return next
    })
    setError('')
    setNotice('サンプルデータを投入しました。')
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

  const onImportFile: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as unknown
      if (!Array.isArray(parsed)) throw new Error('not array')
      const validated = parsed.map((v) => toValidItem(v))
      if (validated.some((v) => v === null)) throw new Error('invalid item')
      setItems(validated.filter((v): v is FavoriteItem => v !== null))
      setError('')
      setNotice(`インポート成功: ${validated.length}件を反映しました。`)
    } catch {
      setError('インポート失敗: 既存データは保持しました。')
      setNotice('')
    }
  }

  return (
    <main className="container">
      <header className="hero">
        <p className="eyebrow">Top3 Favorites</p>
        <h1>「これうめぇ」を、その場で順位に入れる</h1>
        <p className="sub">例: カフェラテを選ぶ → 今の1〜3位を見る → 店舗名を入れて順位を決める。</p>
      </header>

      <section className="card input-card">
        <div>
          <h2>いま良かったものを記録</h2>
          <p className="hint">まず「何のTop3か」を決めると、既存順位を見ながら入れられます。</p>
        </div>

        <div className="form-grid">
          <label>
            <span>何のTop3？</span>
            <input
              value={draft.category}
              onChange={(e) => updateDraft({ category: e.target.value })}
              placeholder="例: カフェラテ / つけ麺 / 焼肉ランチ"
            />
          </label>
          <label>
            <span>エリア・補足（任意）</span>
            <input
              value={draft.area}
              onChange={(e) => updateDraft({ area: e.target.value })}
              placeholder="例: 柏の葉 / 松戸 / 東京駅"
            />
          </label>
          <label className="wide">
            <span>店舗名</span>
            <input
              value={draft.name}
              onChange={(e) => updateDraft({ name: e.target.value })}
              placeholder="例: Solito MAGO"
            />
          </label>
        </div>

        <div className="rank-picker" aria-label="順位を選択">
          {[1, 2, 3].map((rank) => (
            <button
              key={rank}
              className={draft.rank === rank ? 'rank active' : 'rank'}
              onClick={() => updateDraft({ rank: rank as 1 | 2 | 3 })}
            >
              {rank}位に入れる
            </button>
          ))}
        </div>

        <label>
          <span>一言メモ（任意）</span>
          <textarea
            value={draft.memo}
            onChange={(e) => updateDraft({ memo: e.target.value })}
            placeholder="例: ミルク感が強くて、今日飲んだ中で一番うまい"
            rows={3}
          />
        </label>

        <div className="preview-panel">
          <div className="row between no-margin">
            <div>
              <strong>{draftTags.length ? themeLabel(draftTags) : 'テーマ未入力'} の現在Top3</strong>
              <p className="hint compact">エリア違いも含めて、同じテーマの1〜3位を見ながら入れられます。</p>
            </div>
            <button onClick={addItem}>この順位で追加</button>
          </div>
          <Top3List items={previewTop3} empty="まだ登録なし。ここが1位候補です。" highlightName={draft.name} />
        </div>

        <div className="row">
          <button className="ghost" onClick={addSampleData}>サンプル投入</button>
          {error && <p className="error">{error}</p>}
          {notice && <p className="notice">{notice}</p>}
        </div>
      </section>

      <section className="card">
        <div className="row between no-margin">
          <h2>登録済みTop3</h2>
          <input
            className="search"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="カフェラテ、店舗名、メモで検索"
          />
        </div>
        <div className="tags">
          {allTags.map((tag) => (
            <button key={tag} className="chip" onClick={() => setFilterText(tag)}>#{tag}</button>
          ))}
          {filterText && <button className="ghost" onClick={() => setFilterText('')}>クリア</button>}
        </div>

        {grouped.length === 0 ? (
          <p className="hint">まだデータがありません。まずは「カフェラテ」などで1件入れてみてください。</p>
        ) : (
          grouped.map((list) => (
            <div className="group" key={themeKeyFromTags(list[0].tags)}>
              <h3>{themeLabel(list[0].tags)}</h3>
              <ul>
                {list.map((item) => (
                  <li key={item.id} className="item">
                    {editingId === item.id ? (
                      <EditForm
                        draft={editingDraft}
                        onChange={updateEditingDraft}
                        onSave={saveEdit}
                        onCancel={() => setEditingId(null)}
                      />
                    ) : (
                      <>
                        <div className="row between no-margin">
                          <strong>{item.rank}位: {item.name}</strong>
                          <div className="row no-margin">
                            <a href={buildMapsQuery(item)} target="_blank" rel="noreferrer">Maps</a>
                            <button className="ghost" onClick={() => startEdit(item)}>編集</button>
                            <button className="danger" onClick={() => removeItem(item.id)}>削除</button>
                          </div>
                        </div>
                        {itemContext(item.tags) && <p className="hint">補足: {itemContext(item.tags)}</p>}
                        {item.memo && <p className="memo">{item.memo}</p>}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>

      <section className="card utility-card">
        <h2>データ管理</h2>
        <p className="hint">端末内保存です。必要な時だけJSONで退避できます。</p>
        <div className="row">
          <button onClick={exportJson}>JSONエクスポート</button>
          <button className="ghost" onClick={() => fileRef.current?.click()}>JSONインポート</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onImportFile} />
        </div>
      </section>
    </main>
  )
}

function Top3List({ items, empty, highlightName }: { items: FavoriteItem[]; empty: string; highlightName?: string }) {
  if (items.length === 0) return <p className="hint empty">{empty}</p>
  return (
    <ol className="top3-list">
      {items.map((item) => (
        <li key={item.id} className={highlightName && item.name === highlightName.trim() ? 'preview-new' : ''}>
          <span className="rank-badge">{item.rank}</span>
          <div>
            <strong>{item.name}</strong>
            {itemContext(item.tags) && <p>{itemContext(item.tags)}</p>}
            {item.memo && <p>{item.memo}</p>}
          </div>
        </li>
      ))}
    </ol>
  )
}

function EditForm({
  draft,
  onChange,
  onSave,
  onCancel,
}: {
  draft: Draft
  onChange: (patch: Partial<Draft>) => void
  onSave: () => void
  onCancel: () => void
}) {
  return (
    <div className="edit-form">
      <div className="form-grid">
        <input value={draft.category} onChange={(e) => onChange({ category: e.target.value })} placeholder="何のTop3？" />
        <input value={draft.area} onChange={(e) => onChange({ area: e.target.value })} placeholder="エリア・補足" />
        <input value={draft.name} onChange={(e) => onChange({ name: e.target.value })} placeholder="店舗名" />
      </div>
      <div className="rank-picker compact-picker">
        {[1, 2, 3].map((rank) => (
          <button key={rank} className={draft.rank === rank ? 'rank active' : 'rank'} onClick={() => onChange({ rank: rank as 1 | 2 | 3 })}>
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
