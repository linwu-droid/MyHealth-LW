import type React from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DiaryEntry, Food, MealType } from '../../../shared/types'
import { todayIso } from '../lib/format'

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
    if (!showAdd || mode !== 'db') return
    const t = window.setTimeout(() => {
      void window.api.listFoods(query).then(setFoods)
    }, 150)
    return () => window.clearTimeout(t)
  }, [query, showAdd, mode])

  const dayTotals = useMemo(() => sum(entries), [entries])
  const remaining = calorieGoal - dayTotals.kcal + exerciseKcal

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
      fat: food.fat * q
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
    await window.api.addDiary({
      date,
      meal,
      name: custom.name.trim(),
      servingQty: q,
      kcal: (Number(custom.kcal) || 0) * q,
      protein: (Number(custom.protein) || 0) * q,
      carbs: (Number(custom.carbs) || 0) * q,
      fat: (Number(custom.fat) || 0) * q
    })
    onToast('Custom food added')
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
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              setShowAdd(true)
              setMode('db')
            }}
          >
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
          <div className="label">P / C / F</div>
          <div className="value small-value">
            {Math.round(dayTotals.protein)}g · {Math.round(dayTotals.carbs)}g ·{' '}
            {Math.round(dayTotals.fat)}g
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
                onClick={() => setMode('db')}
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
                  placeholder="Search…"
                />
              </label>
              <div className="table-wrap food-pick">
                <table className="data">
                  <thead>
                    <tr>
                      <th />
                      <th>Name</th>
                      <th>Serving</th>
                      <th>kcal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {foods.slice(0, 40).map((f) => (
                      <tr key={f.id} className="clickable" onClick={() => setSelectedFoodId(f.id)}>
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button type="button" className="btn primary" onClick={() => void addFromFood()}>
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
                Carbs g
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
                {Math.round(totals.kcal)} kcal · P {Math.round(totals.protein)} · C{' '}
                {Math.round(totals.carbs)} · F {Math.round(totals.fat)}
              </span>
              <div className="spacer" />
              <button
                type="button"
                className="btn compact"
                onClick={() => {
                  setMeal(m.id)
                  setShowAdd(true)
                }}
              >
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
                      <th>P</th>
                      <th>C</th>
                      <th>F</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {mealEntries.map((e) => (
                      <tr key={e.id}>
                        <td>{e.name}</td>
                        <td>{e.servingQty}</td>
                        <td>{Math.round(e.kcal)}</td>
                        <td>{Math.round(e.protein)}</td>
                        <td>{Math.round(e.carbs)}</td>
                        <td>{Math.round(e.fat)}</td>
                        <td className="row-actions">
                          <button
                            type="button"
                            className="btn danger compact"
                            onClick={() => void remove(e.id)}
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
        )
      })}
    </div>
  )
}
