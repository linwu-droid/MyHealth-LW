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
  WeightLog,
  WaterLog,
  NutritionAnalysis,
  HealthProfile
} from '../shared/types'
import {
  emptyHealthProfile,
  ensureHealthProfileShape,
  extractAllergenCandidates,
  type ExtractCandidate
} from '../shared/health'
import { extractTextFromPdfFile } from './pdfText'
import { buildPortionPlan, type NutritionRef } from './portions'
import { analyzeNutrition } from './nutritionAnalysis'
import { getDrinkSeedInputs, getHomemadeSeedInputs, getSupermarketSeedInputs, getHealthyShelfSeedInputs, getVitaminSeedInputs } from './nutritionOnline'
import {
  defaultMineralGoals,
  normalizeMinerals,
  scaleMinerals
} from '../shared/minerals'
import { estimateExerciseKcal, resolveMetFromName } from '../shared/exerciseMet'
import { recommendWaterMl } from '../shared/water'

const STORE_FILE = 'myhealth-lw.json'
const DATA_VERSION = 11

function defaultSettings(): AppSettings {
  return {
    displayName: '',
    calorieGoal: 2000,
    proteinGoalG: 150,
    carbsGoalG: 200,
    fatGoalG: 65,
    weightUnit: 'kg',
    sex: '',
    weightGoalKg: undefined,
    weightStartKg: undefined,
    // AU/NZ NRV / WHO-ish adult defaults Ã¢â‚¬â€ see shared/minerals.ts
    mineralGoals: defaultMineralGoals()
  }
}

