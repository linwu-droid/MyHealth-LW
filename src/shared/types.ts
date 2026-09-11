import type { MineralKey, MineralMap } from './minerals'
export type { MineralKey, MineralMap } from './minerals'
export { MINERAL_KEYS, MINERAL_META, defaultMineralGoals } from './minerals'

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snacks'

export type WeightUnit = 'kg' | 'lb'

export interface AppSettings {
  displayName: string
  calorieGoal: number
  proteinGoalG: number
  carbsGoalG: number
  fatGoalG: number
  weightUnit: WeightUnit
  /** Daily mineral goals (mg unless selenium/iodine ug). Partial overrides OK. */
  mineralGoals?: Partial<Record<MineralKey, number>>
}

export interface Food {
  id: string
  name: string
  brand?: string
  servingLabel: string
  kcal: number
  protein: number
  carbs: number
  fat: number
  /** Per-serving minerals (mg; selenium/iodine in ug). */
  minerals?: MineralMap
}

export interface DiaryEntry {
  id: string
  date: string
  meal: MealType
  foodId?: string
  name: string
  servingQty: number
  kcal: number
  protein: number
  carbs: number
  fat: number
  /** Minerals for this entry (food per-serving x qty), when known. */
  minerals?: MineralMap
}

export interface WeightLog {
  id: string
  date: string
  kg: number
}

export interface Exercise {
  id: string
  date: string
  name: string
  minutes?: number
  kcal: number
}

export interface ShoppingListItem {
  id: string
  name: string
  quantity?: number
  unit?: string
  notes?: string
  foodId?: string
  checked?: boolean
  createdAt: string
}

export interface AppData {
  version: number
  settings: AppSettings
  foods: Food[]
  diaryEntries: DiaryEntry[]
  weightLogs: WeightLog[]
  exercises: Exercise[]
  shoppingList: ShoppingListItem[]
}

export interface MacroTotals {
  kcal: number
  protein: number
  carbs: number
  fat: number
}

export interface DashboardSummary {
  date: string
  eaten: MacroTotals
  exerciseKcal: number
  remainingKcal: number
  calorieGoal: number
  proteinGoalG: number
  carbsGoalG: number
  fatGoalG: number
  latestWeightKg: number | null
  previousWeightKg: number | null
  entryCount: number
  exerciseCount: number
}

export type OnlineFoodCandidate = Omit<Food, 'id'> & {
  sourceId: string
  source: 'openfoodfacts'
}

/** Main meals used for shopping portion planning (snacks excluded). */
export type MainMealType = 'breakfast' | 'lunch' | 'dinner'

export interface MealMacroSplit {
  breakfast: MacroTotals
  lunch: MacroTotals
  dinner: MacroTotals
}

export interface MealServings {
  breakfast: number
  lunch: number
  dinner: number
}

export interface PortionRecommendation {
  shoppingItemId: string
  name: string
  foodId?: string
  matched: boolean
  servingsPerDay: number
  servingsForPeriod: number
  servingLabel: string
  /** Servings allocated to each main meal (sums ≈ servingsPerDay). */
  servingsByMeal: MealServings
  /** Which meal(s) this item is suggested for. */
  suggestedMeals: MainMealType[]
  perDay: MacroTotals
  forPeriod: MacroTotals
  note?: string
}

export interface PortionPlan {
  days: number
  /** Fraction of daily goals per meal (e.g. 0.3 / 0.35 / 0.35). */
  mealSplit: { breakfast: number; lunch: number; dinner: number }
  goalsPerDay: MacroTotals
  goalsPerMeal: MealMacroSplit
  items: PortionRecommendation[]
  totalsPerDay: MacroTotals
  totalsPerMeal: MealMacroSplit
  totalsPeriod: MacroTotals
  unmatchedCount: number
}

/** Macro actual vs Settings goal (daily for single day; avg/day for ranges). */
export interface MacroVsGoal {
  actual: number
  goal: number
  pctOfGoal: number
  /** Positive = remaining under goal; negative = over. */
  remaining: number
}

export interface MacroBalance {
  /** % of kcal from protein (4 kcal/g). */
  proteinPct: number
  /** % of kcal from carbs (4 kcal/g). */
  carbsPct: number
  /** % of kcal from fat (9 kcal/g). */
  fatPct: number
}

export interface MealBreakdown {
  breakfast: MacroTotals
  lunch: MacroTotals
  dinner: MacroTotals
  snacks: MacroTotals
}

export interface TopFoodContribution {
  name: string
  kcal: number
  pctOfTotal: number
  entries: number
}

export type NutritionInsightSeverity = 'info' | 'warn' | 'good'

export interface NutritionInsight {
  id: string
  severity: NutritionInsightSeverity
  message: string
}

export interface MineralCoverage {
  /** Diary entries in range that contributed any mineral data. */
  entriesWithData: number
  entryCount: number
  /** 0-100 */
  pct: number
}

export interface NutritionAnalysis {
  /** End date of the window (YYYY-MM-DD). */
  date: string
  /** Window length: 1 (today/selected day), 7, 14, or 30. */
  days: number
  rangeStart: string
  rangeEnd: string
  daysWithEntries: number
  entryCount: number
  totals: MacroTotals
  /** Totals ÷ days in window (includes zero days). */
  averagePerDay: MacroTotals
  /** Compared against daily goals (actual = day total or averagePerDay). */
  vsGoals: {
    kcal: MacroVsGoal
    protein: MacroVsGoal
    carbs: MacroVsGoal
    fat: MacroVsGoal
  }
  macroBalance: MacroBalance
  /** Present when days === 1. */
  mealBreakdown: MealBreakdown | null
  topFoods: TopFoodContribution[]
  insights: NutritionInsight[]
  notes: string[]
  /** Period mineral totals (mg / ug). */
  mineralTotals: MineralMap
  /** Mineral totals ÷ days in window. */
  mineralAveragePerDay: MineralMap
  /** Compared against daily mineral goals. */
  vsMineralGoals: Partial<Record<MineralKey, MacroVsGoal>>
  /** How many diary entries had mineral data. */
  mineralCoverage: MineralCoverage
}
