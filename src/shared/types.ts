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

export interface AppData {
  version: number
  settings: AppSettings
  foods: Food[]
  diaryEntries: DiaryEntry[]
  weightLogs: WeightLog[]
  exercises: Exercise[]
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