function seedFoods(): Food[] {
  // Approximate USDA-style minerals per listed serving (mg; Se/I in Ã‚Âµg). Undefined when unknown.
  const items: Omit<Food, 'id'>[] = [
    { name: 'Chicken breast, grilled', brand: '', servingLabel: '100 g', kcal: 165, protein: 31, carbs: 0, fat: 3.6,
      minerals: { sodium: 74, potassium: 256, calcium: 15, magnesium: 29, phosphorus: 228, iron: 1, zinc: 1, copper: 0.05, manganese: 0.02, selenium: 27, iodine: 7 } },
    { name: 'Egg, large', brand: '', servingLabel: '1 egg (50 g)', kcal: 72, protein: 6.3, carbs: 0.4, fat: 4.8,
      minerals: { sodium: 71, potassium: 69, calcium: 28, magnesium: 6, phosphorus: 99, iron: 0.9, zinc: 0.6, copper: 0.04, manganese: 0.01, selenium: 15, iodine: 24 } },
    { name: 'Whole milk', brand: '', servingLabel: '250 ml', kcal: 149, protein: 7.7, carbs: 12, fat: 8,
      minerals: { sodium: 105, potassium: 322, calcium: 276, magnesium: 24, phosphorus: 222, iron: 0.1, zinc: 0.9, copper: 0.03, manganese: 0.01, selenium: 9, iodine: 50 } },
    { name: 'Greek yogurt, plain', brand: '', servingLabel: '170 g', kcal: 100, protein: 17, carbs: 6, fat: 0.7,
      minerals: { sodium: 61, potassium: 240, calcium: 187, magnesium: 19, phosphorus: 230, iron: 0.1, zinc: 0.9, selenium: 16, iodine: 40 } },
    { name: 'Oats, dry', brand: '', servingLabel: '40 g', kcal: 152, protein: 5.3, carbs: 27, fat: 2.7,
      minerals: { sodium: 2, potassium: 146, calcium: 21, magnesium: 56, phosphorus: 166, iron: 1.7, zinc: 1.5, copper: 0.17, manganese: 1.5, selenium: 12 } },
    { name: 'Banana', brand: '', servingLabel: '1 medium (118 g)', kcal: 105, protein: 1.3, carbs: 27, fat: 0.4,
      minerals: { sodium: 1, potassium: 422, calcium: 6, magnesium: 32, phosphorus: 26, iron: 0.3, zinc: 0.2, copper: 0.09, manganese: 0.3, selenium: 1 } },
    { name: 'Apple', brand: '', servingLabel: '1 medium (182 g)', kcal: 95, protein: 0.5, carbs: 25, fat: 0.3,
      minerals: { sodium: 2, potassium: 195, calcium: 11, magnesium: 9, phosphorus: 20, iron: 0.2, zinc: 0.1, copper: 0.05, manganese: 0.06 } },
    { name: 'Broccoli, steamed', brand: '', servingLabel: '100 g', kcal: 35, protein: 2.4, carbs: 7, fat: 0.4,
      minerals: { sodium: 41, potassium: 293, calcium: 40, magnesium: 21, phosphorus: 67, iron: 0.7, zinc: 0.4, copper: 0.05, manganese: 0.2, selenium: 1.6 } },
    { name: 'Brown rice, cooked', brand: '', servingLabel: '1 cup (195 g)', kcal: 215, protein: 5, carbs: 45, fat: 1.6,
      minerals: { sodium: 10, potassium: 154, calcium: 20, magnesium: 84, phosphorus: 150, iron: 0.8, zinc: 1.2, copper: 0.2, manganese: 1.8, selenium: 19 } },
    { name: 'White rice, cooked', brand: '', servingLabel: '1 cup (158 g)', kcal: 205, protein: 4.3, carbs: 45, fat: 0.4,
      minerals: { sodium: 2, potassium: 55, calcium: 16, magnesium: 19, phosphorus: 68, iron: 0.3, zinc: 0.8, copper: 0.07, manganese: 0.7, selenium: 12 } },
    { name: 'Salmon, baked', brand: '', servingLabel: '100 g', kcal: 208, protein: 20, carbs: 0, fat: 13,
      minerals: { sodium: 59, potassium: 384, calcium: 9, magnesium: 29, phosphorus: 252, iron: 0.5, zinc: 0.6, copper: 0.07, manganese: 0.02, selenium: 38, iodine: 14 } },
    { name: 'Tuna, canned in water', brand: '', servingLabel: '1 can drained (165 g)', kcal: 191, protein: 42, carbs: 0, fat: 1.4,
      minerals: { sodium: 338, potassium: 320, calcium: 18, magnesium: 40, phosphorus: 250, iron: 1.5, zinc: 1.1, selenium: 90, iodine: 30 } },
    { name: 'Whole wheat bread', brand: '', servingLabel: '1 slice (28 g)', kcal: 69, protein: 3.6, carbs: 12, fat: 1.1,
      minerals: { sodium: 132, potassium: 81, calcium: 30, magnesium: 24, phosphorus: 57, iron: 0.8, zinc: 0.5, copper: 0.06, manganese: 0.6, selenium: 8, iodine: 5 } },
    { name: 'Peanut butter', brand: '', servingLabel: '1 tbsp (16 g)', kcal: 94, protein: 4, carbs: 3.1, fat: 8,
      minerals: { sodium: 73, potassium: 104, calcium: 8, magnesium: 25, phosphorus: 56, iron: 0.3, zinc: 0.5, copper: 0.07, manganese: 0.3, selenium: 1 } },
    { name: 'Almonds', brand: '', servingLabel: '28 g (about 23)', kcal: 164, protein: 6, carbs: 6, fat: 14,
      minerals: { sodium: 1, potassium: 208, calcium: 76, magnesium: 76, phosphorus: 136, iron: 1, zinc: 0.9, copper: 0.3, manganese: 0.6, selenium: 1 } },
    { name: 'Avocado', brand: '', servingLabel: '1/2 fruit (68 g)', kcal: 114, protein: 1.3, carbs: 6, fat: 10.5,
      minerals: { sodium: 5, potassium: 345, calcium: 9, magnesium: 20, phosphorus: 36, iron: 0.4, zinc: 0.4, copper: 0.13, manganese: 0.1 } },
    { name: 'Sweet potato, baked', brand: '', servingLabel: '100 g', kcal: 90, protein: 2, carbs: 21, fat: 0.2,
      minerals: { sodium: 36, potassium: 475, calcium: 38, magnesium: 27, phosphorus: 54, iron: 0.7, zinc: 0.3, copper: 0.16, manganese: 0.5 } },
    { name: 'Potato, baked', brand: '', servingLabel: '1 medium (173 g)', kcal: 161, protein: 4.3, carbs: 37, fat: 0.2,
      minerals: { sodium: 17, potassium: 926, calcium: 26, magnesium: 48, phosphorus: 121, iron: 1.9, zinc: 0.5, copper: 0.2, manganese: 0.3, selenium: 0.7 } },
    { name: 'Cheddar cheese', brand: '', servingLabel: '28 g', kcal: 113, protein: 7, carbs: 0.4, fat: 9.3,
      minerals: { sodium: 174, potassium: 20, calcium: 199, magnesium: 8, phosphorus: 143, iron: 0.1, zinc: 1, selenium: 8, iodine: 12 } },
    { name: 'Olive oil', brand: '', servingLabel: '1 tbsp (14 g)', kcal: 119, protein: 0, carbs: 0, fat: 13.5,
      minerals: { sodium: 0, potassium: 0, calcium: 0, magnesium: 0, phosphorus: 0, iron: 0.1 } },
    { name: 'Pasta, cooked', brand: '', servingLabel: '1 cup (140 g)', kcal: 220, protein: 8, carbs: 43, fat: 1.3,
      minerals: { sodium: 1, potassium: 63, calcium: 10, magnesium: 25, phosphorus: 76, iron: 1.3, zinc: 0.7, copper: 0.14, manganese: 0.5, selenium: 26 } },
    { name: 'Black beans, cooked', brand: '', servingLabel: '1/2 cup (86 g)', kcal: 114, protein: 7.6, carbs: 20, fat: 0.5,
      minerals: { sodium: 1, potassium: 305, calcium: 23, magnesium: 60, phosphorus: 120, iron: 1.8, zinc: 1, copper: 0.18, manganese: 0.4, selenium: 1 } },
    { name: 'Quinoa, cooked', brand: '', servingLabel: '1 cup (185 g)', kcal: 222, protein: 8, carbs: 39, fat: 3.6,
      minerals: { sodium: 13, potassium: 318, calcium: 31, magnesium: 118, phosphorus: 281, iron: 2.8, zinc: 2, copper: 0.35, manganese: 1.2, selenium: 5 } },
    { name: 'Whey protein shake', brand: '', servingLabel: '1 scoop (30 g)', kcal: 120, protein: 24, carbs: 3, fat: 1.5,
      minerals: { sodium: 50, potassium: 160, calcium: 100, magnesium: 30, phosphorus: 100, iron: 0.3, zinc: 1 } },
    { name: 'Coffee, black', brand: '', servingLabel: '1 cup (240 ml)', kcal: 2, protein: 0.3, carbs: 0, fat: 0,
      minerals: { sodium: 5, potassium: 116, calcium: 5, magnesium: 7, phosphorus: 3, iron: 0.1, manganese: 0.05 } },
    { name: 'Orange juice', brand: '', servingLabel: '250 ml', kcal: 112, protein: 1.7, carbs: 26, fat: 0.5,
      minerals: { sodium: 2, potassium: 496, calcium: 27, magnesium: 27, phosphorus: 42, iron: 0.5, zinc: 0.1, copper: 0.1, manganese: 0.04, selenium: 0.3 } }
  ]
  return items.map((f) => ({ ...f, id: randomUUID() }))
}

