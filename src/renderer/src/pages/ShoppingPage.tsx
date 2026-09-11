import type React from 'react'
import { useCallback, useEffect, useState } from 'react'
import type { Food, PortionPlan, ShoppingListItem } from '../../../shared/types'
import { todayIso } from '../lib/format'

type Props = { onToast: (msg: string) => void }

export default function ShoppingPage({ onToast }: Props): React.JSX.Element {
  const [items, setItems] = useState<ShoppingListItem[]>([])
  const [foods, setFoods] = useState<Food[]>([])
  const [name, setName] = useState('')
  const [qty, setQty] = useState('')
  const [unit, setUnit] = useState('')
  const [foodId, setFoodId] = useState('')
  const [paste, setPaste] = useState('')
  const [showPaste, setShowPaste] = useState(false)
  const [days, setDays] = useState(7)
  const [plan, setPlan] = useState<PortionPlan | null>(null)
  const [loadingPlan, setLoadingPlan] = useState(false)
  const [applying, setApplying] = useState(false)

  const reload = useCallback(async () => {
    const [list, foodList] = await Promise.all([
      window.api.listShopping(),
      window.api.listFoods()
    ])
    setItems(list)
    setFoods(foodList)
  }, [])

  useEffect(() => {
    void reload().catch(() => onToast('Failed to load shopping list'))
  }, [reload, onToast])

  async function addOne(): Promise<void> {
    if (!name.trim()) {
      onToast('Name is required')
      return
    }
    await window.api.addShopping({
      name: name.trim(),
      quantity: qty ? Number(qty) : undefined,
      unit: unit.trim() || undefined,
      foodId: foodId || undefined
    })
    setName('')
    setQty('')
    setUnit('')
    setFoodId('')
    onToast('Added to shopping list')
    await reload()
  }

  async function addPaste(): Promise<void> {
    const lines = paste.split(/\r?\n/)
    const res = await window.api.addShoppingMany(lines)
    setPaste('')
    setShowPaste(false)
    onToast(`Added ${res.created} items`)
    await reload()
  }

  async function toggleChecked(item: ShoppingListItem): Promise<void> {
    await window.api.updateShopping(item.id, { checked: !item.checked })
    await reload()
  }

  async function saveQty(item: ShoppingListItem, quantity: string, unitVal: string): Promise<void> {
    await window.api.updateShopping(item.id, {
      quantity: quantity === '' ? undefined : Number(quantity),
      unit: unitVal.trim() || undefined
    })
    await reload()
  }

  async function linkFood(item: ShoppingListItem, id: string): Promise<void> {
    await window.api.updateShopping(item.id, { foodId: id || undefined })
    onToast(id ? 'Linked to food' : 'Unlinked')
    await reload()
  }

  async function remove(id: string): Promise<void> {
    await window.api.deleteShopping(id)
    await reload()
  }

  async function clearChecked(): Promise<void> {
    const res = await window.api.clearCheckedShopping()
    onToast(`Cleared ${res.removed} checked items`)
    setPlan(null)
    await reload()
  }

  async function recommend(): Promise<void> {
    setLoadingPlan(true)
    try {
      const p = await window.api.recommendPortions(days)
      setPlan(p)
      if (p.items.length === 0) onToast('Add unchecked items first')
      else onToast(`Portion plan for ${p.days} days`)
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not build recommendations')
    } finally {
      setLoadingPlan(false)
    }
  }

  async function copyPortions(): Promise<void> {
    if (!plan) return
    const lines = plan.items.map((r) => {
      if (!r.matched) return `${r.name}: unknown nutrition`
      return `${r.name}: ${r.servingsPerDay} × ${r.servingLabel}/day (≈ ${r.perDay.kcal} kcal, ${r.perDay.protein}g P) · ${r.servingsForPeriod} servings / ${plan.days}d`
    })
    lines.push('')
    lines.push(
      `Daily totals: ${plan.totalsPerDay.kcal} kcal · P ${plan.totalsPerDay.protein}g · C ${plan.totalsPerDay.carbs}g · F ${plan.totalsPerDay.fat}g`
    )
    lines.push(
      `Goals: ${plan.goalsPerDay.kcal} kcal · P ${plan.goalsPerDay.protein}g · C ${plan.goalsPerDay.carbs}g · F ${plan.goalsPerDay.fat}g`
    )
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      onToast('Portions copied to clipboard')
    } catch {
      onToast('Could not copy to clipboard')
    }
  }

  async function applyToDiary(): Promise<void> {
    if (!plan) return
    setApplying(true)
    try {
      const res = await window.api.applyPortionsToDiary(todayIso(), plan, 'lunch')
      onToast(`Added ${res.added} recommended portions to today's diary (lunch)`)
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to apply to diary')
    } finally {
      setApplying(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>Shopping</h2>
        <div className="row-actions">
          <button type="button" className="btn" onClick={() => setShowPaste((v) => !v)}>
            {showPaste ? 'Hide paste' : 'Paste list'}
          </button>
          <button type="button" className="btn" onClick={() => void clearChecked()}>
            Clear checked
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2>Add item</h2>
        </div>
        <div className="form-grid">
          <label>
            Name
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void addOne()
              }}
              placeholder="e.g. Chicken breast"
            />
          </label>
          <label>
            Qty
            <input
              className="input"
              type="number"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="optional"
            />
          </label>
          <label>
            Unit
            <input
              className="input"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="g, pack…"
            />
          </label>
          <label>
            Link food (optional)
            <select
              className="input"
              value={foodId}
              onChange={(e) => setFoodId(e.target.value)}
            >
              <option value="">— none —</option>
              {foods.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                  {f.brand ? ` (${f.brand})` : ''}
                </option>
              ))}
            </select>
          </label>
          <div className="full">
            <button type="button" className="btn primary" onClick={() => void addOne()}>
              Add
            </button>
          </div>
        </div>
        {showPaste && (
          <div style={{ marginTop: 14 }}>
            <label className="block-label">
              One item per line
              <textarea
                className="input"
                rows={5}
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                placeholder={'Milk\nEggs\nSpinach'}
              />
            </label>
            <button
              type="button"
              className="btn primary"
              style={{ marginTop: 8 }}
              onClick={() => void addPaste()}
            >
              Add all lines
            </button>
          </div>
        )}
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2>List</h2>
          <span className="muted">{items.length} items</span>
        </div>
        {items.length === 0 ? (
          <div className="empty">
            <h3>Shopping list is empty</h3>
            <p>Add items above or paste a multi-line list.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th style={{ width: 36 }} />
                  <th>Name</th>
                  <th>Qty</th>
                  <th>Unit</th>
                  <th>Linked food</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className={item.checked ? 'shopping-checked' : ''}>
                    <td>
                      <input
                        type="checkbox"
                        checked={!!item.checked}
                        onChange={() => void toggleChecked(item)}
                        aria-label={`Check ${item.name}`}
                      />
                    </td>
                    <td>{item.name}</td>
                    <td>
                      <input
                        className="input compact-input"
                        type="number"
                        defaultValue={item.quantity ?? ''}
                        onBlur={(e) =>
                          void saveQty(item, e.target.value, item.unit ?? '')
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="input compact-input"
                        defaultValue={item.unit ?? ''}
                        onBlur={(e) =>
                          void saveQty(
                            item,
                            item.quantity !== undefined ? String(item.quantity) : '',
                            e.target.value
                          )
                        }
                      />
                    </td>
                    <td>
                      <select
                        className="input compact-input"
                        value={item.foodId ?? ''}
                        onChange={(e) => void linkFood(item, e.target.value)}
                      >
                        <option value="">—</option>
                        {foods.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="row-actions">
                      <button
                        type="button"
                        className="btn danger compact"
                        onClick={() => void remove(item.id)}
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

      <div className="panel">
        <div className="panel-header">
          <h2>Portion recommendations</h2>
          <div className="spacer" />
          <label className="muted small" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            Days
            <input
              className="input compact-input"
              style={{ width: 72, marginTop: 0 }}
              type="number"
              min={1}
              max={28}
              value={days}
              onChange={(e) => setDays(Number(e.target.value) || 7)}
            />
          </label>
          <button
            type="button"
            className="btn primary"
            disabled={loadingPlan}
            onClick={() => void recommend()}
          >
            {loadingPlan ? 'Calculating…' : 'Recommend portions'}
          </button>
        </div>
        <p className="muted small" style={{ marginTop: 0 }}>
          Uses your calorie/macro goals from Settings. Matches list items to Foods (or a quick
          Open Food Facts lookup). Simple split biased toward higher-protein foods.
        </p>

        {plan && (
          <>
            <div className="cards tight" style={{ marginTop: 8 }}>
              <div className="card">
                <div className="label">Daily plan</div>
                <div className="value small-value">
                  {Math.round(plan.totalsPerDay.kcal)} kcal
                </div>
                <div className="muted small">
                  P {plan.totalsPerDay.protein} · C {plan.totalsPerDay.carbs} · F{' '}
                  {plan.totalsPerDay.fat}
                </div>
              </div>
              <div className="card">
                <div className="label">Daily goals</div>
                <div className="value small-value">{plan.goalsPerDay.kcal} kcal</div>
                <div className="muted small">
                  P {plan.goalsPerDay.protein} · C {plan.goalsPerDay.carbs} · F{' '}
                  {plan.goalsPerDay.fat}
                </div>
              </div>
              <div className="card">
                <div className="label">{plan.days}-day total</div>
                <div className="value small-value">
                  {Math.round(plan.totalsPeriod.kcal)} kcal
                </div>
                <div className="muted small">
                  {plan.unmatchedCount > 0
                    ? `${plan.unmatchedCount} unmatched`
                    : 'All matched'}
                </div>
              </div>
            </div>

            <div className="table-wrap" style={{ marginTop: 12 }}>
              <table className="data">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Recommended</th>
                    <th>Per day</th>
                    <th>Period</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.items.map((r) => (
                    <tr key={r.shoppingItemId}>
                      <td>{r.name}</td>
                      <td>
                        {r.matched
                          ? `${r.servingsPerDay} × ${r.servingLabel}/day`
                          : '—'}
                      </td>
                      <td>
                        {r.matched
                          ? `≈ ${r.perDay.kcal} kcal, ${r.perDay.protein}g P`
                          : 'unknown'}
                      </td>
                      <td>
                        {r.matched ? `${r.servingsForPeriod} servings` : '—'}
                      </td>
                      <td className="muted small">{r.note || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="row-actions" style={{ marginTop: 12 }}>
              <button type="button" className="btn" onClick={() => void copyPortions()}>
                Copy portions
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={applying || plan.items.every((i) => !i.matched || !i.foodId)}
                onClick={() => void applyToDiary()}
              >
                {applying
                  ? 'Adding…'
                  : "Add today's recommended portions to Diary"}
              </button>
            </div>
            <p className="muted small">
              Diary apply only includes items linked to a local Food (foodId). Online-only
              matches are shown for planning but not auto-logged.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
