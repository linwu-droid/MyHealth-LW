import type {
  AppSettings,
  Food,
  MacroTotals,
  PortionPlan,
  PortionRecommendation,
  ShoppingListItem
} from '../shared/types'

function zero(): MacroTotals {
  return { kcal: 0, protein: 0, carbs: 0, fat: 0 }
}

function scale(m: MacroTotals, n: number): MacroTotals {
  return {
    kcal: Math.round(m.kcal * n * 10) / 10,
    protein: Math.round(m.protein * n * 10) / 10,
    carbs: Math.round(m.carbs * n * 10) / 10,
    fat: Math.round(m.fat * n * 10) / 10
  }
}

function add(a: MacroTotals, b: MacroTotals): MacroTotals {
  return {
    kcal: a.kcal + b.kcal,
    protein: a.protein + b.protein,
    carbs: a.carbs + b.carbs,
    fat: a.fat + b.fat
  }
}

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Fuzzy match shopping name to a local Food. */
export function matchFood(name: string, foods: Food[], foodId?: string): Food | null {
  if (foodId) {
    const byId = foods.find((f) => f.id === foodId)
    if (byId) return byId
  }
  const q = normalizeName(name)
  if (!q) return null
  let best: Food | null = null
  let bestScore = 0
  for (const f of foods) {
    const fn = normalizeName(f.name)
    const brand = normalizeName(f.brand ?? '')
    let score = 0
    if (fn === q) score = 100
    else if (fn.includes(q) || q.includes(fn)) score = 70
    else {
      const qt = new Set(q.split(' '))
      const ft = fn.split(' ')
      const hit = ft.filter((t) => qt.has(t)).length
      if (hit > 0) score = 40 + hit * 10
    }
    if (brand && q.includes(brand)) score += 5
    if (score > bestScore) {
      bestScore = score
      best = f
    }
  }
  return bestScore >= 40 ? best : null
}

export type NutritionRef = {
  foodId?: string
  name: string
  servingLabel: string
  kcal: number
  protein: number
  carbs: number
  fat: number
}

/**
 * Simple heuristic: split daily kcal across matched items, with a boost for
 * higher protein-density foods so protein goal is approached.
 */
export function buildPortionPlan(
  items: ShoppingListItem[],
  foods: Food[],
  settings: AppSettings,
  days: number,
  offlineNutrition: Map<string, NutritionRef> = new Map()
): PortionPlan {
  const d = Math.max(1, Math.min(28, Math.round(days) || 7))
  const goalsPerDay: MacroTotals = {
    kcal: settings.calorieGoal,
    protein: settings.proteinGoalG,
    carbs: settings.carbsGoalG,
    fat: settings.fatGoalG
  }

  const active = items.filter((i) => !i.checked)
  type Row = {
    item: ShoppingListItem
    ref: NutritionRef | null
  }
  const rows: Row[] = active.map((item) => {
    const food = matchFood(item.name, foods, item.foodId)
    if (food) {
      return {
        item,
        ref: {
          foodId: food.id,
          name: food.name,
          servingLabel: food.servingLabel,
          kcal: food.kcal,
          protein: food.protein,
          carbs: food.carbs,
          fat: food.fat
        }
      }
    }
    const off = offlineNutrition.get(item.id)
    return { item, ref: off ?? null }
  })

  const matched = rows.filter((r) => r.ref && r.ref.kcal > 0)
  const unmatched = rows.filter((r) => !r.ref || r.ref.kcal <= 0)

  // Protein density weights
  const weights = matched.map((r) => {
    const ref = r.ref!
    const density = ref.kcal > 0 ? ref.protein / ref.kcal : 0
    return 1 + density * 8
  })
  const weightSum = weights.reduce((s, w) => s + w, 0) || 1

  const recommendations: PortionRecommendation[] = []

  matched.forEach((r, idx) => {
    const ref = r.ref!
    const share = weights[idx] / weightSum
    let targetKcal = goalsPerDay.kcal * share
    // Soft floor/ceiling so one item does not dominate
    targetKcal = Math.max(goalsPerDay.kcal * 0.05, Math.min(goalsPerDay.kcal * 0.35, targetKcal))
    let servingsPerDay = ref.kcal > 0 ? targetKcal / ref.kcal : 0
    servingsPerDay = Math.round(Math.max(0.25, Math.min(6, servingsPerDay)) * 4) / 4
    const perDay = scale(
      { kcal: ref.kcal, protein: ref.protein, carbs: ref.carbs, fat: ref.fat },
      servingsPerDay
    )
    recommendations.push({
      shoppingItemId: r.item.id,
      name: r.item.name,
      foodId: ref.foodId,
      matched: true,
      servingsPerDay,
      servingsForPeriod: Math.round(servingsPerDay * d * 4) / 4,
      servingLabel: ref.servingLabel,
      perDay,
      forPeriod: scale(perDay, d),
      note: ref.foodId
        ? `Linked to ${ref.name}`
        : `Nutrition from online lookup (${ref.servingLabel})`
    })
  })

  for (const r of unmatched) {
    recommendations.push({
      shoppingItemId: r.item.id,
      name: r.item.name,
      foodId: r.item.foodId,
      matched: false,
      servingsPerDay: 0,
      servingsForPeriod: 0,
      servingLabel: r.item.unit || '—',
      perDay: zero(),
      forPeriod: zero(),
      note: 'Unknown nutrition — link a Food or import online'
    })
  }

  // Keep shopping list order
  const order = new Map(active.map((i, idx) => [i.id, idx]))
  recommendations.sort(
    (a, b) => (order.get(a.shoppingItemId) ?? 0) - (order.get(b.shoppingItemId) ?? 0)
  )

  const totalsPerDay = recommendations.reduce((acc, r) => add(acc, r.perDay), zero())
  const totalsPeriod = scale(totalsPerDay, d)

  return {
    days: d,
    goalsPerDay,
    items: recommendations,
    totalsPerDay,
    totalsPeriod,
    unmatchedCount: unmatched.length
  }
}