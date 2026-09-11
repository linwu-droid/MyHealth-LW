import { app, dialog, BrowserWindow } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import type {
  AppData,
  AppSettings,
  DashboardSummary,
  DiaryEntry,
  Exercise,
  Food,
  MacroTotals,
  MealType,
  PortionPlan,
  ShoppingListItem,
  WeightLog
} from '../shared/types'
import { buildPortionPlan, type NutritionRef } from './portions'

const STORE_FILE = 'myhealth-lw.json'
const DATA_VERSION = 2

function defaultSettings(): AppSettings {
  return {
    displayName: '',
    calorieGoal: 2000,
    proteinGoalG: 150,
    carbsGoalG: 200,
    fatGoalG: 65,
    weightUnit: 'kg'
  }
}

function seedFoods(): Food[] {
  const items: Omit<Food, 'id'>[] = [
    { name: 'Chicken breast, grilled', brand: '', servingLabel: '100 g', kcal: 165, protein: 31, carbs: 0, fat: 3.6 },
    { name: 'Egg, large', brand: '', servingLabel: '1 egg (50 g)', kcal: 72, protein: 6.3, carbs: 0.4, fat: 4.8 },
    { name: 'Whole milk', brand: '', servingLabel: '250 ml', kcal: 149, protein: 7.7, carbs: 12, fat: 8 },
    { name: 'Greek yogurt, plain', brand: '', servingLabel: '170 g', kcal: 100, protein: 17, carbs: 6, fat: 0.7 },
    { name: 'Oats, dry', brand: '', servingLabel: '40 g', kcal: 152, protein: 5.3, carbs: 27, fat: 2.7 },
    { name: 'Banana', brand: '', servingLabel: '1 medium (118 g)', kcal: 105, protein: 1.3, carbs: 27, fat: 0.4 },
    { name: 'Apple', brand: '', servingLabel: '1 medium (182 g)', kcal: 95, protein: 0.5, carbs: 25, fat: 0.3 },
    { name: 'Broccoli, steamed', brand: '', servingLabel: '100 g', kcal: 35, protein: 2.4, carbs: 7, fat: 0.4 },
    { name: 'Brown rice, cooked', brand: '', servingLabel: '1 cup (195 g)', kcal: 215, protein: 5, carbs: 45, fat: 1.6 },
    { name: 'White rice, cooked', brand: '', servingLabel: '1 cup (158 g)', kcal: 205, protein: 4.3, carbs: 45, fat: 0.4 },
    { name: 'Salmon, baked', brand: '', servingLabel: '100 g', kcal: 208, protein: 20, carbs: 0, fat: 13 },
    { name: 'Tuna, canned in water', brand: '', servingLabel: '1 can drained (165 g)', kcal: 191, protein: 42, carbs: 0, fat: 1.4 },
    { name: 'Whole wheat bread', brand: '', servingLabel: '1 slice (28 g)', kcal: 69, protein: 3.6, carbs: 12, fat: 1.1 },
    { name: 'Peanut butter', brand: '', servingLabel: '1 tbsp (16 g)', kcal: 94, protein: 4, carbs: 3.1, fat: 8 },
    { name: 'Almonds', brand: '', servingLabel: '28 g (about 23)', kcal: 164, protein: 6, carbs: 6, fat: 14 },
    { name: 'Avocado', brand: '', servingLabel: '1/2 fruit (68 g)', kcal: 114, protein: 1.3, carbs: 6, fat: 10.5 },
    { name: 'Sweet potato, baked', brand: '', servingLabel: '100 g', kcal: 90, protein: 2, carbs: 21, fat: 0.2 },
    { name: 'Potato, baked', brand: '', servingLabel: '1 medium (173 g)', kcal: 161, protein: 4.3, carbs: 37, fat: 0.2 },
    { name: 'Cheddar cheese', brand: '', servingLabel: '28 g', kcal: 113, protein: 7, carbs: 0.4, fat: 9.3 },
    { name: 'Olive oil', brand: '', servingLabel: '1 tbsp (14 g)', kcal: 119, protein: 0, carbs: 0, fat: 13.5 },
    { name: 'Pasta, cooked', brand: '', servingLabel: '1 cup (140 g)', kcal: 220, protein: 8, carbs: 43, fat: 1.3 },
    { name: 'Black beans, cooked', brand: '', servingLabel: '1/2 cup (86 g)', kcal: 114, protein: 7.6, carbs: 20, fat: 0.5 },
    { name: 'Quinoa, cooked', brand: '', servingLabel: '1 cup (185 g)', kcal: 222, protein: 8, carbs: 39, fat: 3.6 },
    { name: 'Whey protein shake', brand: '', servingLabel: '1 scoop (30 g)', kcal: 120, protein: 24, carbs: 3, fat: 1.5 },
    { name: 'Coffee, black', brand: '', servingLabel: '1 cup (240 ml)', kcal: 2, protein: 0.3, carbs: 0, fat: 0 },
    { name: 'Orange juice', brand: '', servingLabel: '250 ml', kcal: 112, protein: 1.7, carbs: 26, fat: 0.5 }
  ]
  return items.map((f) => ({ ...f, id: randomUUID() }))
}

