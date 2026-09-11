import React, { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DiaryEntry, Food, MealType, WaterLog } from '../../../shared/types'
import {
  formatMlExact,
  waterProgressPct
} from '../../../shared/water'
import { scaleMinerals } from '../../../shared/minerals'
import {
  formatPortion,
  parseServingGrams,
  portionToServingQty,
  type PortionUnit
} from '../../../shared/portionUnits'
import { todayIso } from '../lib/format'
import NutritionDetail from '../lib/NutritionDetail'
import type { HealthProfile } from '../../../shared/types'
import { flagDiaryEntries, type DiaryRedFlag } from '../../../shared/health'

type Props = { onToast: (msg: string) => void }

const MEALS: { id: MealType; label: string }[] = [
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'lunch', label: 'Lunch' },
  { id: 'dinner', label: 'Dinner' },
  { id: 'snacks', label: 'Snacks' }
]

const FOOD_UNITS: { id: PortionUnit; label: string }[] = [
  { id: 'servings', label: 'servings' },
  { id: 'g', label: 'g' },
  { id: 'kg', label: 'kg' },
  { id: 'each', label: 'each' }
]

const CUSTOM_UNITS: { id: PortionUnit; label: string }[] = [
  { id: 'servings', label: 'servings' },
  { id: 'each', label: 'each' }
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

function qtyLabel(e: DiaryEntry): string {
  if (e.portionAmount != null && e.portionUnit) {
    return formatPortion(e.portionAmount, e.portionUnit)
  }
  return `${e.servingQty} servings`
}

export default function DiaryPage({ onToast }: Props): React.JSX.Element {
  const [date, setDate] = useState(todayIso())
  const [entries, setEntries] = useState<DiaryEntry[]>([])
  const [exerciseKcal, setExerciseKcal] = useState(0)
  const [calorieGoal, setCalorieGoal] = useState(2000)
  const [waterLogs, setWaterLogs] = useState<WaterLog[]>([])
  const [waterGoalMl, setWaterGoalMl] = useState(2000)
  const [recommendedWaterMl, setRecommendedWaterMl] = useState(2000)
  const [customWaterMl, setCustomWaterMl] = useState('250')
  const [showAdd, setShowAdd] = useState(false)
  const addPanelRef = useRef<HTMLDivElement>(null)
  const [meal, setMeal] = useState<MealType>('breakfast')
  const [query, setQuery] = useState('')
  const [foods, setFoods] = useState<Food[]>([])
  const [allFoods, setAllFoods] = useState<Food[]>([])
  const [foodsLoading, setFoodsLoading] = useState(false)
  const [selectedFoodId, setSelectedFoodId] = useState('')
  const [amount, setAmount] = useState('1')
  const [unit, setUnit] = useState<PortionUnit>('servings')
  const [custom, setCustom] = useState({
    name: '',
    kcal: '',
    protein: '',
    carbs: '',
    fat: ''
  })
  const [mode, setMode] = useState<'db' | 'custom'>('db')
  const [detailId, setDetailId] = useState<string | null>(null)
  const [healthProfile, setHealthProfile] = useState<HealthProfile | null>(null)

  const reload = useCallback(async () => {
    const [list, dash, settings, waters, goal, recommended, health] = await Promise.all([
      window.api.listDiary(date),
      window.api.getDashboard(date),
      window.api.getSettings(),
      window.api.listWater(date),
      window.api.getWaterGoalMl(),
      window.api.getRecommendedWaterMl(),
      window.api.getHealthProfile()
    ])
    setEntries(list)
    setExerciseKcal(dash.exerciseKcal)
    setCalorieGoal(settings.calorieGoal)
    setWaterLogs(waters)
    setWaterGoalMl(goal)
    setRecommendedWaterMl(recommended)
    setHealthProfile(health)
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

  useEffect(() => {
    if (!showAdd) return
    const t = window.setTimeout(() => {
      addPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
    return () => window.clearTimeout(t)
  }, [showAdd])

  const dayTotals = useMemo(() => sum(entries), [entries])

  const redFlags = useMemo((): DiaryRedFlag[] => {
    if (!healthProfile) return []
    const foodsMap = new Map<string, { name: string; brand?: string }>()
    for (const f of allFoods) foodsMap.set(f.id, f)
    return flagDiaryEntries(entries, foodsMap, healthProfile)
  }, [entries, allFoods, healthProfile])

  const redFlagByEntry = useMemo(() => {
    const m = new Map<string, DiaryRedFlag>()
    for (const f of redFlags) m.set(f.entryId, f)
    return m
  }, [redFlags])
  const remaining = calorieGoal - dayTotals.kcal + exerciseKcal

  const foodById = useMemo(() => {
    const m = new Map<string, Food>()
    for (const f of allFoods) m.set(f.id, f)
    for (const f of foods) m.set(f.id, f)
    return m
  }, [allFoods, foods])

  const selectedFood = useMemo(
    () => foods.find((f) => f.id === selectedFoodId) ?? foodById.get(selectedFoodId),
    [foods, foodById, selectedFoodId]
  )

  const selectedGrams = useMemo(
    () => (selectedFood ? parseServingGrams(selectedFood.servingLabel) : null),
    [selectedFood]
  )

  const portionPreview = useMemo(() => {
    if (!selectedFood || mode !== 'db') return null
    const amt = Number(amount) || 0
    if (amt <= 0) return null
    const { qty, error } = portionToServingQty({
      amount: amt,
      unit,
      servingLabel: selectedFood.servingLabel
    })
    if (error) return { error, kcal: null as number | null, qty: null as number | null }
    return { error: undefined as string | undefined, kcal: selectedFood.kcal * qty, qty }
  }, [selectedFood, amount, unit, mode])

  function openAdd(forMeal?: MealType): void {
    if (forMeal) setMeal(forMeal)
    setMode('db')
    setQuery('')
    setSelectedFoodId('')
    setAmount('1')
    setUnit('servings')
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
    const amt = Number(amount) || 0
    const { qty, error } = portionToServingQty({
      amount: amt,
      unit,
      servingLabel: food.servingLabel
    })
    if (error) {
      onToast(error)
      return
    }
    await window.api.addDiary({
      date,
      meal,
      foodId: food.id,
      name: food.brand ? `${food.name} (${food.brand})` : food.name,
      servingQty: qty,
      portionAmount: amt,
      portionUnit: unit,
      kcal: food.kcal * qty,
      protein: food.protein * qty,
      carbs: food.carbs * qty,
      fat: food.fat * qty,
      minerals: scaleMinerals(food.minerals, qty)
    })
    onToast('Added to diary')
    setShowAdd(false)
    setSelectedFoodId('')
    setAmount('1')
    setUnit('servings')
    await reload()
  }

  async function addCustom(): Promise<void> {
    if (!custom.name.trim()) {
      onToast('Name is required')
      return
    }
    const customUnit: PortionUnit = unit === 'each' ? 'each' : 'servings'
    const amt = Number(amount) || 1
    const q = amt
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
      portionAmount: amt,
      portionUnit: customUnit,
      kcal: kcalEach * q,
      protein: proteinEach * q,
      carbs: carbsEach * q,
      fat: fatEach * q
    })
    if (!foodId) onToast('Custom food added to diary')
    else if (!custom.name) onToast('Added to diary')
    setShowAdd(false)
    setCustom({ name: '', kcal: '', protein: '', carbs: '', fat: '' })
    setAmount('1')
    setUnit('servings')
    await reload()
  }

  async function remove(id: string): Promise<void> {
    await window.api.deleteDiary(id)
    onToast('Entry removed')
    await reload()
  }

  const unitOptions = mode === 'custom' ? CUSTOM_UNITS : FOOD_UNITS

  const waterTotal = useMemo(
    () => waterLogs.reduce((sum, w) => sum + w.ml, 0),
    [waterLogs]
  )
  const waterPct = waterProgressPct(waterTotal, waterGoalMl)

  async function addWaterQuick(ml: number): Promise<void> {
    if (!(ml > 0)) return
    await window.api.addWater({ date, ml: Math.round(ml) })
    onToast('Added ' + formatMlExact(ml) + ' water')
    await reload()
  }

  async function addCustomWater(): Promise<void> {
    const ml = Math.round(Number(customWaterMl) || 0)
    if (!(ml > 0)) {
      onToast('Enter a positive ml amount')
      return
    }
    await addWaterQuick(ml)
  }

  async function removeWater(id: string): Promise<void> {
    await window.api.deleteWater(id)
    onToast('Water entry removed')
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
          <div className="value">{Math.round(dayTotals.kcal)} Kcal</div>
        </div>
        <div className="card">
          <div className="label">Exercise</div>
          <div className="value">-{Math.round(exerciseKcal)} Kcal</div>
        </div>
        <div className="card">
          <div className="label">Remaining</div>
          <div className={remaining < 0 ? 'value danger' : 'value'}>
            {Math.round(remaining)} Kcal
          </div>
        </div>
        <div className="card">
          <div className="label">Protein / Carbohydrate / Fat</div>
          <div className="value small-value">
            {Math.round(dayTotals.protein)} g / {Math.round(dayTotals.carbs)} g /{' '}
            {Math.round(dayTotals.fat)} g
          </div>
        </div>
      </div>

      {redFlags.length > 0 && (
        <div className="red-flag-banner" role="alert">
          <div>
            <strong>Health red flags:</strong> {redFlags.length} entr
            {redFlags.length === 1 ? 'y' : 'ies'} may conflict with your profile
            {' — '}
            {[...new Set(redFlags.flatMap((f) => f.hits.map((h) => h.label)))].join(', ')}
            <div className="muted small" style={{ marginTop: 4 }}>
              Matched: {redFlags.map((f) => f.entryName).join('; ')}
            </div>
          </div>
        </div>
      )}

      <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel-header">
          <h2>Water</h2>
          <span className="badge-soft">
            {formatMlExact(waterTotal)} / {formatMlExact(waterGoalMl)} · {waterPct}%
          </span>
        </div>
        <p className="muted small" style={{ marginTop: 0 }}>
          Recommended ~{formatMlExact(recommendedWaterMl)}/day
          {waterGoalMl !== recommendedWaterMl ? ' · using your custom goal' : ' (from weight or default)'}
        </p>
        <div className="progress-track" style={{ marginBottom: 12 }}>
          <div
            className="progress-fill"
            style={{
              width: waterPct + '%',
              background: waterPct > 100 ? 'var(--danger)' : undefined
            }}
          />
        </div>
        <div className="chip-row" style={{ marginBottom: 12 }}>
          <button type="button" className="chip" onClick={() => void addWaterQuick(250)}>
            +250 ml
          </button>
          <button type="button" className="chip" onClick={() => void addWaterQuick(500)}>
            +500 ml
          </button>
          <button type="button" className="chip" onClick={() => void addWaterQuick(250)}>
            +1 cup
          </button>
        </div>
        <div className="row-actions" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <label className="block-label" style={{ margin: 0, minWidth: 140 }}>
            Custom (ml)
            <input
              className="input"
              type="number"
              min={50}
              step={50}
              value={customWaterMl}
              onChange={(e) => setCustomWaterMl(e.target.value)}
              style={{ marginTop: 4 }}
            />
          </label>
          <button type="button" className="btn primary" onClick={() => void addCustomWater()}>
            Add
          </button>
        </div>
        {waterLogs.length === 0 ? (
          <p className="muted small" style={{ marginBottom: 0 }}>
            No water logged for this date yet.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Amount</th>
                  <th>Time</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {waterLogs.map((w) => (
                  <tr key={w.id}>
                    <td>{formatMlExact(w.ml)}</td>
                    <td className="muted">
                      {w.createdAt
                        ? new Date(w.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit'
                          })
                        : '—'}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn ghost compact"
                        onClick={() => void removeWater(w.id)}
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

      {showAdd && (
        <div className="panel" ref={addPanelRef} id="diary-add-food">
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
              Amount
              <input
                className="input"
                type="number"
                min="0.5"
                step="0.5"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <label>
              Unit
              <select
                className="input"
                value={unitOptions.some((u) => u.id === unit) ? unit : 'servings'}
                onChange={(e) => setUnit(e.target.value as PortionUnit)}
              >
                {unitOptions.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.label}
                  </option>
                ))}
              </select>
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
                onClick={() => {
                  setMode('custom')
                  if (unit === 'g' || unit === 'kg') setUnit('servings')
                }}
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
                  placeholder={'Type to filter\u2026 (all foods shown when empty)'}
                />
              </label>
              {selectedFood ? (
                <p className="muted small" style={{ marginTop: 0 }}>
                  Food serving: {selectedFood.servingLabel}
                  {selectedGrams != null ? ` \u00b7 \u2248 ${selectedGrams} g per serving` : ''}
                  {portionPreview?.error ? (
                    <>
                      <br />
                      <span className="danger">{portionPreview.error}</span>
                    </>
                  ) : portionPreview?.kcal != null ? (
                    <>
                      <br />
                      Estimated: ~{Math.round(portionPreview.kcal)} kcal for{' '}
                      {formatPortion(Number(amount) || 0, unit)}
                      {portionPreview.qty != null && unit !== 'servings' && unit !== 'each'
                        ? ` (\u2248 ${Math.round(portionPreview.qty * 100) / 100} servings)`
                        : ''}
                    </>
                  ) : null}
                </p>
              ) : null}
              {foodsLoading && foods.length === 0 ? (
                <p className="muted">Loading foods{'\u2026'}</p>
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
                            {f.brand ? ` \u00b7 ${f.brand}` : ''}
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
                    <p className="muted small">
                      Showing first 80 of {foods.length} {'\u2014'} refine search.
                    </p>
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
                  Custom entries use servings or each (no gram label). They are also saved into your
                  Foods database (unless the same name already exists) so you can reuse them later.
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
                {Math.round(totals.kcal)} kcal / Protein {Math.round(totals.protein)} g /{' '}
                Carbohydrate {Math.round(totals.carbs)} g / Fat {Math.round(totals.fat)} g
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
                    {mealEntries.map((e) => {
                      const flag = redFlagByEntry.get(e.id)
                      return (
                      <Fragment key={e.id}>
                        <tr className={flag ? 'red-flag-row' : undefined}>
                          <td>
                            {e.name}
                            {flag ? (
                              <span
                                className="red-flag-badge"
                                title={flag.hits.map((h) => h.label + ' (' + h.matchedAlias + ')').join(', ')}
                              >
                                Red flag · {flag.hits.map((h) => h.label).join(', ')}
                              </span>
                            ) : null}
                          </td>
                          <td>{qtyLabel(e)}</td>
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
                                  servingLabel: qtyLabel(e),
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
                    )})}
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
