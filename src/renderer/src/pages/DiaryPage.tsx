import React, { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import type { DiaryEntry, Food, MealType } from '../../../shared/types'
import { scaleMinerals } from '../../../shared/minerals'
import { todayIso } from '../lib/format'
import NutritionDetail from '../lib/NutritionDetail'

type Props = { onToast: (msg: string) => void }

const MEALS: { id: MealType; label: string }[] = [
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'lunch', label: 'Lunch' },
  { id: 'dinner', label: 'Dinner' },
  { id: 'snacks', label: 'Snacks' }
]

function sum(entries: DiaryEntry[]): { kcal: number; protein: number; carbs: number; fat: number } {
  return entries.reduce(
    (a, e) => ({
      kcal: a.kcal + e.kcal,
      protein: a.protein + e.protein,
      carbs: a.carbs + e.carbs,
      fat: a.fat + e.fat
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  )
}

export default function DiaryPage({ onToast }: Props): React.JSX.Element {
  const [date, setDate] = useState(todayIso())
  const [entries, setEntries] = useState<DiaryEntry[]>([])
  const [exerciseKcal, setExerciseKcal] = useState(0)
  const [calorieGoal, setCalorieGoal] = useState(2000)
  const [showAdd, setShowAdd] = useState(false)
  const [meal, setMeal] = useState<MealType>('breakfast')
  const [query, setQuery] = useState('')
  const [foods, setFoods] = useState<Food[]>([])
  const [allFoods, setAllFoods] = useState<Food[]>([])
  const [foodsLoading, setFoodsLoading] = useState(false)
  const [selectedFoodId, setSelectedFoodId] = useState('')
  const [qty, setQty] = useState('1')
  const [custom, setCustom] = useState({
    name: '',
    kcal: '',
    protein: '',
    carbs: '',
    fat: ''
  })
  const [mode, setMode] = useState<'db' | 'custom'>('db')
  const [detailId, setDetailId] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const [list, dash, settings] = await Promise.all([
      window.api.listDiary(date),
      window.api.getDashboard(date),
      window.api.getSettings()
    ])
    setEntries(list)
    setExerciseKcal(dash.exerciseKcal)
    setCalorieGoal(settings.calorieGoal)
  }, [date])

  useEffect(() => {
    void reload().catch(() => onToast('Failed to load diary'))
  }, [reload, onToast])

  useEffect(() => {
    void window.api
      .listFoods('')
      .then(setAllFoods)
      .catch(() => {
        /* non-fatal for detail lookup */
      })
  }, [entries.length])

  // Always load the full food DB when opening Add (empty query), then filter as user types.
  useEffect(() => {
    if (!showAdd || mode !== 'db') return
    let cancelled = false
    setFoodsLoading(true)
    const t = window.setTimeout(() => {
      void window.api
        .listFoods(query.trim() ? query : '')
        .then((list) => {
          if (!cancelled) setFoods(list)
        })
        .catch(() => {
          if (!cancelled) onToast('Failed to load foods for diary')
        })
        .finally(() => {
          if (!cancelled) setFoodsLoading(false)
        })
    }, query.trim() ? 150 : 0)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [query, showAdd, mode, onToast])

  const dayTotals = useMemo(() => sum(entries), [entries])
  const remaining = calorieGoal - dayTotals.kcal + exerciseKcal

  const foodById = useMemo(() => {
    const m = new Map<string, Food>()
    for (const f of allFoods) m.set(f.id, f)
    for (const f of foods) m.set(f.id, f)
    return m
  }, [allFoods, foods])

  function openAdd(forMeal?: MealType): void {
    if (forMeal) setMeal(forMeal)
    setMode('db')
    setQuery('')
    setSelectedFoodId('')
    setQty('1')
    setShowAdd(true)
    // Kick an immediate full-list load
    void window.api
      .listFoods('')
      .then(setFoods)
      .catch(() => onToast('Failed to load foods for diary'))
  }

  async function addFromFood(): Promise<void> {
    const food = foods.find((f) => f.id === selectedFoodId)
    if (!food) {
      onToast('Pick a food from the list')
      return
    }
    const q = Number(qty) || 1
    await window.api.addDiary({
      date,
      meal,
      foodId: food.id,
      name: food.brand ? `${food.name} (${food.brand})` : food.name,
      servingQty: q,
      kcal: food.kcal * q,
      protein: food.protein * q,
      carbs: food.carbs * q,
      fat: food.fat * q,
      minerals: scaleMinerals(food.minerals, q)
    })
    onToast('Added to diary')
    setShowAdd(false)
    setSelectedFoodId('')
    setQty('1')
    await reload()
  }

  async function addCustom(): Promise<void> {
    if (!custom.name.trim()) {
      onToast('Name is required')
      return
    }
    const q = Number(qty) || 1
    const name = custom.name.trim()
    const kcalEach = Number(custom.kcal) || 0
    const proteinEach = Number(custom.protein) || 0
    const carbsEach = Number(custom.carbs) || 0
    const fatEach = Number(custom.fat) || 0

    // Share into Foods DB unless a same name (no brand) already exists.
    let foodId: string | undefined
    try {
      const existing = await window.api.listFoods(name)
      const dup = existing.find(
        (f) => f.name.toLowerCase() === name.toLowerCase() && !(f.brand ?? '').trim()
      )
      if (dup) {
        foodId = dup.id
      } else {
        const created = await window.api.createFood({
          name,
          servingLabel: '1 serving',
          kcal: kcalEach,
          protein: proteinEach,
          carbs: carbsEach,
          fat: fatEach
        })
        foodId = created.id
        onToast('Custom food saved to Foods and diary')
      }
    } catch {
      // Still allow diary entry if food create fails
    }

    await window.api.addDiary({
      date,
      meal,
      foodId,
      name,
      servingQty: q,
      kcal: kcalEach * q,
      protein: proteinEach * q,
      carbs: carbsEach * q,
      fat: fatEach * q
    })
    if (!foodId) onToast('Custom food added to diary')
    else if (!custom.name) onToast('Added to diary')
    setShowAdd(false)
    setCustom({ name: '', kcal: '', protein: '', carbs: '', fat: '' })
    await reload()
  }

  async function remove(id: string): Promise<void> {
    await window.api.deleteDiary(id)
    onToast('Entry removed')
    await reload()
  }

  return (
    <div>
      <div className="page-header">
        <h2>Food diary</h2>
        <div className="row-actions">
          <input
            type="date"
            className="input"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <button type="button" className="btn primary" onClick={() => openAdd()}>
            Add food
          </button>
        </div>
      </div>

      <div className="cards tight">
        <div className="card">
          <div className="label">Eaten</div>
          <div className="value">{Math.round(dayTotals.kcal)}</div>
        </div>
        <div className="card">
          <div className="label">Exercise</div>
          <div className="value">−{Math.round(exerciseKcal)}</div>
        </div>
        <div className="card">
          <div className="label">Remaining</div>
          <div className={remaining < 0 ? 'value danger' : 'value'}>
            {Math.round(remaining)}
          </div>
        </div>
        <div className="card">
          <div className="label">Protein / Carbohydrate / Fat</div>
          <div className="value small-value">
            {Math.round(dayTotals.protein)} g · {Math.round(dayTotals.carbs)} g ·{' '}
            {Math.round(dayTotals.fat)} g
          </div>
        </div>
      </div>

      {showAdd && (
        <div className="panel">
          <div className="panel-header">
            <h2>Add food</h2>
            <div className="spacer" />
            <button type="button" className="btn ghost" onClick={() => setShowAdd(false)}>
              Cancel
            </button>
          </div>
          <div className="form-grid">
            <label>
              Meal
              <select
                className="input"
                value={meal}
                onChange={(e) => setMeal(e.target.value as MealType)}
              >
                {MEALS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Servings
              <input
                className="input"
                type="number"
                min="0.1"
                step="0.1"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </label>
            <div className="full row-actions">
              <button
                type="button"
                className={`btn ${mode === 'db' ? 'primary' : ''}`}
                onClick={() => {
                  setMode('db')
                  setQuery('')
                  void window.api.listFoods('').then(setFoods)
                }}
              >
                From foods
              </button>
              <button
                type="button"
                className={`btn ${mode === 'custom' ? 'primary' : ''}`}
                onClick={() => setMode('custom')}
              >
                Quick custom
              </button>
            </div>
          </div>

          {mode === 'db' ? (
            <>
              <label className="block-label">
                Search foods
                <input
                  className="input"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Type to filter… (all foods shown when empty)"
                />
              </label>
              {foodsLoading && foods.length === 0 ? (
                <p className="muted">Loading foods…</p>
              ) : foods.length === 0 ? (
                <div className="empty">
                  <h3>No foods in your database</h3>
                  <p>
                    Open the Foods page and add items, or wait for auto-seeded drinks / homemade /
                    supermarket packs. Then come back to add diary entries.
                  </p>
                </div>
              ) : (
                <div className="table-wrap food-pick">
                  <table className="data">
                    <thead>
                      <tr>
                        <th />
                        <th>Name</th>
                        <th>Serving</th>
                        <th>kcal</th>
                        <th>Protein</th>
                        <th>Carbohydrate</th>
                        <th>Fat</th>
                      </tr>
                    </thead>
                    <tbody>
                      {foods.slice(0, 80).map((f) => (
                        <tr
                          key={f.id}
                          className="clickable"
                          onClick={() => setSelectedFoodId(f.id)}
                        >
                          <td>
                            <input
                              type="radio"
                              checked={selectedFoodId === f.id}
                              onChange={() => setSelectedFoodId(f.id)}
                            />
                          </td>
                          <td>
                            {f.name}
                            {f.brand ? ` · ${f.brand}` : ''}
                          </td>
                          <td>{f.servingLabel}</td>
                          <td>{f.kcal}</td>
                          <td>{f.protein}</td>
                          <td>{f.carbs}</td>
                          <td>{f.fat}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {foods.length > 80 ? (
                    <p className="muted small">Showing first 80 of {foods.length} — refine search.</p>
                  ) : (
                    <p className="muted small">{foods.length} foods available</p>
                  )}
                </div>
              )}
              <button
                type="button"
                className="btn primary"
                disabled={!selectedFoodId}
                onClick={() => void addFromFood()}
              >
                Add selected
              </button>
            </>
          ) : (
            <div className="form-grid">
              <label className="full">
                Name
                <input
                  className="input"
                  value={custom.name}
                  onChange={(e) => setCustom({ ...custom, name: e.target.value })}
                />
              </label>
              <label>
                kcal / serving
                <input
                  className="input"
                  type="number"
                  value={custom.kcal}
                  onChange={(e) => setCustom({ ...custom, kcal: e.target.value })}
                />
              </label>
              <label>
                Protein g
                <input
                  className="input"
                  type="number"
                  value={custom.protein}
                  onChange={(e) => setCustom({ ...custom, protein: e.target.value })}
                />
              </label>
              <label>
                Carbohydrate g
                <input
                  className="input"
                  type="number"
                  value={custom.carbs}
                  onChange={(e) => setCustom({ ...custom, carbs: e.target.value })}
                />
              </label>
              <label>
                Fat g
                <input
                  className="input"
                  type="number"
                  value={custom.fat}
                  onChange={(e) => setCustom({ ...custom, fat: e.target.value })}
                />
              </label>
              <div className="full">
                <p className="muted small" style={{ marginTop: 0 }}>
                  Custom entries are also saved into your Foods database (unless the same name
                  already exists) so you can reuse them later.
                </p>
                <button type="button" className="btn primary" onClick={() => void addCustom()}>
                  Add custom
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {MEALS.map((m) => {
        const mealEntries = entries.filter((e) => e.meal === m.id)
        const totals = sum(mealEntries)
        return (
          <div className="panel" key={m.id}>
            <div className="panel-header">
              <h2>{m.label}</h2>
              <span className="muted">
                {Math.round(totals.kcal)} kcal · Protein {Math.round(totals.protein)} g ·
                Carbohydrate {Math.round(totals.carbs)} g · Fat {Math.round(totals.fat)} g
              </span>
              <div className="spacer" />
              <button type="button" className="btn compact" onClick={() => openAdd(m.id)}>
                + Add
              </button>
            </div>
            {mealEntries.length === 0 ? (
              <p className="muted">No entries</p>
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Food</th>
                      <th>Qty</th>
                      <th>kcal</th>
                      <th>Protein (g)</th>
                      <th>Carbohydrate (g)</th>
                      <th>Fat (g)</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {mealEntries.map((e) => (
                      <Fragment key={e.id}>
                        <tr>
                          <td>{e.name}</td>
                          <td>{e.servingQty}</td>
                          <td>{Math.round(e.kcal)}</td>
                          <td>{Math.round(e.protein)}</td>
                          <td>{Math.round(e.carbs)}</td>
                          <td>{Math.round(e.fat)}</td>
                          <td className="row-actions">
                            <button
                              type="button"
                              className="btn compact"
                              onClick={() =>
                                setDetailId((id) => (id === e.id ? null : e.id))
                              }
                            >
                              Detail
                            </button>
                            <button
                              type="button"
                              className="btn danger compact"
                              onClick={() => void remove(e.id)}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                        {detailId === e.id ? (
                          <tr className="detail-row">
                            <td colSpan={7}>
                              <NutritionDetail
                                open
                                scaled
                                onClose={() => setDetailId(null)}
                                data={{
                                  name: e.name,
                                  servingLabel: `${e.servingQty} × serving`,
                                  servingQty: e.servingQty,
                                  kcal: e.kcal,
                                  protein: e.protein,
                                  carbs: e.carbs,
                                  fat: e.fat,
                                  minerals: e.minerals,
                                  perServing: e.foodId
                                    ? (() => {
                                        const f = foodById.get(e.foodId!)
                                        // Fallback: divide entry by qty when food not in current list
                                        if (f) {
                                          return {
                                            servingLabel: f.servingLabel,
                                            kcal: f.kcal,
                                            protein: f.protein,
                                            carbs: f.carbs,
                                            fat: f.fat,
                                            minerals: f.minerals
                                          }
                                        }
                                        const q = e.servingQty || 1
                                        return {
                                          servingLabel: '1 serving',
                                          kcal: e.kcal / q,
                                          protein: e.protein / q,
                                          carbs: e.carbs / q,
                                          fat: e.fat / q
                                        }
                                      })()
                                    : undefined
                                }}
                              />
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}