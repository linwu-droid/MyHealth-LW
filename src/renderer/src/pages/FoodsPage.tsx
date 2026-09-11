import type React from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Food, OnlineFoodCandidate } from '../../../shared/types'

type Props = { onToast: (msg: string) => void }
type Tab = 'mine' | 'online'

const blank = {
  name: '',
  brand: '',
  servingLabel: '1 serving',
  kcal: '',
  protein: '',
  carbs: '',
  fat: ''
}

export default function FoodsPage({ onToast }: Props): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('mine')
  const [foods, setFoods] = useState<Food[]>([])
  const [query, setQuery] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(blank)
  const [showForm, setShowForm] = useState(false)

  const [onlineQuery, setOnlineQuery] = useState('')
  const [onlineResults, setOnlineResults] = useState<OnlineFoodCandidate[]>([])
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [searching, setSearching] = useState(false)
  const [importing, setImporting] = useState(false)
  const [packing, setPacking] = useState(false)

  const reload = useCallback(async () => {
    setFoods(await window.api.listFoods(query))
  }, [query])

  useEffect(() => {
    const t = window.setTimeout(() => {
      void reload().catch(() => onToast('Failed to load foods'))
    }, 120)
    return () => window.clearTimeout(t)
  }, [reload, onToast])

  const selectedCount = useMemo(
    () => Object.values(selected).filter(Boolean).length,
    [selected]
  )

  function openCreate(): void {
    setEditingId(null)
    setForm(blank)
    setShowForm(true)
  }

  function openEdit(f: Food): void {
    setEditingId(f.id)
    setForm({
      name: f.name,
      brand: f.brand ?? '',
      servingLabel: f.servingLabel,
      kcal: String(f.kcal),
      protein: String(f.protein),
      carbs: String(f.carbs),
      fat: String(f.fat)
    })
    setShowForm(true)
  }

  async function save(): Promise<void> {
    if (!form.name.trim()) {
      onToast('Name is required')
      return
    }
    const payload = {
      name: form.name.trim(),
      brand: form.brand.trim() || undefined,
      servingLabel: form.servingLabel.trim() || '1 serving',
      kcal: Number(form.kcal) || 0,
      protein: Number(form.protein) || 0,
      carbs: Number(form.carbs) || 0,
      fat: Number(form.fat) || 0
    }
    if (editingId) {
      await window.api.updateFood(editingId, payload)
      onToast('Food updated')
    } else {
      await window.api.createFood(payload)
      onToast('Food added')
    }
    setShowForm(false)
    await reload()
  }

  async function remove(id: string): Promise<void> {
    await window.api.deleteFood(id)
    onToast('Food deleted')
    await reload()
  }

  async function runOnlineSearch(): Promise<void> {
    const q = onlineQuery.trim()
    if (!q) {
      onToast('Enter a search term')
      return
    }
    setSearching(true)
    try {
      const results = await window.api.searchNutrition(q)
      setOnlineResults(results)
      setSelected({})
      if (results.length === 0) onToast('No foods with usable calories found')
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Online search failed')
    } finally {
      setSearching(false)
    }
  }

  function toggleOne(sourceId: string): void {
    setSelected((prev) => ({ ...prev, [sourceId]: !prev[sourceId] }))
  }

  function toggleAll(on: boolean): void {
    if (!on) {
      setSelected({})
      return
    }
    const next: Record<string, boolean> = {}
    for (const r of onlineResults) next[r.sourceId] = true
    setSelected(next)
  }

  function toInput(c: OnlineFoodCandidate): Omit<Food, 'id'> {
    return {
      name: c.name,
      brand: c.brand,
      servingLabel: c.servingLabel,
      kcal: c.kcal,
      protein: c.protein,
      carbs: c.carbs,
      fat: c.fat
    }
  }

  async function importSelected(): Promise<void> {
    const items = onlineResults.filter((r) => selected[r.sourceId]).map(toInput)
    if (items.length === 0) {
      onToast('Select at least one food')
      return
    }
    setImporting(true)
    try {
      const res = await window.api.importFoodsMany(items)
      onToast(`Imported ${res.created} · skipped ${res.skipped} duplicates`)
      await reload()
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  async function importAllResults(): Promise<void> {
    if (onlineResults.length === 0) return
    setImporting(true)
    try {
      const res = await window.api.importFoodsMany(onlineResults.map(toInput))
      onToast(`Imported ${res.created} · skipped ${res.skipped} duplicates`)
      await reload()
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  async function importCommonPack(): Promise<void> {
    setPacking(true)
    try {
      const res = await window.api.importCommonFoodsPack()
      onToast(
        `Common pack: fetched ${res.fetched}, imported ${res.created}, skipped ${res.skipped}`
      )
      await reload()
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Common pack import failed')
    } finally {
      setPacking(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>Foods</h2>
        <div className="segmented" role="tablist" aria-label="Foods views">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'mine'}
            className={tab === 'mine' ? 'active' : ''}
            onClick={() => setTab('mine')}
          >
            My foods
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'online'}
            className={tab === 'online' ? 'active' : ''}
            onClick={() => setTab('online')}
          >
            Import online
          </button>
        </div>
      </div>

      {tab === 'mine' && (
        <>
          <div className="page-header" style={{ marginTop: -8 }}>
            <div className="spacer" />
            <div className="row-actions">
              <input
                className="input"
                style={{ width: 220, marginTop: 0 }}
                placeholder="Search foods…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button type="button" className="btn primary" onClick={openCreate}>
                Add food
              </button>
            </div>
          </div>

          {showForm && (
            <div className="panel">
              <div className="panel-header">
                <h2>{editingId ? 'Edit food' : 'New food'}</h2>
                <div className="spacer" />
                <button type="button" className="btn ghost" onClick={() => setShowForm(false)}>
                  Cancel
                </button>
              </div>
              <div className="form-grid">
                <label>
                  Name
                  <input
                    className="input"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </label>
                <label>
                  Brand (optional)
                  <input
                    className="input"
                    value={form.brand}
                    onChange={(e) => setForm({ ...form, brand: e.target.value })}
                  />
                </label>
                <label>
                  Serving label
                  <input
                    className="input"
                    value={form.servingLabel}
                    onChange={(e) => setForm({ ...form, servingLabel: e.target.value })}
                  />
                </label>
                <label>
                  kcal
                  <input
                    className="input"
                    type="number"
                    value={form.kcal}
                    onChange={(e) => setForm({ ...form, kcal: e.target.value })}
                  />
                </label>
                <label>
                  Protein g
                  <input
                    className="input"
                    type="number"
                    value={form.protein}
                    onChange={(e) => setForm({ ...form, protein: e.target.value })}
                  />
                </label>
                <label>
                  Carbs g
                  <input
                    className="input"
                    type="number"
                    value={form.carbs}
                    onChange={(e) => setForm({ ...form, carbs: e.target.value })}
                  />
                </label>
                <label>
                  Fat g
                  <input
                    className="input"
                    type="number"
                    value={form.fat}
                    onChange={(e) => setForm({ ...form, fat: e.target.value })}
                  />
                </label>
                <div className="full">
                  <button type="button" className="btn primary" onClick={() => void save()}>
                    Save
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="panel">
            <div className="panel-header">
              <h2>Database</h2>
              <span className="muted">{foods.length} foods</span>
            </div>
            {foods.length === 0 ? (
              <div className="empty">
                <h3>No foods found</h3>
                <p>Add a food, import online, or clear the search.</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Brand</th>
                      <th>Serving</th>
                      <th>kcal</th>
                      <th>P</th>
                      <th>C</th>
                      <th>F</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {foods.map((f) => (
                      <tr key={f.id}>
                        <td>{f.name}</td>
                        <td>{f.brand || '—'}</td>
                        <td>{f.servingLabel}</td>
                        <td>{f.kcal}</td>
                        <td>{f.protein}</td>
                        <td>{f.carbs}</td>
                        <td>{f.fat}</td>
                        <td className="row-actions">
                          <button type="button" className="btn compact" onClick={() => openEdit(f)}>
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn danger compact"
                            onClick={() => void remove(f.id)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'online' && (
        <>
          <div className="panel">
            <div className="panel-header">
              <h2>Search Open Food Facts</h2>
              <span className="muted small">Live online · no API key</span>
            </div>
            <div className="row-actions" style={{ marginBottom: 12, width: '100%' }}>
              <input
                className="input"
                style={{ flex: 1, minWidth: 180, marginTop: 0 }}
                placeholder="e.g. greek yogurt, chicken breast…"
                value={onlineQuery}
                onChange={(e) => setOnlineQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void runOnlineSearch()
                }}
              />
              <button
                type="button"
                className="btn primary"
                disabled={searching}
                onClick={() => void runOnlineSearch()}
              >
                {searching ? 'Searching…' : 'Search'}
              </button>
            </div>
            <p className="muted small" style={{ marginTop: 0 }}>
              Prefers per-serving nutrition when available; otherwise uses per 100 g. Products
              without usable calories are skipped.
            </p>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h2>Common foods pack</h2>
              <div className="spacer" />
              <button
                type="button"
                className="btn primary"
                disabled={packing}
                onClick={() => void importCommonPack()}
              >
                {packing ? 'Importing pack…' : 'Import common foods pack'}
              </button>
            </div>
            <p className="muted small" style={{ margin: 0 }}>
              Pulls roughly 200–350 everyday items via many small Open Food Facts searches.
              Duplicates (same name + brand) are skipped. May take a minute.
            </p>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h2>Results</h2>
              <span className="muted">{onlineResults.length} found</span>
              <div className="spacer" />
              <div className="row-actions">
                <button
                  type="button"
                  className="btn compact"
                  disabled={onlineResults.length === 0}
                  onClick={() => toggleAll(selectedCount < onlineResults.length)}
                >
                  {selectedCount < onlineResults.length ? 'Select all' : 'Clear'}
                </button>
                <button
                  type="button"
                  className="btn primary compact"
                  disabled={importing || selectedCount === 0}
                  onClick={() => void importSelected()}
                >
                  Import selected ({selectedCount})
                </button>
                <button
                  type="button"
                  className="btn compact"
                  disabled={importing || onlineResults.length === 0}
                  onClick={() => void importAllResults()}
                >
                  Import all results
                </button>
              </div>
            </div>
            {onlineResults.length === 0 ? (
              <div className="empty">
                <h3>No results yet</h3>
                <p>Search above, or import the common foods pack.</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th style={{ width: 36 }} />
                      <th>Name</th>
                      <th>Brand</th>
                      <th>Serving</th>
                      <th>kcal</th>
                      <th>P</th>
                      <th>C</th>
                      <th>F</th>
                    </tr>
                  </thead>
                  <tbody>
                    {onlineResults.map((r) => (
                      <tr key={r.sourceId} className="clickable" onClick={() => toggleOne(r.sourceId)}>
                        <td onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={!!selected[r.sourceId]}
                            onChange={() => toggleOne(r.sourceId)}
                            aria-label={`Select ${r.name}`}
                          />
                        </td>
                        <td>{r.name}</td>
                        <td>{r.brand || '—'}</td>
                        <td>{r.servingLabel}</td>
                        <td>{r.kcal}</td>
                        <td>{r.protein}</td>
                        <td>{r.carbs}</td>
                        <td>{r.fat}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="muted small" style={{ marginTop: 12, marginBottom: 0 }}>
              Food data from{' '}
              <a href="https://world.openfoodfacts.org" target="_blank" rel="noreferrer">
                Open Food Facts
              </a>{' '}
              — free collaborative database, ODbL.
            </p>
          </div>
        </>
      )}
    </div>
  )
}
