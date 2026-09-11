import type React from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Food, OnlineFoodCandidate } from '../../../shared/types'

type Props = { onToast: (msg: string) => void }
type Tab = 'mine' | 'online'
type FoodKindFilter = 'all' | 'foods' | 'drinks' | 'homemade'

const DRINK_SERVING_RE = /ml|cup|oz|litre|liter|bottle/i
const DRINK_NAME_RE =
  /coffee|latte|cappuccino|espresso|tea|juice|water|milk|cola|soda|smoothie|beer|wine|drink|mocha|americano|macchiato|kombucha|lemonade|chocolate milk|hot chocolate|flat white|chai/i

function isDrinkFood(f: Food): boolean {
  return DRINK_SERVING_RE.test(f.servingLabel) || DRINK_NAME_RE.test(f.name)
}

const HOMEMADE_NAME_RE =
  /fry|fried|steam|omelette|omelet|stir|homemade|scrambled|boiled egg|poached egg|roast|soup|congee|dumpling|wonton|mapo|pancake|porridge|home fries|mashed potato|toast with butter|stew|grilled cheese|french toast|minced beef|bacon fried|sausage fried/i

function isHomemadeFood(f: Food): boolean {
  return HOMEMADE_NAME_RE.test(f.name)
}

const blank = {
  name: '',
  brand: '',
  servingLabel: '1 serving',
  kcal: '',
  protein: '',
  carbs: '',
  fat: ''
}
const DRINK_SEARCH_CHIPS = [
  'water',
  'black coffee',
  'latte',
  'cappuccino',
  'flat white',
  'espresso',
  'tea',
  'orange juice',
  'apple juice',
  'cola',
  'diet cola',
  'almond milk',
  'oat milk',
  'smoothie',
  'sports drink'
]