function emptyData(): AppData {
  return {
    version: DATA_VERSION,
    settings: defaultSettings(),
    foods: seedFoods(),
    diaryEntries: [],
    weightLogs: [],
    exercises: [],
    shoppingList: []
  }
}

function dataPath(): string {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, STORE_FILE)
}

let cache: AppData | null = null

function load(): AppData {
  if (cache) return cache
  const path = dataPath()
  if (!existsSync(path)) {
    cache = emptyData()
    save(cache)
    return cache
  }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as AppData
    cache = {
      version: DATA_VERSION,
      settings: { ...defaultSettings(), ...(raw.settings ?? {}) },
      foods: Array.isArray(raw.foods) ? raw.foods : seedFoods(),
      diaryEntries: Array.isArray(raw.diaryEntries) ? raw.diaryEntries : [],
      weightLogs: Array.isArray(raw.weightLogs) ? raw.weightLogs : [],
      exercises: Array.isArray(raw.exercises) ? raw.exercises : [],
      shoppingList: Array.isArray(raw.shoppingList) ? raw.shoppingList : []
    }
  } catch {
    cache = emptyData()
    save(cache)
  }
  return cache
}

function save(data: AppData): void {
  cache = data
  writeFileSync(dataPath(), JSON.stringify(data, null, 2), 'utf8')
}

function zeroMacros(): MacroTotals {
  return { kcal: 0, protein: 0, carbs: 0, fat: 0 }
}

function sumEntries(entries: DiaryEntry[]): MacroTotals {
  return entries.reduce(
    (acc, e) => ({
      kcal: acc.kcal + e.kcal,
      protein: acc.protein + e.protein,
      carbs: acc.carbs + e.carbs,
      fat: acc.fat + e.fat
    }),
    zeroMacros()
  )
}

export function getSettings(): AppSettings {
  return { ...load().settings }
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const data = load()
  data.settings = { ...data.settings, ...patch }
  save(data)
  return { ...data.settings }
}

export function listFoods(query?: string): Food[] {
  const foods = [...load().foods].sort((a, b) => a.name.localeCompare(b.name))
  if (!query || !query.trim()) return foods
  const q = query.trim().toLowerCase()
  return foods.filter(
    (f) =>
      f.name.toLowerCase().includes(q) ||
      (f.brand ?? '').toLowerCase().includes(q)
  )
}

export function createFood(input: Omit<Food, 'id'>): Food {
  const data = load()
  const food: Food = {
    id: randomUUID(),
    name: input.name.trim(),
    brand: input.brand?.trim() || undefined,
    servingLabel: input.servingLabel.trim() || '1 serving',
    kcal: Number(input.kcal) || 0,
    protein: Number(input.protein) || 0,
    carbs: Number(input.carbs) || 0,
    fat: Number(input.fat) || 0
  }
  data.foods.push(food)
  save(data)
  return food
}