function migrateSettings(raw: Partial<AppSettings> | undefined): AppSettings {
  const base = defaultSettings()
  const incoming = raw ?? {}
  const heightRaw = Number(incoming.heightCm)
  const goalRaw = Number(incoming.weightGoalKg)
  const startRaw = Number(incoming.weightStartKg)
  const sexRaw = incoming.sex
  const sex =
    sexRaw === 'female' || sexRaw === 'male' || sexRaw === 'other' || sexRaw === ''
      ? sexRaw
      : ''
  const waterRaw = Number(incoming.waterGoalMl)
  return {
    ...base,
    ...incoming,
    heightCm: heightRaw > 0 ? heightRaw : undefined,
    weightGoalKg: goalRaw > 0 ? goalRaw : undefined,
    weightStartKg: startRaw > 0 ? startRaw : undefined,
    sex,
    waterGoalMl: waterRaw > 0 ? Math.round(waterRaw) : undefined,
    mineralGoals: {
      ...defaultMineralGoals(),
      ...(incoming.mineralGoals ?? {})
    }
  }
}

function emptyData(): AppData {
  const foods = seedFoods()
  const existing = new Set(
    foods.map((f) => `${f.name.toLowerCase()}|${(f.brand ?? '').toLowerCase()}`)
  )
  for (const input of getDrinkSeedInputs()) {
    const name = input.name.trim()
    if (!name) continue
    const brand = input.brand?.trim() || undefined
    const key = `${name.toLowerCase()}|${(brand ?? '').toLowerCase()}`
    if (existing.has(key)) continue
    const minerals = normalizeMinerals(input.minerals)
    foods.push({
      id: randomUUID(),
      name,
      brand,
      servingLabel: input.servingLabel.trim() || '1 serving',
      kcal: Number(input.kcal) || 0,
      protein: Number(input.protein) || 0,
      carbs: Number(input.carbs) || 0,
      fat: Number(input.fat) || 0,
      ...(minerals ? { minerals } : {})
    })
    existing.add(key)
  }
  for (const input of getHomemadeSeedInputs()) {
    const name = input.name.trim()
    if (!name) continue
    const brand = input.brand?.trim() || undefined
    const key = `${name.toLowerCase()}|${(brand ?? '').toLowerCase()}`
    if (existing.has(key)) continue
    const minerals = normalizeMinerals(input.minerals)
    foods.push({
      id: randomUUID(),
      name,
      brand,
      servingLabel: input.servingLabel.trim() || '1 serving',
      kcal: Number(input.kcal) || 0,
      protein: Number(input.protein) || 0,
      carbs: Number(input.carbs) || 0,
      fat: Number(input.fat) || 0,
      ...(minerals ? { minerals } : {})
    })
    existing.add(key)
  }
  for (const input of getSupermarketSeedInputs()) {
    const name = input.name.trim()
    if (!name) continue
    const brand = input.brand?.trim() || undefined
    const key = `${name.toLowerCase()}|${(brand ?? '').toLowerCase()}`
    if (existing.has(key)) continue
    const minerals = normalizeMinerals(input.minerals)
    foods.push({
      id: randomUUID(),
      name,
      brand,
      servingLabel: input.servingLabel.trim() || '1 serving',
      kcal: Number(input.kcal) || 0,
      protein: Number(input.protein) || 0,
      carbs: Number(input.carbs) || 0,
      fat: Number(input.fat) || 0,
      ...(minerals ? { minerals } : {})
    })
    existing.add(key)
  }
  for (const input of getHealthyShelfSeedInputs()) {
    const name = input.name.trim()
    if (!name) continue
    const brand = input.brand?.trim() || undefined
    const key = `${name.toLowerCase()}|${(brand ?? '').toLowerCase()}`
    if (existing.has(key)) continue
    const minerals = normalizeMinerals(input.minerals)
    foods.push({
      id: randomUUID(),
      name,
      brand,
      servingLabel: input.servingLabel.trim() || '1 serving',
      kcal: Number(input.kcal) || 0,
      protein: Number(input.protein) || 0,
      carbs: Number(input.carbs) || 0,
      fat: Number(input.fat) || 0,
      ...(minerals ? { minerals } : {})
    })
    existing.add(key)
  }
  for (const input of getVitaminSeedInputs()) {
    const name = input.name.trim()
    if (!name) continue
    const brand = input.brand?.trim() || undefined
    const key = `${name.toLowerCase()}|${(brand ?? '').toLowerCase()}`
    if (existing.has(key)) continue
    const minerals = normalizeMinerals(input.minerals)
    foods.push({
      id: randomUUID(),
      name,
      brand,
      servingLabel: input.servingLabel.trim() || '1 serving',
      kcal: Number(input.kcal) || 0,
      protein: Number(input.protein) || 0,
      carbs: Number(input.carbs) || 0,
      fat: Number(input.fat) || 0,
      ...(minerals ? { minerals } : {})
    })
    existing.add(key)
  }
  return {
    version: DATA_VERSION,
    settings: defaultSettings(),
    foods,
    diaryEntries: [],
    weightLogs: [],
    exercises: [],
    shoppingList: [],
    waterLogs: [],
    healthProfile: emptyHealthProfile()
  }
}

