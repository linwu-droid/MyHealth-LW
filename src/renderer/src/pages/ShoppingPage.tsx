import type React from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  Food,
  MacroTotals,
  MainMealType,
  PortionPlan,
  ShoppingListItem
} from '../../../shared/types'
import { todayIso } from '../lib/format'
import PlateVisual from '../lib/PlateVisual'

type Props = { onToast: (msg: string) => void }

/** Common shopping units for the Unit dropdown. */
export const SHOPPING_UNITS = [
  'g',
  'kg',
  'ml',
  'L',
  'piece',
  'pieces',
  'pack',
  'bunches',
  'cup',
  'tbsp',
  'tsp',
  'serving',
  'servings',
  'slice',
  'slices',
  'can',
  'bottle',
  'bag',
  'loaf',
  'dozen',
  'other'
] as const

const DEFAULT_UNIT = 'g'
const OTHER_UNIT = 'other'
const MAIN_MEALS: MainMealType[] = ['breakfast', 'lunch', 'dinner']

type MealLineItem = {
  shoppingItemId: string
  name: string
  servings: number
  servingLabel: string
  macros: MacroTotals
}

function unitSelectValue(stored: string | undefined): string {
  if (!stored) return DEFAULT_UNIT
  if ((SHOPPING_UNITS as readonly string[]).includes(stored)) return stored
  return OTHER_UNIT
}

function formatMealShort(meal: string): string {
  return meal.charAt(0).toUpperCase() + meal.slice(1)
}

function scaleMacros(m: MacroTotals, n: number): MacroTotals {
  return {
    kcal: Math.round(m.kcal * n * 10) / 10,
    protein: Math.round(m.protein * n * 10) / 10,
    carbs: Math.round(m.carbs * n * 10) / 10,
    fat: Math.round(m.fat * n * 10) / 10
  }
}

/** Items allocated to a meal for the repeating daily template. */
function itemsForMeal(plan: PortionPlan, meal: MainMealType): MealLineItem[] {
  return plan.items
    .filter((r) => r.matched && r.servingsPerDay > 0 && r.servingsByMeal[meal] > 0)
    .map((r) => {
      const servings = r.servingsByMeal[meal]
      const unit: MacroTotals = {
        kcal: r.perDay.kcal / r.servingsPerDay,
        protein: r.perDay.protein / r.servingsPerDay,
        carbs: r.perDay.carbs / r.servingsPerDay,
        fat: r.perDay.fat / r.servingsPerDay
      }
      return {
        shoppingItemId: r.shoppingItemId,
        name: r.name,
        servings,
        servingLabel: r.servingLabel,
        macros: scaleMacros(unit, servings)
      }
    })
}

function formatDailyMealPlanText(plan: PortionPlan): string[] {
  const lines: string[] = []
  lines.push('=== Daily recommendation (repeats each day) ===')
  for (const meal of MAIN_MEALS) {
    const goal = plan.goalsPerMeal?.[meal]
    const total = plan.totalsPerMeal?.[meal]
    const goalKcal = goal ? goal.kcal : 'â€”'
    const plannedKcal = total ? Math.round(total.kcal) : 'â€”'
    lines.push('')
    lines.push(
      `${formatMealShort(meal)} (goal ${goalKcal} kcal Â· planned â‰ˆ ${plannedKcal} kcal)`
    )
    const items = itemsForMeal(plan, meal)
    if (items.length === 0) {
      lines.push('  (no items)')
    } else {
      for (const it of items) {
        lines.push(
          `  â€¢ ${it.name}: ${it.servings} Ã— ${it.servingLabel} â‰ˆ ${Math.round(it.macros.kcal)} kcal, ${it.macros.protein}g Protein Â· Carbohydrate ${it.macros.carbs}g Â· Fat ${it.macros.fat}g`
        )
      }
    }
  }
  lines.push('')
  lines.push(`Daily plan (repeats for ${plan.days} days)`)
  for (let d = 1; d <= plan.days; d++) {
    lines.push(`  Day ${d}: same as Daily recommendation above`)
  }
  return lines
}