export function createFoodsBulk(
  inputs: Omit<Food, 'id'>[]
): { created: number; skipped: number; foods: Food[] } {
  const data = load()
  const existing = new Set(
    data.foods.map(
      (f) => `${f.name.toLowerCase()}|${(f.brand ?? '').toLowerCase()}`
    )
  )
  const created: Food[] = []
  let skipped = 0
  for (const input of inputs) {
    const name = input.name.trim()
    if (!name) {
      skipped++
      continue
    }
    const brand = input.brand?.trim() || undefined
    const key = `${name.toLowerCase()}|${(brand ?? '').toLowerCase()}`
    if (existing.has(key)) {
      skipped++
      continue
    }
    const food: Food = {
      id: randomUUID(),
      name,
      brand,
      servingLabel: input.servingLabel.trim() || '1 serving',
      kcal: Number(input.kcal) || 0,
      protein: Number(input.protein) || 0,
      carbs: Number(input.carbs) || 0,
      fat: Number(input.fat) || 0
    }
    data.foods.push(food)
    existing.add(key)
    created.push(food)
  }
  if (created.length > 0) save(data)
  return { created: created.length, skipped, foods: created }
}

export function updateFood(id: string, patch: Partial<Omit<Food, 'id'>>): Food | null {
  const data = load()
  const idx = data.foods.findIndex((f) => f.id === id)
  if (idx < 0) return null
  const cur = data.foods[idx]
  data.foods[idx] = {
    ...cur,
    ...patch,
    name: patch.name !== undefined ? patch.name.trim() : cur.name,
    brand:
      patch.brand !== undefined
        ? patch.brand.trim() || undefined
        : cur.brand,
    servingLabel:
      patch.servingLabel !== undefined
        ? patch.servingLabel.trim() || '1 serving'
        : cur.servingLabel
  }
  save(data)
  return data.foods[idx]
}

export function deleteFood(id: string): { deleted: boolean } {
  const data = load()
  const before = data.foods.length
  data.foods = data.foods.filter((f) => f.id !== id)
  save(data)
  return { deleted: data.foods.length < before }
}

export function listDiary(date?: string): DiaryEntry[] {
  const entries = load().diaryEntries
  const filtered = date ? entries.filter((e) => e.date === date) : entries
  return [...filtered].sort((a, b) => {
    const mealOrder: Record<MealType, number> = {
      breakfast: 0,
      lunch: 1,
      dinner: 2,
      snacks: 3
    }
    const m = mealOrder[a.meal] - mealOrder[b.meal]
    if (m !== 0) return m
    return a.name.localeCompare(b.name)
  })
}

export function addDiary(
  input: Omit<DiaryEntry, 'id'> & { id?: string }
): DiaryEntry {
  const data = load()
  const entry: DiaryEntry = {
    id: randomUUID(),
    date: input.date.slice(0, 10),
    meal: input.meal,
    foodId: input.foodId,
    name: input.name.trim(),
    servingQty: Number(input.servingQty) || 1,
    kcal: Number(input.kcal) || 0,
    protein: Number(input.protein) || 0,
    carbs: Number(input.carbs) || 0,
    fat: Number(input.fat) || 0
  }
  data.diaryEntries.push(entry)
  save(data)
  return entry
}

export function updateDiary(
  id: string,
  patch: Partial<Omit<DiaryEntry, 'id'>>
): DiaryEntry | null {
  const data = load()
  const idx = data.diaryEntries.findIndex((e) => e.id === id)
  if (idx < 0) return null
  const cur = data.diaryEntries[idx]
  data.diaryEntries[idx] = {
    ...cur,
    ...patch,
    date: patch.date !== undefined ? patch.date.slice(0, 10) : cur.date,
    name: patch.name !== undefined ? patch.name.trim() : cur.name
  }
  save(data)
  return data.diaryEntries[idx]
}

export function deleteDiary(id: string): { deleted: boolean } {
  const data = load()
  const before = data.diaryEntries.length
  data.diaryEntries = data.diaryEntries.filter((e) => e.id !== id)
  save(data)
  return { deleted: data.diaryEntries.length < before }
}