function dataPath(): string {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, STORE_FILE)
}

let cache: AppData | null = null

/** Ensure shoppingList is always a real array before any mutation. */
function ensureShoppingList(data: AppData): ShoppingListItem[] {
  if (!Array.isArray(data.shoppingList)) data.shoppingList = []
  return data.shoppingList
}

/** Ensure waterLogs is always a real array. */
function ensureWaterLogs(data: AppData): WaterLog[] {
  if (!Array.isArray(data.waterLogs)) data.waterLogs = []
  return data.waterLogs
}

/** Merge curated drink seeds into foods (name|brand dedupe). Returns count created. Does not save. */
function ensureDrinkFoods(data: AppData): number {
  const existing = new Set(
    data.foods.map((f) => `${f.name.toLowerCase()}|${(f.brand ?? '').toLowerCase()}`)
  )
  let created = 0
  for (const input of getDrinkSeedInputs()) {
    const name = input.name.trim()
    if (!name) continue
    const brand = input.brand?.trim() || undefined
    const key = `${name.toLowerCase()}|${(brand ?? '').toLowerCase()}`
    if (existing.has(key)) continue
    const minerals = normalizeMinerals(input.minerals)
    data.foods.push({
      id: randomUUID(),
      name,
      brand,
      servingLabel: input.servingLabel.trim() || '1 serving',
      kcal: Number(input.kcal) || 0,
      protein: Number(input.protein) || 0,
      carbs: Number(input.carbs) || 0,
      fat: Number(input.fat) || 0,
      ...(minerals ? { minerals } : {})
    })
    existing.add(key)
    created++
  }
  return created
}

/** Merge curated homemade / home-cooked seeds into foods (name|brand dedupe). Returns count created. Does not save. */
function ensureHomemadeFoods(data: AppData): number {
  const existing = new Set(
    data.foods.map((f) => `${f.name.toLowerCase()}|${(f.brand ?? '').toLowerCase()}`)
  )
  let created = 0
  for (const input of getHomemadeSeedInputs()) {
    const name = input.name.trim()
    if (!name) continue
    const brand = input.brand?.trim() || undefined
    const key = `${name.toLowerCase()}|${(brand ?? '').toLowerCase()}`
    if (existing.has(key)) continue
    const minerals = normalizeMinerals(input.minerals)
    data.foods.push({
      id: randomUUID(),
      name,
      brand,
      servingLabel: input.servingLabel.trim() || '1 serving',
      kcal: Number(input.kcal) || 0,
      protein: Number(input.protein) || 0,
      carbs: Number(input.carbs) || 0,
      fat: Number(input.fat) || 0,
      ...(minerals ? { minerals } : {})
    })
    existing.add(key)
    created++
  }
  return created
}

/** Merge curated supermarket / shelf-stable seeds into foods (name|brand dedupe). Returns count created. Does not save. */
function ensureSupermarketFoods(data: AppData): number {
  const existing = new Set(
    data.foods.map((f) => `${f.name.toLowerCase()}|${(f.brand ?? '').toLowerCase()}`)
  )
  let created = 0
  for (const input of getSupermarketSeedInputs()) {
    const name = input.name.trim()
    if (!name) continue
    const brand = input.brand?.trim() || undefined
    const key = `${name.toLowerCase()}|${(brand ?? '').toLowerCase()}`
    if (existing.has(key)) continue
    const minerals = normalizeMinerals(input.minerals)
    data.foods.push({
      id: randomUUID(),
      name,
      brand,
      servingLabel: input.servingLabel.trim() || '1 serving',
      kcal: Number(input.kcal) || 0,
      protein: Number(input.protein) || 0,
      carbs: Number(input.carbs) || 0,
      fat: Number(input.fat) || 0,
      ...(minerals ? { minerals } : {})
    })
    existing.add(key)
    created++
  }
  return created
}