function UnitSelect(props: {
  value: string
  custom: string
  onSelect: (v: string) => void
  onCustom: (v: string) => void
  onCommit?: () => void
  compact?: boolean
}): React.JSX.Element {
  const showCustom = props.value === OTHER_UNIT
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <select
        className={props.compact ? 'input compact-input' : 'input'}
        value={props.value}
        onChange={(e) => props.onSelect(e.target.value)}
        onBlur={() => props.onCommit?.()}
      >
        {SHOPPING_UNITS.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      </select>
      {showCustom && (
        <input
          className={props.compact ? 'input compact-input' : 'input'}
          value={props.custom}
          onChange={(e) => props.onCustom(e.target.value)}
          onBlur={() => props.onCommit?.()}
          placeholder="custom unit"
        />
      )}
    </div>
  )
}

function DailyMealCard(props: {
  meal: MainMealType
  plan: PortionPlan
  compact?: boolean
}): React.JSX.Element {
  const { meal, plan, compact } = props
  const items = itemsForMeal(plan, meal)
  const goal = plan.goalsPerMeal?.[meal]
  const total = plan.totalsPerMeal?.[meal]
  const plannedKcal = total ? Math.round(total.kcal) : 0
  const goalKcal = goal?.kcal ?? 0

  return (
    <div className={`card meal-plan-card${compact ? ' compact' : ''}`}>
      <div className="label">{formatMealShort(meal)}</div>
      <div className="value small-value">
        {plannedKcal} / {goalKcal} kcal
      </div>
      {total && goal && (
        <div className="muted small">
          Protein {total.protein}/{goal.protein} Â· Carbohydrate {total.carbs}/{goal.carbs} Â· Fat{' '}
          {total.fat}/{goal.fat}
        </div>
      )}
      {items.length === 0 ? (
        <p className="muted small meal-empty">No items for this meal</p>
      ) : (
        <ul className="meal-item-list">
          {items.map((it) => (
            <li key={it.shoppingItemId}>
              <span className="meal-item-name">{it.name}</span>
              <span className="muted small">
                {it.servings} Ã— {it.servingLabel}
              </span>
              <span className="muted small meal-item-macros">
                â‰ˆ {Math.round(it.macros.kcal)} kcal Â· Protein {it.macros.protein}g Â· Carbohydrate{' '}
                {it.macros.carbs}g Â· Fat {it.macros.fat}g
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function DailyMealGrid(props: { plan: PortionPlan; compact?: boolean }): React.JSX.Element {
  return (
    <div className={`cards meal-cards${props.compact ? ' compact' : ''}`}>
      {MAIN_MEALS.map((meal) => (
        <DailyMealCard key={meal} meal={meal} plan={props.plan} compact={props.compact} />
      ))}
    </div>
  )
}

export default function ShoppingPage({ onToast }: Props): React.JSX.Element {
  const [items, setItems] = useState<ShoppingListItem[]>([])
  const [foods, setFoods] = useState<Food[]>([])
  const [name, setName] = useState('')
  const [qty, setQty] = useState('')
  const [unit, setUnit] = useState(DEFAULT_UNIT)
  const [customUnit, setCustomUnit] = useState('')
  const [foodId, setFoodId] = useState('')
  const [paste, setPaste] = useState('')
  const [showPaste, setShowPaste] = useState(false)
  const [days, setDays] = useState(7)
  const [plan, setPlan] = useState<PortionPlan | null>(null)
  const [loadingPlan, setLoadingPlan] = useState(false)
  const [applying, setApplying] = useState(false)
  const [expandedDay, setExpandedDay] = useState(1)

  const resolvedUnit = useMemo(() => {
    if (unit === OTHER_UNIT) return customUnit.trim() || undefined
    return unit || undefined
  }, [unit, customUnit])

  const dayNumbers = useMemo(() => {
    if (!plan) return [] as number[]
    return Array.from({ length: plan.days }, (_, i) => i + 1)
  }, [plan])

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
    try {
      const qtyNum = qty.trim() === '' ? undefined : Number(qty)
      const quantity =
        qtyNum === undefined ? undefined : Number.isFinite(qtyNum) ? qtyNum : undefined
      const created = await window.api.addShopping({
        name: name.trim(),
        quantity,
        unit: resolvedUnit,
        foodId: foodId || undefined
      })
      setItems((prev) => [created, ...prev])
      setName('')
      setQty('')
      setUnit(DEFAULT_UNIT)
      setCustomUnit('')
      setFoodId('')
      onToast('Added to shopping list')
      await reload()
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to add item')
    }
  }

  async function addPaste(): Promise<void> {
    const lines = paste.split(/\r?\n/)
    try {
      const res = await window.api.addShoppingMany(lines)
      if (res.items?.length) {
        setItems((prev) => [...res.items, ...prev])
      }
      setPaste('')
      setShowPaste(false)
      onToast(`Added ${res.created} items`)
      await reload()
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to add items')
    }
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
      setExpandedDay(1)
      if (p.items.length === 0) onToast('Add unchecked items first')
      else onToast(`Portion plan for ${p.days} days Â· 3 meals/day`)
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not build recommendations')
    } finally {
      setLoadingPlan(false)
    }
  }

  async function copyPortions(): Promise<void> {
    if (!plan) return
    const splitPct = plan.mealSplit
      ? `B ${Math.round(plan.mealSplit.breakfast * 100)}% / L ${Math.round(plan.mealSplit.lunch * 100)}% / D ${Math.round(plan.mealSplit.dinner * 100)}%`
      : 'B 30% / L 35% / D 35%'
    const lines = plan.items.map((r) => {
      if (!r.matched) return `${r.name}: unknown nutrition`
      const mealBits = r.suggestedMeals
        .map((m) => `${formatMealShort(m)} ${r.servingsByMeal[m]}Ã—`)
        .join(', ')
      return `${r.name}: ${r.servingsPerDay} Ã— ${r.servingLabel}/day (${mealBits}) â‰ˆ ${r.perDay.kcal} kcal, ${r.perDay.protein}g P Â· ${r.servingsForPeriod} servings / ${plan.days}d`
    })
    lines.push('')
    lines.push(...formatDailyMealPlanText(plan))
    lines.push('')
    lines.push(`Meal split: ${splitPct}`)
    lines.push(
      `Daily totals: ${plan.totalsPerDay.kcal} kcal Â· P ${plan.totalsPerDay.protein}g Â· C ${plan.totalsPerDay.carbs}g Â· F ${plan.totalsPerDay.fat}g`
    )
    if (plan.totalsPerMeal) {
      lines.push(
        `  Breakfast: ${Math.round(plan.totalsPerMeal.breakfast.kcal)} kcal Â· Lunch: ${Math.round(plan.totalsPerMeal.lunch.kcal)} kcal Â· Dinner: ${Math.round(plan.totalsPerMeal.dinner.kcal)} kcal`
      )
    }
    lines.push(
      `Goals: ${plan.goalsPerDay.kcal} kcal Â· P ${plan.goalsPerDay.protein}g Â· C ${plan.goalsPerDay.carbs}g Â· F ${plan.goalsPerDay.fat}g`
    )
    lines.push(
      `Period (${plan.days}d): ${Math.round(plan.totalsPeriod.kcal)} kcal Â· P ${plan.totalsPeriod.protein}g Â· C ${plan.totalsPeriod.carbs}g Â· F ${plan.totalsPeriod.fat}g`
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
      const res = await window.api.applyPortionsToDiary(todayIso(), plan)
      onToast(
        `Added ${res.added} diary entries across Breakfast / Lunch / Dinner for today`
      )
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
              min="0"
              step="0.5"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="optional"
            />
          </label>
          <label>
            Unit
            <UnitSelect
              value={unit}
              custom={customUnit}
              onSelect={(v) => {
                setUnit(v)
                if (v !== OTHER_UNIT) setCustomUnit('')
              }}
              onCustom={setCustomUnit}
            />
          </label>
          <label>
            Link food (optional)
            <select
              className="input"
              value={foodId}
              onChange={(e) => setFoodId(e.target.value)}
            >
              <option value="">â€” none â€”</option>
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
                  <ShoppingRow
                    key={item.id}
                    item={item}
                    foods={foods}
                    onToggle={() => void toggleChecked(item)}
                    onSaveQty={(q, u) => void saveQty(item, q, u)}
                    onLink={(id) => void linkFood(item, id)}
                    onRemove={() => void remove(item.id)}
                  />
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
            {loadingPlan ? 'Calculatingâ€¦' : 'Recommend portions'}
          </button>
        </div>
        <p className="muted small" style={{ marginTop: 0 }}>
          Uses your calorie/macro goals from Settings, planned for <strong>3 meals/day</strong>{' '}
          (breakfast ~30% Â· lunch ~35% Â· dinner ~35%). Matches list items to Foods (or a quick
          Open Food Facts lookup). Simple split biased toward higher-protein foods.
        </p>

        <div className="portion-section">
          <PlateVisual plan={plan} onToast={onToast} />
        </div>

        {plan && (
          <>
            <div className="cards tight" style={{ marginTop: 8 }}>
              <div className="card">
                <div className="label">Daily plan</div>
                <div className="value small-value">
                  {Math.round(plan.totalsPerDay.kcal)} kcal
                </div>
                <div className="muted small">
                  Protein {plan.totalsPerDay.protein} Â· Carbohydrate {plan.totalsPerDay.carbs} Â· Fat{' '}
                  {plan.totalsPerDay.fat}
                </div>
              </div>
              <div className="card">
                <div className="label">Daily goals</div>
                <div className="value small-value">{plan.goalsPerDay.kcal} kcal</div>
                <div className="muted small">
                  Protein {plan.goalsPerDay.protein} Â· Carbohydrate {plan.goalsPerDay.carbs} Â· Fat{' '}
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
              {plan.goalsPerMeal && (
                <div className="card">
                  <div className="label">3-meal goals</div>
                  <div className="muted small" style={{ marginTop: 4 }}>
                    B {plan.goalsPerMeal.breakfast.kcal} Â· L {plan.goalsPerMeal.lunch.kcal} Â· D{' '}
                    {plan.goalsPerMeal.dinner.kcal} kcal
                  </div>
                  <div className="muted small">
                    Split{' '}
                    {Math.round(plan.mealSplit.breakfast * 100)}/
                    {Math.round(plan.mealSplit.lunch * 100)}/
                    {Math.round(plan.mealSplit.dinner * 100)}
                  </div>
                </div>
              )}
            </div>

            {plan.totalsPerMeal && (
              <p className="muted small" style={{ marginTop: 10 }}>
                Planned per meal:{' '}
                <strong>Breakfast</strong> â‰ˆ {Math.round(plan.totalsPerMeal.breakfast.kcal)} kcal Â·{' '}
                <strong>Lunch</strong> â‰ˆ {Math.round(plan.totalsPerMeal.lunch.kcal)} kcal Â·{' '}
                <strong>Dinner</strong> â‰ˆ {Math.round(plan.totalsPerMeal.dinner.kcal)} kcal
              </p>
            )}

            <div className="portion-section">
              <div className="portion-section-header">
                <h3>Daily recommendation</h3>
                <span className="muted small">One representative day Â· B / L / D</span>
              </div>
              <p className="muted small" style={{ marginTop: 0 }}>
                Suggested items with servings and macros for each meal, vs meal calorie/macro
                goals.
              </p>
              <DailyMealGrid plan={plan} />
            </div>

            <div className="portion-section">
              <div className="portion-section-header">
                <h3>Day-by-day plan</h3>
                <span className="badge-soft">
                  Daily plan (repeats for {plan.days} days)
                </span>
              </div>
              <p className="muted small" style={{ marginTop: 0 }}>
                The engine uses a steady daily template â€” every day below shows the same meal
                plan. Expand a day to review Breakfast / Lunch / Dinner.
              </p>
              <div className="day-plan-list">
                {dayNumbers.map((day) => {
                  const open = expandedDay === day
                  return (
                    <details
                      key={day}
                      className="day-plan-day"
                      open={open}
                      onToggle={(e) => {
                        const el = e.currentTarget
                        if (el.open) setExpandedDay(day)
                        else if (expandedDay === day) setExpandedDay(0)
                      }}
                    >
                      <summary>
                        <span className="day-plan-title">Day {day}</span>
                        <span className="muted small">
                          {Math.round(plan.totalsPerDay.kcal)} kcal Â· same as daily template
                        </span>
                      </summary>
                      {open && <DailyMealGrid plan={plan} compact />}
                    </details>
                  )
                })}
              </div>
            </div>

            <div className="portion-section">
              <div className="portion-section-header">
                <h3>Items &amp; period totals</h3>
                <span className="muted small">Aggregate shopping view</span>
              </div>
              <div className="table-wrap" style={{ marginTop: 8 }}>
                <table className="data">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Per day</th>
                      <th>By meal</th>
                      <th>Macros / day</th>
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
                            ? `${r.servingsPerDay} Ã— ${r.servingLabel}/day`
                            : 'â€”'}
                        </td>
                        <td className="muted small">
                          {r.matched
                            ? r.suggestedMeals
                                .map(
                                  (m) =>
                                    `${formatMealShort(m)} ${r.servingsByMeal[m]}Ã—`
                                )
                                .join(' Â· ')
                            : 'â€”'}
                        </td>
                        <td>
                          {r.matched
                            ? `â‰ˆ ${r.perDay.kcal} kcal, ${r.perDay.protein}g P`
                            : 'unknown'}
                        </td>
                        <td>
                          {r.matched ? `${r.servingsForPeriod} servings` : 'â€”'}
                        </td>
                        <td className="muted small">{r.note || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
                  ? 'Addingâ€¦'
                  : "Add today's portions to Diary (3 meals)"}
              </button>
            </div>
            <p className="muted small">
              Diary apply distributes each item across Breakfast / Lunch / Dinner for today
              (not a single meal). Only items linked to a local Food (foodId) are logged;
              online-only matches are shown for planning but not auto-logged.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

function ShoppingRow(props: {
  item: ShoppingListItem
  foods: Food[]
  onToggle: () => void
  onSaveQty: (quantity: string, unit: string) => void
  onLink: (foodId: string) => void
  onRemove: () => void
}): React.JSX.Element {
  const { item, foods } = props
  const initialSelect = unitSelectValue(item.unit)
  const [qty, setQty] = useState(
    item.quantity !== undefined ? String(item.quantity) : ''
  )
  const [unitSel, setUnitSel] = useState(initialSelect)
  const [custom, setCustom] = useState(
    initialSelect === OTHER_UNIT ? (item.unit ?? '') : ''
  )

  useEffect(() => {
    const sel = unitSelectValue(item.unit)
    setQty(item.quantity !== undefined ? String(item.quantity) : '')
    setUnitSel(sel)
    setCustom(sel === OTHER_UNIT ? (item.unit ?? '') : '')
  }, [item.id, item.quantity, item.unit])

  function commitUnit(nextSel: string, nextCustom: string): void {
    const resolved =
      nextSel === OTHER_UNIT ? nextCustom.trim() : nextSel
    props.onSaveQty(qty, resolved)
  }

  return (
    <tr className={item.checked ? 'shopping-checked' : ''}>
      <td>
        <input
          type="checkbox"
          checked={!!item.checked}
          onChange={props.onToggle}
          aria-label={`Check ${item.name}`}
        />
      </td>
      <td>{item.name}</td>
      <td>
        <input
          className="input compact-input"
          type="number"
          min="0"
          step="0.5"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          onBlur={() => {
            const resolved = unitSel === OTHER_UNIT ? custom.trim() : unitSel
            props.onSaveQty(qty, resolved)
          }}
        />
      </td>
      <td>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <select
            className="input compact-input"
            value={unitSel}
            onChange={(e) => {
              const v = e.target.value
              setUnitSel(v)
              if (v !== OTHER_UNIT) {
                setCustom('')
                props.onSaveQty(qty, v)
              }
            }}
          >
            {SHOPPING_UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
          {unitSel === OTHER_UNIT && (
            <input
              className="input compact-input"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onBlur={() => commitUnit(unitSel, custom)}
              placeholder="custom unit"
            />
          )}
        </div>
      </td>
      <td>
        <select
          className="input compact-input"
          value={item.foodId ?? ''}
          onChange={(e) => props.onLink(e.target.value)}
        >
          <option value="">â€”</option>
          {foods.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </td>
      <td className="row-actions">
        <button type="button" className="btn danger compact" onClick={props.onRemove}>
          Delete
        </button>
      </td>
    </tr>
  )
}
