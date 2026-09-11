import type {
  AppSettings,
  DiaryEntry,
  Food,
  MacroBalance,
  MacroTotals,
  MacroVsGoal,
  MealBreakdown,
  MealType,
  MineralKey,
  MineralMap,
  NutritionAnalysis,
  NutritionInsight,
  ShoppingListItem,
  TopFoodContribution
} from '../shared/types'
import {
  MINERAL_KEYS,
  MINERAL_META,
  addMinerals,
  defaultMineralGoals,
  hasAnyMineral,
  roundMineral,
  scaleMineralMap,
  scaleMinerals
} from '../shared/minerals'

function zero(): MacroTotals {
  return { kcal: 0, protein: 0, carbs: 0, fat: 0 }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function round0(n: number): number {
  return Math.round(n)
}

function scale(m: MacroTotals, n: number): MacroTotals {
  return {
    kcal: round1(m.kcal * n),
    protein: round1(m.protein * n),
    carbs: round1(m.carbs * n),
    fat: round1(m.fat * n)
  }
}

function sumEntries(entries: DiaryEntry[]): MacroTotals {
  return entries.reduce(
    (acc, e) => ({
      kcal: acc.kcal + e.kcal,
      protein: acc.protein + e.protein,
      carbs: acc.carbs + e.carbs,
      fat: acc.fat + e.fat
    }),
    zero()
  )
}

function entryMinerals(e: DiaryEntry, foodsById: Map<string, Food>): MineralMap | undefined {
  if (hasAnyMineral(e.minerals)) return e.minerals
  if (e.foodId) {
    const food = foodsById.get(e.foodId)
    if (food?.minerals) return scaleMinerals(food.minerals, e.servingQty || 1)
  }
  return undefined
}

function sumMinerals(entries: DiaryEntry[], foodsById: Map<string, Food>): {
  totals: MineralMap
  withData: number
} {
  let totals: MineralMap = {}
  let withData = 0
  for (const e of entries) {
    const m = entryMinerals(e, foodsById)
    if (hasAnyMineral(m)) {
      withData++
      totals = addMinerals(totals, m)
    }
  }
  return { totals, withData }
}

function resolveMineralGoals(settings: AppSettings): Record<MineralKey, number> {
  const defaults = defaultMineralGoals()
  const patch = settings.mineralGoals ?? {}
  const out = { ...defaults }
  for (const key of MINERAL_KEYS) {
    const v = patch[key]
    if (v !== undefined && Number.isFinite(v) && v >= 0) out[key] = v
  }
  return out
}

function parseIso(date: string): Date {
  const [y, m, d] = date.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

function toIso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function shiftDays(iso: string, delta: number): string {
  const d = parseIso(iso)
  d.setDate(d.getDate() + delta)
  return toIso(d)
}

function vsGoal(actual: number, goal: number): MacroVsGoal {
  const g = goal > 0 ? goal : 0
  const pct = g > 0 ? round1((actual / g) * 100) : 0
  return {
    actual: roundMineral(actual),
    goal: g,
    pctOfGoal: pct,
    remaining: roundMineral(g - actual)
  }
}

function macroBalance(totals: MacroTotals): MacroBalance {
  const pKcal = totals.protein * 4
  const cKcal = totals.carbs * 4
  const fKcal = totals.fat * 9
  const sum = pKcal + cKcal + fKcal
  if (sum <= 0) {
    return { proteinPct: 0, carbsPct: 0, fatPct: 0 }
  }
  return {
    proteinPct: round1((pKcal / sum) * 100),
    carbsPct: round1((cKcal / sum) * 100),
    fatPct: round1((fKcal / sum) * 100)
  }
}

function mealBreakdown(entries: DiaryEntry[]): MealBreakdown {
  const meals: MealType[] = ['breakfast', 'lunch', 'dinner', 'snacks']
  const out: MealBreakdown = {
    breakfast: zero(),
    lunch: zero(),
    dinner: zero(),
    snacks: zero()
  }
  for (const meal of meals) {
    out[meal] = sumEntries(entries.filter((e) => e.meal === meal))
  }
  return out
}

function topFoods(entries: DiaryEntry[], limit = 8): TopFoodContribution[] {
  const map = new Map<string, { kcal: number; entries: number }>()
  for (const e of entries) {
    const key = e.name.trim() || 'Unknown'
    const cur = map.get(key) ?? { kcal: 0, entries: 0 }
    cur.kcal += e.kcal
    cur.entries += 1
    map.set(key, cur)
  }
  const totalKcal = [...map.values()].reduce((s, v) => s + v.kcal, 0)
  return [...map.entries()]
    .map(([name, v]) => ({
      name,
      kcal: round1(v.kcal),
      pctOfTotal: totalKcal > 0 ? round1((v.kcal / totalKcal) * 100) : 0,
      entries: v.entries
    }))
    .sort((a, b) => b.kcal - a.kcal)
    .slice(0, limit)
}

function buildMineralInsights(
  compare: MineralMap,
  goals: Record<MineralKey, number>,
  coveragePct: number,
  entryCount: number
): NutritionInsight[] {
  const tips: NutritionInsight[] = []
  if (entryCount === 0) return tips

  if (coveragePct < 50 && entryCount > 0) {
    tips.push({
      id: 'mineral-coverage-low',
      severity: 'info',
      message: `Only ${round0(coveragePct)}% of diary entries have mineral data. Import foods with minerals or re-log from the food database for fuller analysis.`
    })
  }

  const sodium = compare.sodium ?? 0
  const sodiumGoal = goals.sodium
  if (sodiumGoal > 0 && sodium > sodiumGoal * 1.1) {
    tips.push({
      id: 'sodium-high',
      severity: 'warn',
      message: `Sodium is high (${round0(sodium)} / ${sodiumGoal} mg). Cut back on salty snacks, processed foods, and added salt.`
    })
  }

  for (const key of ['iron', 'calcium', 'potassium', 'magnesium', 'zinc', 'iodine'] as MineralKey[]) {
    const actual = compare[key] ?? 0
    const goal = goals[key]
    if (goal <= 0) continue
    const pct = (actual / goal) * 100
    if (pct < 70 && coveragePct >= 30) {
      const meta = MINERAL_META[key]
      tips.push({
        id: `${key}-low`,
        severity: 'warn',
        message: `${meta.label} is low (${round0(pct)}% of goal: ${roundMineral(actual)} / ${goal} ${meta.unit}). Consider foods rich in ${meta.label.toLowerCase()}.`
      })
    }
  }

  return tips
}

function buildInsights(
  days: number,
  compare: MacroTotals,
  settings: AppSettings,
  meals: MealBreakdown | null,
  daysWithEntries: number,
  entryCount: number,
  mineralCompare: MineralMap,
  mineralGoals: Record<MineralKey, number>,
  coveragePct: number
): NutritionInsight[] {
  const tips: NutritionInsight[] = []
  const kcalGoal = settings.calorieGoal
  const proteinGoal = settings.proteinGoalG
  const carbsGoal = settings.carbsGoalG
  const fatGoal = settings.fatGoalG

  if (entryCount === 0) {
    tips.push({
      id: 'no-entries',
      severity: 'info',
      message:
        days === 1
          ? 'No diary entries for this day yet. Log meals in Diary to see analysis.'
          : 'No diary entries in this range. Log meals to unlock nutrition insights.'
    })
    return tips
  }

  if (days > 1 && daysWithEntries < days) {
    tips.push({
      id: 'sparse-logging',
      severity: 'info',
      message: `Logged on ${daysWithEntries} of ${days} days. Averages include empty days, so they may look low.`
    })
  }

  const proteinPct = proteinGoal > 0 ? (compare.protein / proteinGoal) * 100 : 100
  if (proteinPct < 80) {
    tips.push({
      id: 'protein-low',
      severity: 'warn',
      message: `Protein is at ${round0(proteinPct)}% of goal (${round0(compare.protein)} / ${proteinGoal} g). Aim closer to your target for satiety and recovery.`
    })
  } else if (proteinPct >= 90 && proteinPct <= 110) {
    tips.push({
      id: 'protein-good',
      severity: 'good',
      message: `Protein looks on track (${round0(proteinPct)}% of goal).`
    })
  }

  const kcalPct = kcalGoal > 0 ? (compare.kcal / kcalGoal) * 100 : 100
  if (kcalPct > 110) {
    tips.push({
      id: 'kcal-high',
      severity: 'warn',
      message: `Calories are ${round0(kcalPct)}% of goal (${round0(compare.kcal)} / ${kcalGoal} kcal). Consider lighter snacks or smaller portions.`
    })
  } else if (kcalPct < 70 && entryCount > 0) {
    tips.push({
      id: 'kcal-low',
      severity: 'info',
      message: `Calories are only ${round0(kcalPct)}% of goal. If this is intentional (e.g. incomplete logging), ignore; otherwise add a balanced snack.`
    })
  } else if (kcalPct >= 85 && kcalPct <= 105) {
    tips.push({
      id: 'kcal-good',
      severity: 'good',
      message: `Calories are close to goal (${round0(kcalPct)}%).`
    })
  }

  if (carbsGoal > 0) {
    const carbsPct = (compare.carbs / carbsGoal) * 100
    if (carbsPct > 120) {
      tips.push({
        id: 'carbs-high',
        severity: 'warn',
        message: `Carbs are ${round0(carbsPct)}% of goal. Swap some refined carbs for veg or protein if you want to rebalance.`
      })
    }
  }

  if (fatGoal > 0) {
    const fatPct = (compare.fat / fatGoal) * 100
    if (fatPct > 120) {
      tips.push({
        id: 'fat-high',
        severity: 'warn',
        message: `Fat is ${round0(fatPct)}% of goal. Watch oils, nuts, and cheese portions.`
      })
    }
  }

  if (meals && days === 1) {
    const mealKcal = [
      { meal: 'breakfast', kcal: meals.breakfast.kcal },
      { meal: 'lunch', kcal: meals.lunch.kcal },
      { meal: 'dinner', kcal: meals.dinner.kcal },
      { meal: 'snacks', kcal: meals.snacks.kcal }
    ]
    const dayKcal = mealKcal.reduce((s, m) => s + m.kcal, 0)
    if (dayKcal > 0) {
      const nonempty = mealKcal.filter((m) => m.kcal > 0)
      const heaviest = [...mealKcal].sort((a, b) => b.kcal - a.kcal)[0]
      if (heaviest && heaviest.kcal / dayKcal >= 0.55) {
        tips.push({
          id: 'meal-skew',
          severity: 'warn',
          message: `${heaviest.meal.charAt(0).toUpperCase()}${heaviest.meal.slice(1)} has ${round0(
            (heaviest.kcal / dayKcal) * 100
          )}% of today's calories. Spreading intake across meals can help energy and hunger.`
        })
      }
      const mainEmpty = ['breakfast', 'lunch', 'dinner'].filter(
        (m) => (meals[m as keyof MealBreakdown] as MacroTotals).kcal <= 0
      )
      if (mainEmpty.length >= 2 && nonempty.length >= 1) {
        tips.push({
          id: 'meals-missing',
          severity: 'info',
          message: `Only ${nonempty.length} meal slot(s) logged. Logging breakfast, lunch, and dinner gives a clearer picture.`
        })
      }
      if (meals.snacks.kcal > dayKcal * 0.35 && dayKcal > 0) {
        tips.push({
          id: 'snacks-heavy',
          severity: 'info',
          message: `Snacks are ${round0((meals.snacks.kcal / dayKcal) * 100)}% of today's calories. Fine if planned — otherwise fold some into main meals.`
        })
      }
    }
  }

  tips.push(...buildMineralInsights(mineralCompare, mineralGoals, coveragePct, entryCount))

  if (tips.length === 0) {
    tips.push({
      id: 'balanced',
      severity: 'good',
      message: 'No major flags — macros look reasonably balanced versus your goals.'
    })
  }

  return tips
}

export type AnalyzeNutritionOpts = {
  date: string
  days?: number
}

/**
 * Diary-based nutrition analysis for a selected end date and window (1 / 7 / 14 / 30).
 * Shopping portion plans are not persisted, so analysis does not use them.
 * Minerals come from diary entry snapshots, or foodId × qty when the entry lacks minerals.
 */
export function analyzeNutrition(
  diaryEntries: DiaryEntry[],
  settings: AppSettings,
  shoppingList: ShoppingListItem[],
  opts: AnalyzeNutritionOpts,
  foods: Food[] = []
): NutritionAnalysis {
  const end = (opts.date || '').slice(0, 10)
  const daysRaw = opts.days ?? 1
  const days = [1, 7, 14, 30].includes(daysRaw) ? daysRaw : 1
  const rangeEnd = end
  const rangeStart = days === 1 ? end : shiftDays(end, -(days - 1))

  const foodsById = new Map(foods.map((f) => [f.id, f]))

  const inRange = diaryEntries.filter((e) => {
    const d = e.date.slice(0, 10)
    return d >= rangeStart && d <= rangeEnd
  })

  const daySet = new Set(inRange.map((e) => e.date.slice(0, 10)))
  const totals = sumEntries(inRange)
  const averagePerDay = scale(totals, 1 / days)
  const compare = days === 1 ? totals : averagePerDay

  const vsGoals = {
    kcal: vsGoal(compare.kcal, settings.calorieGoal),
    protein: vsGoal(compare.protein, settings.proteinGoalG),
    carbs: vsGoal(compare.carbs, settings.carbsGoalG),
    fat: vsGoal(compare.fat, settings.fatGoalG)
  }

  const { totals: mineralTotalsRaw, withData } = sumMinerals(inRange, foodsById)
  const mineralAveragePerDay = scaleMineralMap(mineralTotalsRaw, 1 / days)
  const mineralCompare = days === 1 ? mineralTotalsRaw : mineralAveragePerDay
  const mineralGoals = resolveMineralGoals(settings)
  const vsMineralGoals: Partial<Record<MineralKey, MacroVsGoal>> = {}
  for (const key of MINERAL_KEYS) {
    vsMineralGoals[key] = vsGoal(mineralCompare[key] ?? 0, mineralGoals[key])
  }
  const coveragePct =
    inRange.length > 0 ? round1((withData / inRange.length) * 100) : 0

  const meals = days === 1 ? mealBreakdown(inRange) : null
  const balance = macroBalance(totals)
  const foodsTop = topFoods(inRange)
  const insights = buildInsights(
    days,
    compare,
    settings,
    meals,
    daySet.size,
    inRange.length,
    mineralCompare,
    mineralGoals,
    coveragePct
  )

  const notes: string[] = []
  const openShopping = shoppingList.filter((i) => !i.checked)
  if (openShopping.length > 0) {
    notes.push(
      `Shopping list has ${openShopping.length} open item(s), but portion plans are not persisted — this analysis is diary-based only.`
    )
  }
  if (inRange.length > 0) {
    notes.push(
      `Mineral data coverage: ${withData}/${inRange.length} entries (${round0(coveragePct)}%). Totals only include foods with known mineral values.`
    )
  }

  return {
    date: end,
    days,
    rangeStart,
    rangeEnd,
    daysWithEntries: daySet.size,
    entryCount: inRange.length,
    totals: {
      kcal: round1(totals.kcal),
      protein: round1(totals.protein),
      carbs: round1(totals.carbs),
      fat: round1(totals.fat)
    },
    averagePerDay,
    vsGoals,
    macroBalance: balance,
    mealBreakdown: meals
      ? {
          breakfast: {
            kcal: round1(meals.breakfast.kcal),
            protein: round1(meals.breakfast.protein),
            carbs: round1(meals.breakfast.carbs),
            fat: round1(meals.breakfast.fat)
          },
          lunch: {
            kcal: round1(meals.lunch.kcal),
            protein: round1(meals.lunch.protein),
            carbs: round1(meals.lunch.carbs),
            fat: round1(meals.lunch.fat)
          },
          dinner: {
            kcal: round1(meals.dinner.kcal),
            protein: round1(meals.dinner.protein),
            carbs: round1(meals.dinner.carbs),
            fat: round1(meals.dinner.fat)
          },
          snacks: {
            kcal: round1(meals.snacks.kcal),
            protein: round1(meals.snacks.protein),
            carbs: round1(meals.snacks.carbs),
            fat: round1(meals.snacks.fat)
          }
        }
      : null,
    topFoods: foodsTop,
    insights,
    notes,
    mineralTotals: mineralTotalsRaw,
    mineralAveragePerDay,
    vsMineralGoals,
    mineralCoverage: {
      entriesWithData: withData,
      entryCount: inRange.length,
      pct: coveragePct
    }
  }
}