export default function FoodsPage({ onToast }: Props): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('mine')
  const [foods, setFoods] = useState<Food[]>([])
  const [query, setQuery] = useState('')
  const [kindFilter, setKindFilter] = useState<FoodKindFilter>('all')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(blank)
  const [showForm, setShowForm] = useState(false)

  const [onlineQuery, setOnlineQuery] = useState('')
  const [onlineResults, setOnlineResults] = useState<OnlineFoodCandidate[]>([])
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [searching, setSearching] = useState(false)
  const [importing, setImporting] = useState(false)
  const [packingKind, setPackingKind] = useState<'foods' | 'drinks' | 'homemade' | null>(null)

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

  const filteredFoods = useMemo(() => {
    if (kindFilter === 'all') return foods
    if (kindFilter === 'drinks') return foods.filter(isDrinkFood)
    if (kindFilter === 'homemade') return foods.filter((f) => isHomemadeFood(f) && !isDrinkFood(f))
    return foods.filter((f) => !isDrinkFood(f) && !isHomemadeFood(f))
  }, [foods, kindFilter])

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
      fat: c.fat,
      minerals: c.minerals
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
    setPackingKind('foods')
    try {
      const res = await window.api.importCommonFoodsPack()
      onToast(
        `Common pack: fetched ${res.fetched}, imported ${res.created}, skipped ${res.skipped}`
      )
      await reload()
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Common pack import failed')
    } finally {
      setPackingKind(null)
    }
  }

  async function importDrinksPack(): Promise<void> {
    setPackingKind('drinks')
    try {
      const res = await window.api.importDrinksPack()
      onToast(
        `Drinks pack: fetched ${res.fetched}, imported ${res.created}, skipped ${res.skipped}`
      )
      await reload()
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Drinks pack import failed')
    } finally {
      setPackingKind(null)
    }
  }

  async function importHomemadeFoodsPack(): Promise<void> {
    setPackingKind('homemade')
    try {
      const res = await window.api.importHomemadeFoodsPack()
      onToast(
        `Homemade pack: fetched ${res.fetched}, imported ${res.created}, skipped ${res.skipped}`
      )
      await reload()
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Homemade pack import failed')
    } finally {
      setPackingKind(null)
    }
  }

  async function searchDrinkChip(term: string): Promise<void> {
    setOnlineQuery(term)
    setSearching(true)
    try {
      const results = await window.api.searchNutrition(term)
      setOnlineResults(results)
      setSelected({})
      if (results.length === 0) onToast('No drinks/foods with usable calories found')
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Online search failed')
    } finally {
      setSearching(false)
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
            <div className="segmented" role="group" aria-label="Foods, drinks, or homemade filter">
              {(
                [
                  ['all', 'All'],
                  ['foods', 'Foods'],
                  ['drinks', 'Drinks'],
                  ['homemade', 'Homemade']
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={kindFilter === id ? 'active' : ''}
                  aria-pressed={kindFilter === id}
                  onClick={() => setKindFilter(id)}
                >
                  {label}
                </button>
              ))}
            </div>
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
              <span className="muted">{filteredFoods.length} of {foods.length}</span>
            </div>
            {filteredFoods.length === 0 ? (
              <div className="empty">
                <h3>No foods found</h3>
                <p>Add a food, import online, clear the search, or switch All / Foods / Drinks / Homemade.</p>
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
                    {filteredFoods.map((f) => (
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
                placeholder="e.g. latte, orange juice, greek yogurt…"
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
            <div className="chip-row" role="group" aria-label="Drink search shortcuts">
              <span className="muted small" style={{ marginRight: 4 }}>
                Drinks:
              </span>
              {DRINK_SEARCH_CHIPS.map((term) => (
                <button
                  key={term}
                  type="button"
                  className={`chip${onlineQuery === term ? ' active' : ''}`}
                  disabled={searching || packingKind !== null}
                  onClick={() => void searchDrinkChip(term)}
                >
                  {term}
                </button>
              ))}
            </div>
            <p className="muted small" style={{ marginTop: 0 }}>
              Prefers per-serving nutrition when available; otherwise uses per 100 g. Products
              without usable calories are skipped. Log drinks from Diary like any food (any meal /
              Snacks works well).
            </p>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h2>Common foods pack</h2>
              <div className="spacer" />
              <button
                type="button"
                className="btn primary"
                disabled={packingKind !== null}
                onClick={() => void importCommonPack()}
              >
                {packingKind === 'foods' ? 'Importing pack…' : 'Import common foods pack'}
              </button>
            </div>
            <p className="muted small" style={{ margin: 0 }}>
              Pulls roughly 200–350 everyday items via many small Open Food Facts searches.
              Duplicates (same name + brand) are skipped. May take a minute.
            </p>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h2>Import drinks pack</h2>
              <div className="spacer" />
              <button
                type="button"
                className="btn primary"
                disabled={packingKind !== null}
                onClick={() => void importDrinksPack()}
              >
                {packingKind === 'drinks' ? 'Importing drinks…' : 'Import drinks pack'}
              </button>
            </div>
            <p className="muted small" style={{ margin: 0 }}>
              One-click set of everyday drinks (water, coffees, teas, juices, soft drinks, milks,
              smoothies, sports drinks, plus a few beers/wines). Starts from a curated nutrition
              seed, then fills in Open Food Facts matches. Duplicates skipped. Use in Diary like
              any food.
            </p>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h2>Import homemade foods pack</h2>
              <div className="spacer" />
              <button
                type="button"
                className="btn primary"
                disabled={packingKind !== null}
                onClick={() => void importHomemadeFoodsPack()}
              >
                {packingKind === 'homemade'
                  ? 'Importing homemade…'
                  : 'Import homemade foods pack'}
              </button>
            </div>
            <p className="muted small" style={{ margin: 0 }}>
              Everyday home-cooked dishes (eggs, fried/steamed fish &amp; meats, stir-fries, rice,
              soups, dumplings, and more). Starts from a curated nutrition seed, then optionally
              enriches from Open Food Facts. Duplicates skipped. Log from Diary like any food.
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
                <p>Search above, use a drink chip, or import a foods/drinks/homemade pack.</p>
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
