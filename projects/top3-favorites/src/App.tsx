import { useEffect, useMemo, useState } from 'react'

type FavoriteItem = {
  id: string
  tags: string[]
  rank: 1 | 2 | 3
  name: string
  memo: string
  createdAt: string
}

type ParsedInput = {
  tags: string[]
  rank: 1 | 2 | 3
  name: string
  memo: string
}

const STORAGE_KEY = 'top3-favorites-items'
const EXAMPLE = '松戸 ラーメン つけ麺 / 1位 / とみ田 / 濃厚つけ麺が好き'

function normalizeTag(tag: string): string {
  return tag.trim().replace(/^#/, '')
}

function parseRank(raw: string): 1 | 2 | 3 {
  const m = raw.match(/[1-3]/)
  if (m) return Number(m[0]) as 1 | 2 | 3
  return 1
}

function parseQuickInput(input: string): ParsedInput | null {
  const parts = input
    .split('/')
    .map((p) => p.trim())
    .filter(Boolean)

  if (parts.length < 3) return null

  const tags = parts[0]
    .split(/\s+/)
    .map(normalizeTag)
    .filter(Boolean)

  const rank = parseRank(parts[1])
  const name = parts[2]?.trim() ?? ''
  const memo = (parts[3] ?? '').trim()

  if (!tags.length || !name) return null

  return { tags, rank, name, memo }
}

function buildMapsQuery(item: FavoriteItem): string {
  const q = `${item.name} ${item.tags.join(' ')}`.trim()
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
}

function loadItems(): FavoriteItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as FavoriteItem[]
    if (!Array.isArray(parsed)) return []
    return parsed
  } catch {
    return []
  }
}

export function App() {
  const [items, setItems] = useState<FavoriteItem[]>([])
  const [quickInput, setQuickInput] = useState('')
  const [filterText, setFilterText] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingInput, setEditingInput] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    setItems(loadItems())
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  }, [items])

  const allTags = useMemo(() => {
    const set = new Set<string>()
    items.forEach((item) => item.tags.forEach((t) => set.add(t)))
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ja'))
  }, [items])

  const filtered = useMemo(() => {
    const q = filterText.trim().toLowerCase()
    if (!q) return items
    return items.filter((item) => {
      const hay = `${item.tags.join(' ')} ${item.name} ${item.memo}`.toLowerCase()
      return hay.includes(q)
    })
  }, [items, filterText])

  const grouped = useMemo(() => {
    const map = new Map<string, FavoriteItem[]>()
    for (const item of filtered) {
      const key = item.tags.join(' / ')
      const arr = map.get(key) ?? []
      arr.push(item)
      map.set(key, arr)
    }
    return Array.from(map.entries())
      .map(([theme, list]) => [
        theme,
        [...list].sort((a, b) => a.rank - b.rank || b.createdAt.localeCompare(a.createdAt)),
      ] as const)
      .sort((a, b) => a[0].localeCompare(b[0], 'ja'))
  }, [filtered])

  const addItem = () => {
    const parsed = parseQuickInput(quickInput)
    if (!parsed) {
      setError('入力形式が不正です。例: ' + EXAMPLE)
      return
    }
    setError('')
    const next: FavoriteItem = {
      id: crypto.randomUUID(),
      tags: parsed.tags,
      rank: parsed.rank,
      name: parsed.name,
      memo: parsed.memo,
      createdAt: new Date().toISOString(),
    }
    setItems((prev) => [next, ...prev])
    setQuickInput('')
  }

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id))
    if (editingId === id) {
      setEditingId(null)
      setEditingInput('')
    }
  }

  const startEdit = (item: FavoriteItem) => {
    setEditingId(item.id)
    setEditingInput(`${item.tags.join(' ')} / ${item.rank}位 / ${item.name} / ${item.memo}`)
  }

  const saveEdit = () => {
    if (!editingId) return
    const parsed = parseQuickInput(editingInput)
    if (!parsed) {
      setError('編集入力形式が不正です。例: ' + EXAMPLE)
      return
    }
    setError('')
    setItems((prev) =>
      prev.map((item) =>
        item.id === editingId
          ? { ...item, tags: parsed.tags, rank: parsed.rank, name: parsed.name, memo: parsed.memo }
          : item,
      ),
    )
    setEditingId(null)
    setEditingInput('')
  }

  return (
    <main className="container">
      <h1>Top3 Favorites</h1>
      <p className="sub">好きなものを自然文でサッと記録するMVP</p>

      <section className="card">
        <h2>かんたん入力</h2>
        <p className="hint">形式: タグ群 / 順位 / 名前 / メモ（メモは省略可）</p>
        <p className="example">例: {EXAMPLE}</p>
        <textarea
          value={quickInput}
          onChange={(e) => setQuickInput(e.target.value)}
          placeholder={EXAMPLE}
          rows={3}
        />
        <div className="row">
          <button onClick={addItem}>追加</button>
        </div>
        {error && <p className="error">{error}</p>}
      </section>

      <section className="card">
        <h2>検索・絞り込み</h2>
        <input
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder="タグ・店名・メモで検索"
        />
        <div className="tags">
          {allTags.map((tag) => (
            <button key={tag} className="chip" onClick={() => setFilterText(tag)}>
              #{tag}
            </button>
          ))}
          {filterText && (
            <button className="ghost" onClick={() => setFilterText('')}>
              クリア
            </button>
          )}
        </div>
      </section>

      <section className="card">
        <h2>一覧（テーマごとTop3）</h2>
        {grouped.length === 0 ? (
          <p className="hint">まだデータがありません。</p>
        ) : (
          grouped.map(([theme, list]) => (
            <div className="group" key={theme}>
              <h3>{theme}</h3>
              <ul>
                {list.map((item) => (
                  <li key={item.id} className="item">
                    {editingId === item.id ? (
                      <>
                        <textarea
                          rows={2}
                          value={editingInput}
                          onChange={(e) => setEditingInput(e.target.value)}
                        />
                        <div className="row">
                          <button onClick={saveEdit}>保存</button>
                          <button className="ghost" onClick={() => setEditingId(null)}>
                            キャンセル
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="row between">
                          <strong>{item.rank}位: {item.name}</strong>
                          <div className="row">
                            <a href={buildMapsQuery(item)} target="_blank" rel="noreferrer">
                              Maps
                            </a>
                            <button className="ghost" onClick={() => startEdit(item)}>編集</button>
                            <button className="danger" onClick={() => removeItem(item.id)}>削除</button>
                          </div>
                        </div>
                        <p className="memo">{item.memo || '（メモなし）'}</p>
                        <p className="hint">タグ: {item.tags.map((t) => `#${t}`).join(' ')}</p>
                      </>
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