export function listWeight(): WeightLog[] {
  return [...load().weightLogs].sort((a, b) => b.date.localeCompare(a.date))
}

export function addWeight(input: { date: string; kg: number }): WeightLog {
  const data = load()
  const log: WeightLog = {
    id: randomUUID(),
    date: input.date.slice(0, 10),
    kg: Number(input.kg) || 0
  }
  data.weightLogs.push(log)
  save(data)
  return log
}

export function deleteWeight(id: string): { deleted: boolean } {
  const data = load()
  const before = data.weightLogs.length
  data.weightLogs = data.weightLogs.filter((w) => w.id !== id)
  save(data)
  return { deleted: data.weightLogs.length < before }
}

export function listExercise(date?: string): Exercise[] {
  const items = load().exercises
  const filtered = date ? items.filter((e) => e.date === date) : items
  return [...filtered].sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name))
}

export function addExercise(
  input: Omit<Exercise, 'id'>
): Exercise {
  const data = load()
  const ex: Exercise = {
    id: randomUUID(),
    date: input.date.slice(0, 10),
    name: input.name.trim(),
    minutes: input.minutes !== undefined && input.minutes !== null ? Number(input.minutes) : undefined,
    kcal: Number(input.kcal) || 0
  }
  data.exercises.push(ex)
  save(data)
  return ex
}

export function deleteExercise(id: string): { deleted: boolean } {
  const data = load()
  const before = data.exercises.length
  data.exercises = data.exercises.filter((e) => e.id !== id)
  save(data)
  return { deleted: data.exercises.length < before }
}

export function getDashboard(date: string): DashboardSummary {
  const data = load()
  const day = date.slice(0, 10)
  const dayEntries = data.diaryEntries.filter((e) => e.date === day)
  const dayExercises = data.exercises.filter((e) => e.date === day)
  const eaten = sumEntries(dayEntries)
  const exerciseKcal = dayExercises.reduce((s, e) => s + e.kcal, 0)
  const weights = [...data.weightLogs].sort((a, b) => b.date.localeCompare(a.date))
  return {
    date: day,
    eaten,
    exerciseKcal,
    remainingKcal: data.settings.calorieGoal - eaten.kcal + exerciseKcal,
    calorieGoal: data.settings.calorieGoal,
    proteinGoalG: data.settings.proteinGoalG,
    carbsGoalG: data.settings.carbsGoalG,
    fatGoalG: data.settings.fatGoalG,
    latestWeightKg: weights[0]?.kg ?? null,
    previousWeightKg: weights[1]?.kg ?? null,
    entryCount: dayEntries.length,
    exerciseCount: dayExercises.length
  }
}



export function listShopping(): ShoppingListItem[] {
  return [...load().shoppingList].sort((a, b) => {
    const ac = a.checked ? 1 : 0
    const bc = b.checked ? 1 : 0
    if (ac !== bc) return ac - bc
    return (b.createdAt || '').localeCompare(a.createdAt || '')
  })
}

export function addShopping(
  input: { name: string; quantity?: number; unit?: string; notes?: string; foodId?: string }
): ShoppingListItem {
  const data = load()
  const item: ShoppingListItem = {
    id: randomUUID(),
    name: input.name.trim(),
    quantity:
      input.quantity !== undefined && input.quantity !== null
        ? Number(input.quantity)
        : undefined,
    unit: input.unit?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    foodId: input.foodId,
    checked: false,
    createdAt: new Date().toISOString()
  }
  if (!item.name) throw new Error('Name is required')
  data.shoppingList.push(item)
  save(data)
  return item
}

export function addShoppingMany(lines: string[]): { created: number; items: ShoppingListItem[] } {
  const names = lines.map((l) => l.trim()).filter((l) => l.length > 0)
  const created: ShoppingListItem[] = []
  for (const name of names) {
    created.push(addShopping({ name }))
  }
  return { created: created.length, items: created }
}

