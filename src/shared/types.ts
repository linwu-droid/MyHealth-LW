export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snacks'

export type WeightUnit = 'kg' | 'lb'

export interface AppSettings {
  displayName: string
  calorieGoal: number
  proteinGoalG: number
  carbsGoalG: number
  fatGoalG: number
  weightUnit: WeightUnit
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