/** Merge curated healthy shelf / cereal seeds into foods (name|brand dedupe). Returns count created. Does not save. */
function ensureHealthyShelfFoods(data: AppData): number {
  const existing = new Set(
    data.foods.map((f) => `${f.name.toLowerCase()}|${(f.brand ?? '').toLowerCase()}`)
  )
  let created = 0
  for (const input of getHealthyShelfSeedInputs()) {
    const name = input.name.trim()
    if (!name) continue
    const brand = input.brand?.trim() || undefined
    const key = `${name.toLowerCase()}|${(brand ?? '').toLowerCase()}`
    if (existing.has(key)) continue
    const minerals = normalizeMinerals(input.minerals)
    data.foods.push({
      id: randomUUID(),
      name,
      brand,
      servingLabel: input.servingLabel.trim() || '1 serving',
      kcal: Number(input.kcal) || 0,
      protein: Number(input.protein) || 0,
      carbs: Number(input.carbs) || 0,
      fat: Number(input.fat) || 0,
      ...(minerals ? { minerals } : {})
    })
    existing.add(key)
    created++
  }
  return created
}


/** Merge curated vitamin / supplement seeds into foods (name|brand dedupe). Returns count created. Does not save. */
function ensureVitaminFoods(data: AppData): number {
  const existing = new Set(
    data.foods.map((f) => `${f.name.toLowerCase()}|${(f.brand ?? '').toLowerCase()}`)
  )
  let created = 0
  for (const input of getVitaminSeedInputs()) {
    const name = input.name.trim()
    if (!name) continue
    const brand = input.brand?.trim() || undefined
    const key = `${name.toLowerCase()}|${(brand ?? '').toLowerCase()}`
    if (existing.has(key)) continue
    const minerals = normalizeMinerals(input.minerals)
    data.foods.push({
      id: randomUUID(),
      name,
      brand,
      servingLabel: input.servingLabel.trim() || '1 serving',
      kcal: Number(input.kcal) || 0,
      protein: Number(input.protein) || 0,
      carbs: Number(input.carbs) || 0,
      fat: Number(input.fat) || 0,
      ...(minerals ? { minerals } : {})
    })
    existing.add(key)
    created++
  }
  return created
}

/** Ensure healthProfile exists and is shaped. Does not save. */
function ensureHealthProfile(data: AppData): HealthProfile {
  data.healthProfile = ensureHealthProfileShape(data.healthProfile)
  return data.healthProfile
}

function load(): AppData {
  if (cache) return cache
  const path = dataPath()
  if (!existsSync(path)) {
    cache = emptyData()
    save(cache)
    return cache
  }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<AppData> & Record<string, unknown>
    const hadShoppingList = Array.isArray(raw.shoppingList)
    const rawVersion = typeof raw.version === 'number' ? raw.version : 0
    cache = {
      version: DATA_VERSION,
      settings: migrateSettings(raw.settings),
      foods: Array.isArray(raw.foods) ? raw.foods : seedFoods(),
      diaryEntries: Array.isArray(raw.diaryEntries) ? raw.diaryEntries : [],
      weightLogs: Array.isArray(raw.weightLogs) ? raw.weightLogs : [],
      exercises: Array.isArray(raw.exercises) ? raw.exercises : [],
      shoppingList: hadShoppingList ? (raw.shoppingList as ShoppingListItem[]) : [],
      waterLogs: Array.isArray(raw.waterLogs) ? (raw.waterLogs as WaterLog[]) : [],
      healthProfile: ensureHealthProfileShape(raw.healthProfile)
    }
    // Persist migration when shoppingList was missing, version was stale, or seeds need merging.
    let migrated = !hadShoppingList || rawVersion < DATA_VERSION
    if (rawVersion < 4) {
      const n = ensureDrinkFoods(cache)
      if (n > 0) migrated = true
    } else {
      // Safety net: if drinks pack markers are missing, seed anyway.
      const names = new Set(cache.foods.map((f) => f.name.toLowerCase()))
      if (!names.has('latte (whole milk)') || !names.has('espresso')) {
        const n = ensureDrinkFoods(cache)
        if (n > 0) migrated = true
      }
    }
    if (rawVersion < 5) {
      const n = ensureHomemadeFoods(cache)
      if (n > 0) migrated = true
    } else {
      // Safety net: if homemade pack markers are missing, seed anyway.
      const names = new Set(cache.foods.map((f) => f.name.toLowerCase()))
      if (!names.has('fried egg (sunny side)') || !names.has('steamed white fish fillet')) {
        const n = ensureHomemadeFoods(cache)
        if (n > 0) migrated = true
      }
    }
    if (rawVersion < 6) {
      const n = ensureSupermarketFoods(cache)
      if (n > 0) migrated = true
    } else {
      // Safety net: if supermarket pack markers are missing, seed anyway.
      const names = new Set(cache.foods.map((f) => f.name.toLowerCase()))
      if (!names.has('corn kernels (canned)') || !names.has('tomato passata')) {
        const n = ensureSupermarketFoods(cache)
        if (n > 0) migrated = true
      }
    }
    ensureWaterLogs(cache)
    if (rawVersion < 7 && !Array.isArray(raw.waterLogs)) {
      migrated = true
    }
    if (rawVersion < 8) {
      const n = ensureHealthyShelfFoods(cache)
      if (n > 0) migrated = true
    } else {
      // Safety net: if healthy shelf pack markers are missing, seed anyway.
      const names = new Set(cache.foods.map((f) => f.name.toLowerCase()))
      if (!names.has('oat bran') || !names.has('chia seeds')) {
        const n = ensureHealthyShelfFoods(cache)
        if (n > 0) migrated = true
      }
    }
    if (rawVersion < 10) {
      const n = ensureVitaminFoods(cache)
      if (n > 0) migrated = true
    } else {
      // Safety net: if vitamin pack markers are missing, seed anyway.
      const names = new Set(cache.foods.map((f) => f.name.toLowerCase()))
      if (!names.has('multivitamin tablet') || !names.has('one-a-day ginkgo 6000')) {
        const n = ensureVitaminFoods(cache)
        if (n > 0) migrated = true
      }
    }
    ensureHealthProfile(cache)
    if (rawVersion < 11 || !raw.healthProfile) {
      migrated = true
    }
    if (migrated) {
      save(cache)
    }
  } catch {
    cache = emptyData()
    save(cache)
  }
  return cache
}