export function updateShopping(
  id: string,
  patch: Partial<Omit<ShoppingListItem, 'id' | 'createdAt'>>
): ShoppingListItem | null {
  const data = load()
  const idx = data.shoppingList.findIndex((i) => i.id === id)
  if (idx < 0) return null
  const cur = data.shoppingList[idx]
  data.shoppingList[idx] = {
    ...cur,
    ...patch,
    name: patch.name !== undefined ? patch.name.trim() : cur.name,
    unit: patch.unit !== undefined ? patch.unit.trim() || undefined : cur.unit,
    notes: patch.notes !== undefined ? patch.notes.trim() || undefined : cur.notes
  }
  save(data)
  return data.shoppingList[idx]
}

export function deleteShopping(id: string): { deleted: boolean } {
  const data = load()
  const before = data.shoppingList.length
  data.shoppingList = data.shoppingList.filter((i) => i.id !== id)
  save(data)
  return { deleted: data.shoppingList.length < before }
}

export function clearCheckedShopping(): { removed: number } {
  const data = load()
  const before = data.shoppingList.length
  data.shoppingList = data.shoppingList.filter((i) => !i.checked)
  save(data)
  return { removed: before - data.shoppingList.length }
}

export function getPortionPlan(
  days: number,
  offlineNutrition?: Map<string, NutritionRef>
): PortionPlan {
  const data = load()
  return buildPortionPlan(
    data.shoppingList,
    data.foods,
    data.settings,
    days,
    offlineNutrition
  )
}

export function applyPortionsToDiary(
  date: string,
  plan: PortionPlan,
  meal: MealType = 'lunch'
): { added: number } {
  const day = date.slice(0, 10)
  let added = 0
  for (const rec of plan.items) {
    if (!rec.matched || !rec.foodId || rec.servingsPerDay <= 0) continue
    const food = load().foods.find((f) => f.id === rec.foodId)
    if (!food) continue
    addDiary({
      date: day,
      meal,
      foodId: food.id,
      name: food.name,
      servingQty: rec.servingsPerDay,
      kcal: rec.perDay.kcal,
      protein: rec.perDay.protein,
      carbs: rec.perDay.carbs,
      fat: rec.perDay.fat
    })
    added++
  }
  return { added }
}

export function exportData(): AppData {
  return structuredClone(load())
}

export function importData(incoming: AppData): AppData {
  const next: AppData = {
    version: DATA_VERSION,
    settings: { ...defaultSettings(), ...(incoming.settings ?? {}) },
    foods: Array.isArray(incoming.foods) ? incoming.foods : [],
    diaryEntries: Array.isArray(incoming.diaryEntries) ? incoming.diaryEntries : [],
    weightLogs: Array.isArray(incoming.weightLogs) ? incoming.weightLogs : [],
    exercises: Array.isArray(incoming.exercises) ? incoming.exercises : [],
    shoppingList: Array.isArray(incoming.shoppingList) ? incoming.shoppingList : []
  }
  save(next)
  return structuredClone(next)
}

export function resetData(): AppData {
  const next = emptyData()
  save(next)
  return structuredClone(next)
}

export async function exportDataToFile(win: BrowserWindow | null): Promise<{ cancelled: boolean; path?: string }> {
  const res = await dialog.showSaveDialog(win ?? undefined!, {
    title: 'Export MyHealth data',
    defaultPath: `myhealth-lw-export-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  })
  if (res.canceled || !res.filePath) return { cancelled: true }
  writeFileSync(res.filePath, JSON.stringify(exportData(), null, 2), 'utf8')
  return { cancelled: false, path: res.filePath }
}

export async function importDataFromFile(win: BrowserWindow | null): Promise<{ cancelled: boolean; error?: string }> {
  const res = await dialog.showOpenDialog(win ?? undefined!, {
    title: 'Import MyHealth data',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }]
  })
  if (res.canceled || !res.filePaths[0]) return { cancelled: true }
  try {
    const raw = JSON.parse(readFileSync(res.filePaths[0], 'utf8')) as AppData
    importData(raw)
    return { cancelled: false }
  } catch (err) {
    return { cancelled: false, error: err instanceof Error ? err.message : 'Invalid JSON' }
  }
}
