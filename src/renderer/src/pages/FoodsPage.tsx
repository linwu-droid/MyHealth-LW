import React, { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import type { Food } from '../../../shared/types'
import NutritionDetail from '../lib/NutritionDetail'

type Props = { onToast: (msg: string) => void }
type FoodKindFilter = 'all' | 'foods' | 'drinks' | 'homemade' | 'supermarket' | 'healthyShelf'

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

const SUPERMARKET_NAME_RE =
  /corn|peas|carrot|canned|frozen|uht|passata|baked beans|cracker|cereal|muesli|olive oil|canola|soy sauce|ketchup|mayo|vegemite|tuna canned|salmon canned|instant noodle|wrap|tortilla|stock cube|rice cake|cornflake|chickpea|kidney bean|lentil|capsicum|cucumber|lettuce|celery|spinach|deli|yoghurt|yogurt tub|fish finger|ice cream|evaporated milk|coconut cream|weet-?bix|couscous|quinoa dry|pasta dry|rolled oat|plain flour|white sugar|honey|jam|popcorn/i

function isSupermarketFood(f: Food): boolean {
  return SUPERMARKET_NAME_RE.test(f.name)
}

const HEALTHY_SHELF_NAME_RE =
  /oat|bran|cereal|muesli|granola|weet|flakes|porridge|chia|flax|crispbread|rice cake|psyllium|quinoa flakes|buckwheat|barley|freekeh|bulgur|thins|linseed|hemp seed|pumpkin seed|sunflower seed|tahini|almond butter|natural peanut|coconut flakes|medjool|prune dried|wheat germ|spelt|amaranth|goji|cacao nib|nutritional yeast|popcorn kernel|overnight oat|bircher|millet|corn thin/i

function isHealthyShelfFood(f: Food): boolean {
  return HEALTHY_SHELF_NAME_RE.test(f.name)
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

export default function FoodsPage({ onToast }: Props): React.JSX.Element {
  const [foods, setFoods] = useState<Food[]>([])
  const [query, setQuery] = useState('')
  const [kindFilter, setKindFilter] = useState<FoodKindFilter>('all')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(blank)
  const [showForm, setShowForm] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setFoods(await window.api.listFoods(query))
  }, [query])

  useEffect(() => {
    const t = window.setTimeout(() => {
      void reload().catch(() => onToast('Failed to load foods'))
    }, 120)
    return () => window.clearTimeout(t)
  }, [reload, onToast])

  const filteredFoods = useMemo(() => {
    if (kindFilter === 'all') return foods
    if (kindFilter === 'drinks') return foods.filter(isDrinkFood)
    if (kindFilter === 'homemade') return foods.filter((f) => isHomemadeFood(f) && !isDrinkFood(f))
    if (kindFilter === 'supermarket')
      return foods.filter(
        (f) => isSupermarketFood(f) && !isDrinkFood(f) && !isHomemadeFood(f) && !isHealthyShelfFood(f)
      )
    if (kindFilter === 'healthyShelf')
      return foods.filter((f) => isHealthyShelfFood(f) && !isDrinkFood(f) && !isHomemadeFood(f))
    return foods.filter(
      (f) => !isDrinkFood(f) && !isHomemadeFood(f) && !isSupermarketFood(f) && !isHealthyShelfFood(f)
    )
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

  return (
    <div>
      <div className="page-header">
        <h2>Foods</h2>
        <div className="segmented" role="group" aria-label="Food kind filter">
          {(
            [
              ['all', 'All'],
              ['foods', 'Foods'],
              ['drinks', 'Drinks'],
              ['homemade', 'Homemade'],
              ['supermarket', 'Supermarket'],
              ['healthyShelf', 'Healthy shelf']
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
            placeholder="Search foodsâ€¦"
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
              Carbohydrate g
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
          <h2>My foods</h2>
          <span className="muted">
            {filteredFoods.length} of {foods.length}
          </span>
        </div>
        {filteredFoods.length === 0 ? (
          <div className="empty">
            <h3>No foods found</h3>
            <p>
              Add a food, clear the search, or switch All / Foods / Drinks / Homemade /
              Supermarket / Healthy shelf. Shelf-stable and drink packs are auto-seeded into this database.
            </p>
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
                  <th>Protein (g)</th>
                  <th>Carbohydrate (g)</th>
                  <th>Fat (g)</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filteredFoods.map((f) => (
                  <Fragment key={f.id}>
                    <tr>
                      <td>{f.name}</td>
                      <td>{f.brand || 'â€”'}</td>
                      <td>{f.servingLabel}</td>
                      <td>{f.kcal}</td>
                      <td>{f.protein}</td>
                      <td>{f.carbs}</td>
                      <td>{f.fat}</td>
                      <td className="row-actions">
                        <button
                          type="button"
                          className="btn compact"
                          onClick={() => setDetailId((id) => (id === f.id ? null : f.id))}
                        >
                          Detail
                        </button>
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
                    {detailId === f.id ? (
                      <tr className="detail-row">
                        <td colSpan={8}>
                          <NutritionDetail
                            open
                            scaled={false}
                            onClose={() => setDetailId(null)}
                            data={{
                              name: f.name,
                              brand: f.brand,
                              servingLabel: f.servingLabel,
                              kcal: f.kcal,
                              protein: f.protein,
                              carbs: f.carbs,
                              fat: f.fat,
                              minerals: f.minerals
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
    </div>
  )
}