function save(data: AppData): void {
  if (!Array.isArray(data.shoppingList)) data.shoppingList = []
  if (!Array.isArray(data.waterLogs)) data.waterLogs = []
  ensureHealthProfile(data)
  data.version = DATA_VERSION
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
  const next = { ...data.settings, ...patch }
  if (patch.waterGoalMl !== undefined) {
    const w = Number(patch.waterGoalMl)
    next.waterGoalMl = w > 0 ? Math.round(w) : undefined
  }
  if (patch.mineralGoals !== undefined) {
    next.mineralGoals = {
      ...defaultMineralGoals(),
      ...(data.settings.mineralGoals ?? {}),
      ...patch.mineralGoals
    }
  } else if (!next.mineralGoals) {
    next.mineralGoals = defaultMineralGoals()
  }
  data.settings = next
  save(data)
  return { ...data.settings, mineralGoals: { ...data.settings.mineralGoals } }
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
  const minerals = normalizeMinerals(input.minerals)
  const food: Food = {
    id: randomUUID(),
    name: input.name.trim(),
    brand: input.brand?.trim() || undefined,
    servingLabel: input.servingLabel.trim() || '1 serving',
    kcal: Number(input.kcal) || 0,
    protein: Number(input.protein) || 0,
    carbs: Number(input.carbs) || 0,
    fat: Number(input.fat) || 0,
    ...(minerals ? { minerals } : {})
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
    const minerals = normalizeMinerals(input.minerals)
    const food: Food = {
      id: randomUUID(),
      name,
      brand,
      servingLabel: input.servingLabel.trim() || '1 serving',
      kcal: Number(input.kcal) || 0,
      protein: Number(input.protein) || 0,
      carbs: Number(input.carbs) || 0,
      fat: Number(input.fat) || 0,
      ...(minerals ? { minerals } : {})
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
  const nextMinerals =
    patch.minerals !== undefined ? normalizeMinerals(patch.minerals) : cur.minerals
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
        : cur.servingLabel,
    minerals: nextMinerals
  }
  if (!data.foods[idx].minerals) delete data.foods[idx].minerals
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
  let minerals = normalizeMinerals(input.minerals)
  if (!minerals && input.foodId) {
    const food = data.foods.find((f) => f.id === input.foodId)
    if (food?.minerals) {
      minerals = scaleMinerals(food.minerals, Number(input.servingQty) || 1)
    }
  }
  const portionAmount =
    input.portionAmount !== undefined && input.portionAmount !== null
      ? Number(input.portionAmount)
      : undefined
  const portionUnit = input.portionUnit
  const entry: DiaryEntry = {
    id: randomUUID(),
    date: input.date.slice(0, 10),
    meal: input.meal,
    foodId: input.foodId,
    name: input.name.trim(),
    servingQty: Number(input.servingQty) || 1,
    ...(portionAmount !== undefined && Number.isFinite(portionAmount)
      ? { portionAmount }
      : {}),
    ...(portionUnit ? { portionUnit } : {}),
    kcal: Number(input.kcal) || 0,
    protein: Number(input.protein) || 0,
    carbs: Number(input.carbs) || 0,
    fat: Number(input.fat) || 0,
    ...(minerals ? { minerals } : {})
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
  const name = input.name.trim()
  const minutes =
    input.minutes !== undefined && input.minutes !== null
      ? Number(input.minutes)
      : undefined
  let kcal = Number(input.kcal) || 0
  const mins =
    minutes !== undefined && Number.isFinite(minutes) && minutes > 0 ? minutes : 0
  if (kcal <= 0 && mins > 0) {
    const met = resolveMetFromName(name)
    if (met !== null) {
      const weights = [...data.weightLogs].sort((a, b) => b.date.localeCompare(a.date))
      const weightKg = weights[0]?.kg && weights[0].kg > 0 ? weights[0].kg : 70
      kcal = estimateExerciseKcal({ met, weightKg, minutes: mins })
    }
  }
  const ex: Exercise = {
    id: randomUUID(),
    date: input.date.slice(0, 10),
    name,
    minutes: mins > 0 ? mins : minutes !== undefined && Number.isFinite(minutes) ? minutes : undefined,
    kcal
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

export function listWater(date?: string): WaterLog[] {
  const data = load()
  ensureWaterLogs(data)
  const filtered = date
    ? data.waterLogs.filter((w) => w.date === date.slice(0, 10))
    : data.waterLogs
  return [...filtered].sort((a, b) => {
    const d = b.date.localeCompare(a.date)
    if (d !== 0) return d
    return (b.createdAt || '').localeCompare(a.createdAt || '')
  })
}

export function addWater(input: { date: string; ml: number }): WaterLog {
  const data = load()
  ensureWaterLogs(data)
  const ml = Math.round(Number(input.ml) || 0)
  if (!(ml > 0)) throw new Error('ml must be positive')
  const log: WaterLog = {
    id: randomUUID(),
    date: input.date.slice(0, 10),
    ml,
    createdAt: new Date().toISOString()
  }
  data.waterLogs.push(log)
  save(data)
  return log
}

export function deleteWater(id: string): { deleted: boolean } {
  const data = load()
  ensureWaterLogs(data)
  const before = data.waterLogs.length
  data.waterLogs = data.waterLogs.filter((w) => w.id !== id)
  save(data)
  return { deleted: data.waterLogs.length < before }
}

export function getWaterTotal(date: string): number {
  const day = date.slice(0, 10)
  return listWater(day).reduce((s, w) => s + w.ml, 0)
}

export function getWaterGoalMl(): number {
  const data = load()
  const override = data.settings.waterGoalMl
  if (override != null && override > 0) return Math.round(override)
  const weights = [...data.weightLogs].sort((a, b) => b.date.localeCompare(a.date))
  const latest = weights[0]?.kg ?? null
  return recommendWaterMl(latest)
}

export function getRecommendedWaterMl(): number {
  const data = load()
  const weights = [...data.weightLogs].sort((a, b) => b.date.localeCompare(a.date))
  const latest = weights[0]?.kg ?? null
  return recommendWaterMl(latest)
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
  const data = load()
  ensureShoppingList(data)
  return [...data.shoppingList].sort((a, b) => {
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
  ensureShoppingList(data)
  const name = (input.name ?? '').trim()
  if (!name) throw new Error('Name is required')

  let quantity: number | undefined
  if (input.quantity !== undefined && input.quantity !== null) {
    const q = Number(input.quantity)
    quantity = Number.isFinite(q) ? q : undefined
  }

  const item: ShoppingListItem = {
    id: randomUUID(),
    name,
    quantity,
    unit: input.unit?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    foodId: input.foodId || undefined,
    checked: false,
    createdAt: new Date().toISOString()
  }
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
  ensureShoppingList(data)
  const idx = data.shoppingList.findIndex((i) => i.id === id)
  if (idx < 0) return null
  const cur = data.shoppingList[idx]

  let quantity = cur.quantity
  if (patch.quantity !== undefined) {
    if (patch.quantity === null) {
      quantity = undefined
    } else {
      const q = Number(patch.quantity)
      quantity = Number.isFinite(q) ? q : undefined
    }
  }

  data.shoppingList[idx] = {
    ...cur,
    ...patch,
    name: patch.name !== undefined ? patch.name.trim() : cur.name,
    quantity,
    unit: patch.unit !== undefined ? patch.unit.trim() || undefined : cur.unit,
    notes: patch.notes !== undefined ? patch.notes.trim() || undefined : cur.notes,
    foodId: patch.foodId !== undefined ? patch.foodId || undefined : cur.foodId
  }
  save(data)
  return data.shoppingList[idx]
}

export function deleteShopping(id: string): { deleted: boolean } {
  const data = load()
  ensureShoppingList(data)
  const before = data.shoppingList.length
  data.shoppingList = data.shoppingList.filter((i) => i.id !== id)
  save(data)
  return { deleted: data.shoppingList.length < before }
}

export function clearCheckedShopping(): { removed: number } {
  const data = load()
  ensureShoppingList(data)
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
  ensureShoppingList(data)
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
  _meal: MealType = 'lunch'
): { added: number } {
  const day = date.slice(0, 10)
  const meals: MealType[] = ['breakfast', 'lunch', 'dinner']
  let added = 0
  for (const rec of plan.items) {
    if (!rec.matched || !rec.foodId || rec.servingsPerDay <= 0) continue
    const food = load().foods.find((f) => f.id === rec.foodId)
    if (!food) continue
    const byMeal = rec.servingsByMeal
    const hasMealSplit =
      byMeal && meals.some((m) => (byMeal[m as 'breakfast' | 'lunch' | 'dinner'] ?? 0) > 0)
    if (hasMealSplit) {
      for (const meal of meals) {
        const qty = byMeal[meal as 'breakfast' | 'lunch' | 'dinner'] ?? 0
        if (qty <= 0) continue
        const factor = qty / rec.servingsPerDay
        addDiary({
          date: day,
          meal,
          foodId: food.id,
          name: food.name,
          servingQty: qty,
          kcal: Math.round(rec.perDay.kcal * factor * 10) / 10,
          protein: Math.round(rec.perDay.protein * factor * 10) / 10,
          carbs: Math.round(rec.perDay.carbs * factor * 10) / 10,
          fat: Math.round(rec.perDay.fat * factor * 10) / 10,
          minerals: scaleMinerals(food.minerals, qty)
        })
        added++
      }
    } else {
      // Fallback: equal thirds across breakfast / lunch / dinner
      const third = Math.round((rec.servingsPerDay / 3) * 4) / 4
      const leftovers = Math.round((rec.servingsPerDay - third * 2) * 4) / 4
      const qtys = [third, third, leftovers]
      meals.forEach((meal, idx) => {
        const qty = qtys[idx]
        if (qty <= 0) return
        const factor = qty / rec.servingsPerDay
        addDiary({
          date: day,
          meal,
          foodId: food.id,
          name: food.name,
          servingQty: qty,
          kcal: Math.round(rec.perDay.kcal * factor * 10) / 10,
          protein: Math.round(rec.perDay.protein * factor * 10) / 10,
          carbs: Math.round(rec.perDay.carbs * factor * 10) / 10,
          fat: Math.round(rec.perDay.fat * factor * 10) / 10
        })
        added++
      })
    }
  }
  return { added }
}


export function getNutritionAnalysis(date: string, days = 1): NutritionAnalysis {
  const data = load()
  ensureShoppingList(data)
  return analyzeNutrition(
    data.diaryEntries,
    data.settings,
    data.shoppingList,
    { date, days },
    data.foods
  )
}
export function exportData(): AppData {
  return structuredClone(load())
}

export function importData(incoming: AppData): AppData {
  const next: AppData = {
    version: DATA_VERSION,
    settings: migrateSettings(incoming.settings),
    foods: Array.isArray(incoming.foods) ? incoming.foods : [],
    diaryEntries: Array.isArray(incoming.diaryEntries) ? incoming.diaryEntries : [],
    weightLogs: Array.isArray(incoming.weightLogs) ? incoming.weightLogs : [],
    exercises: Array.isArray(incoming.exercises) ? incoming.exercises : [],
    shoppingList: Array.isArray(incoming.shoppingList) ? incoming.shoppingList : [],
    waterLogs: Array.isArray(incoming.waterLogs) ? incoming.waterLogs : [],
    healthProfile: ensureHealthProfileShape(incoming.healthProfile)
  }
  save(next)
  return structuredClone(next)
}

export function resetData(): AppData {
  const next = emptyData()
  save(next)
  return structuredClone(next)
}


export function getHealthProfile(): HealthProfile {
  const data = load()
  return structuredClone(ensureHealthProfile(data))
}

export function updateHealthProfile(patch: Partial<HealthProfile>): HealthProfile {
  const data = load()
  const cur = ensureHealthProfile(data)
  const next = ensureHealthProfileShape({
    ...cur,
    ...patch,
    restrictions: Array.isArray(patch.restrictions) ? patch.restrictions : cur.restrictions,
    avoidKeywords: patch.avoidKeywords !== undefined ? patch.avoidKeywords : cur.avoidKeywords,
    preferKeywords: patch.preferKeywords !== undefined ? patch.preferKeywords : cur.preferKeywords,
    notes: patch.notes !== undefined ? patch.notes : cur.notes,
    reportExcerpt: patch.reportExcerpt !== undefined ? patch.reportExcerpt : cur.reportExcerpt,
    updatedAt: new Date().toISOString()
  })
  data.healthProfile = next
  save(data)
  return structuredClone(next)
}

export function extractHealthFromText(text: string): ExtractCandidate[] {
  return extractAllergenCandidates(typeof text === 'string' ? text : '')
}

export async function importHealthReportFile(
  win: BrowserWindow | null
): Promise<{ cancelled: boolean; text?: string; error?: string; note?: string; fileName?: string }> {
  const res = await dialog.showOpenDialog(win ?? undefined!, {
    title: 'Import health / allergy report',
    properties: ['openFile'],
    filters: [
      { name: 'Text or PDF', extensions: ['txt', 'text', 'md', 'pdf'] },
      { name: 'All files', extensions: ['*'] }
    ]
  })
  if (res.canceled || !res.filePaths[0]) return { cancelled: true }
  const filePath = res.filePaths[0]
  const lower = filePath.toLowerCase()
  try {
    if (lower.endsWith('.pdf')) {
      const text = extractTextFromPdfFile(filePath)
      if (!text || text.length < 20) {
        return {
          cancelled: false,
          text: text || '',
          fileName: filePath,
          note: 'Little or no text extracted from PDF (scanned/image PDFs need paste — OCR not supported).',
          error: !text ? 'No extractable text in PDF. Paste the report text instead.' : undefined
        }
      }
      return {
        cancelled: false,
        text,
        fileName: filePath,
        note: 'Extracted text from PDF (no OCR). Review candidates before merging.'
      }
    }
    const text = readFileSync(filePath, 'utf8')
    return { cancelled: false, text, fileName: filePath }
  } catch (err) {
    return {
      cancelled: false,
      error: err instanceof Error ? err.message : 'Failed to read file'
    }
  }
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


