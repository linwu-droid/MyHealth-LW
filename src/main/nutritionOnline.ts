import type { Food, OnlineFoodCandidate } from '../shared/types'
import {
  normalizeMinerals,
  roundMineral,
  type MineralKey,
  type MineralMap
} from '../shared/minerals'

export type { OnlineFoodCandidate }

const OFF_SEARCH = 'https://world.openfoodfacts.org/cgi/search.pl'
const USER_AGENT =
  'MyHealthLW/1.0 (Windows; Electron; https://github.com/linwu-droid/MyHealth-LW)'

type OffNutriments = {
  'energy-kcal_100g'?: number
  'energy-kcal_serving'?: number
  'energy-kcal'?: number
  proteins_100g?: number
  proteins_serving?: number
  carbohydrates_100g?: number
  carbohydrates_serving?: number
  fat_100g?: number
  fat_serving?: number
  // Minerals â€” OFF units vary; helpers normalize to mg (Se/I Âµg)
  sodium_100g?: number
  sodium_serving?: number
  salt_100g?: number
  salt_serving?: number
  potassium_100g?: number
  potassium_serving?: number
  calcium_100g?: number
  calcium_serving?: number
  magnesium_100g?: number
  magnesium_serving?: number
  phosphorus_100g?: number
  phosphorus_serving?: number
  iron_100g?: number
  iron_serving?: number
  zinc_100g?: number
  zinc_serving?: number
  copper_100g?: number
  copper_serving?: number
  manganese_100g?: number
  manganese_serving?: number
  selenium_100g?: number
  selenium_serving?: number
  iodine_100g?: number
  iodine_serving?: number
  [key: string]: number | undefined
}

type OffProduct = {
  code?: string
  product_name?: string
  product_name_en?: string
  brands?: string
  serving_size?: string
  nutriments?: OffNutriments
}

type OffSearchResponse = {
  products?: OffProduct[]
  count?: number
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function num(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function foodKey(name: string, brand?: string): string {
  return `${name.trim().toLowerCase()}|${(brand ?? '').trim().toLowerCase()}`
}

/** OFF often stores sodium/salt in grams; convert to mg when value looks like g. */
function sodiumMgFromOff(sodium: number | null, salt: number | null): number | undefined {
  if (sodium !== null && Number.isFinite(sodium)) {
    // Typical sodium_100g is grams (0.01â€“2). Values > 20 are already mg-ish.
    return roundMineral(sodium <= 20 ? sodium * 1000 : sodium)
  }
  if (salt !== null && Number.isFinite(salt)) {
    // salt (g) â‰ˆ 40% sodium â†’ mg
    return roundMineral(salt * 400)
  }
  return undefined
}

function pickOffMineral(
  n: OffNutriments,
  base: string,
  preferServing: boolean
): number | null {
  const servingKey = `${base}_serving`
  const per100Key = `${base}_100g`
  if (preferServing) {
    const s = num(n[servingKey])
    if (s !== null) return s
  }
  const p = num(n[per100Key])
  if (p !== null) return p
  if (!preferServing) {
    const s = num(n[servingKey])
    if (s !== null) return s
  }
  return null
}

/**
 * Map Open Food Facts nutriments â†’ MineralMap (mg; selenium/iodine Âµg).
 * Uses serving values when macros came from serving; otherwise per-100g.
 */
function mineralsFromOff(n: OffNutriments, preferServing: boolean): MineralMap | undefined {
  const out: MineralMap = {}
  const sodium = sodiumMgFromOff(
    pickOffMineral(n, 'sodium', preferServing),
    pickOffMineral(n, 'salt', preferServing)
  )
  if (sodium !== undefined) out.sodium = sodium

  const simple: MineralKey[] = [
    'potassium',
    'calcium',
    'magnesium',
    'phosphorus',
    'iron',
    'zinc',
    'copper',
    'manganese',
    'selenium',
    'iodine'
  ]
  for (const key of simple) {
    const v = pickOffMineral(n, key, preferServing)
    if (v === null) continue
    // OFF mineral_100g is usually mg (Se/I often Âµg already)
    out[key] = roundMineral(v)
  }
  return normalizeMinerals(out)
}


function parseProduct(p: OffProduct, index: number): OnlineFoodCandidate | null {
  const name = (p.product_name || p.product_name_en || '').trim()
  if (!name) return null
  const n = p.nutriments ?? {}
  const kcalServing = num(n['energy-kcal_serving'])
  const proteinServing = num(n.proteins_serving)
  const carbsServing = num(n.carbohydrates_serving)
  const fatServing = num(n.fat_serving)
  const kcal100 = num(n['energy-kcal_100g']) ?? num(n['energy-kcal'])
  const protein100 = num(n.proteins_100g)
  const carbs100 = num(n.carbohydrates_100g)
  const fat100 = num(n.fat_100g)

  let kcal: number
  let protein: number
  let carbs: number
  let fat: number
  let servingLabel: string

  if (kcalServing !== null && kcalServing > 0) {
    kcal = kcalServing
    protein = proteinServing ?? 0
    carbs = carbsServing ?? 0
    fat = fatServing ?? 0
    servingLabel = (p.serving_size || '').trim() || '1 serving'
  } else if (kcal100 !== null && kcal100 > 0) {
    kcal = kcal100
    protein = protein100 ?? 0
    carbs = carbs100 ?? 0
    fat = fat100 ?? 0
    servingLabel = '100 g'
  } else {
    return null
  }

  const brand = (p.brands || '').split(',')[0]?.trim() || undefined
  const sourceId = (p.code && String(p.code)) || `off-${index}-${foodKey(name, brand)}`
  const preferServing = kcalServing !== null && kcalServing > 0
  const minerals = mineralsFromOff(n, preferServing)

  return {
    sourceId,
    source: 'openfoodfacts',
    name,
    brand,
    servingLabel,
    kcal: round1(kcal),
    protein: round1(protein),
    carbs: round1(carbs),
    fat: round1(fat),
    ...(minerals ? { minerals } : {})
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function offSearch(searchTerms: string, pageSize: number, page = 1): Promise<OffProduct[]> {
  const url = new URL(OFF_SEARCH)
  url.searchParams.set('search_terms', searchTerms)
  url.searchParams.set('search_simple', '1')
  url.searchParams.set('action', 'process')
  url.searchParams.set('json', '1')
  url.searchParams.set('page_size', String(pageSize))
  url.searchParams.set('page', String(page))
  url.searchParams.set(
    'fields',
    'code,product_name,product_name_en,brands,serving_size,nutriments'
  )

  let lastError: Error | null = null
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url.toString(), {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/json'
        }
      })
      if (res.status === 503 || res.status === 429 || res.status >= 500) {
        lastError = new Error(
          `Open Food Facts temporarily unavailable (${res.status}). Try again shortly.`
        )
        await sleep(600 * (attempt + 1))
        continue
      }
      if (!res.ok) {
        throw new Error(`Open Food Facts search failed (${res.status})`)
      }
      const text = await res.text()
      let data: OffSearchResponse
      try {
        data = JSON.parse(text) as OffSearchResponse
      } catch {
        throw new Error('Open Food Facts returned a non-JSON response')
      }
      return Array.isArray(data.products) ? data.products : []
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (attempt < 2) await sleep(600 * (attempt + 1))
    }
  }
  throw lastError ?? new Error('Open Food Facts search failed')
}

export async function searchOpenFoodFacts(
  query: string,
  pageSize = 25
): Promise<OnlineFoodCandidate[]> {
  const q = query.trim()
  if (!q) return []
  const products = await offSearch(q, Math.min(Math.max(pageSize, 1), 50))
  const out: OnlineFoodCandidate[] = []
  const seen = new Set<string>()
  products.forEach((p, i) => {
    const food = parseProduct(p, i)
    if (!food) return
    const key = foodKey(food.name, food.brand)
    if (seen.has(key)) return
    seen.add(key)
    out.push(food)
  })
  return out
}

/** Everyday search terms used to assemble a small common-foods pack (not a full corpus dump). */
const COMMON_QUERIES = [
  'apple', 'banana', 'orange', 'strawberry', 'blueberry', 'grape', 'mango', 'pineapple',
  'chicken breast', 'egg', 'whole milk', 'greek yogurt', 'cheddar cheese', 'butter',
  'oats', 'brown rice', 'white rice', 'pasta', 'whole wheat bread', 'white bread',
  'salmon', 'tuna canned', 'shrimp', 'ground beef', 'pork chop', 'turkey breast',
  'broccoli', 'carrot', 'spinach', 'tomato', 'potato', 'sweet potato', 'avocado',
  'almonds', 'peanut butter', 'olive oil', 'black beans', 'lentils', 'quinoa', 'tofu',
  'coffee', 'orange juice', 'protein powder', 'granola', 'honey',
  'cottage cheese', 'mozzarella', 'soy milk', 'almond milk', 'bagel', 'tortilla',
  'cucumber', 'onion', 'mushroom', 'corn', 'peas', 'cabbage', 'cauliflower',
  'walnuts', 'cashews', 'chia seeds', 'hummus', 'yogurt plain', 'skim milk',
  'chicken thigh', 'cod', 'tilapia', 'bacon', 'ham', 'sausage',
  'spaghetti', 'noodles', 'couscous', 'barley', 'cereal', 'cornflakes',
  'ice cream', 'dark chocolate', 'cracker', 'popcorn', 'potato chips',
  'tomato soup', 'chicken soup', 'salad greens', 'lettuce', 'bell pepper',
  'zucchini', 'garlic', 'soy sauce', 'mayonnaise', 'ketchup', 'mustard',
  'coconut oil', 'canola oil', 'sugar', 'flour', 'raisins', 'dates',
  'whey protein', 'protein bar', 'edamame', 'tempeh', 'feta cheese',
  'parmesan', 'cream cheese', 'sour cream', 'half and half',
  'baked potato', 'mashed potato', 'french fries', 'hash brown',
  'grilled chicken', 'roast chicken', 'steak', 'lamb',
  'pita bread', 'naan', 'dumpling', 'sushi', 'ramen',
  'blueberry muffin', 'pancake', 'waffle', 'oatmeal',
  'green beans', 'asparagus', 'kale', 'celery', 'beet',
  'watermelon', 'peach', 'pear', 'plum', 'kiwi', 'lemon', 'lime',
  'sunflower seeds', 'pumpkin seeds', 'pistachio', 'hazelnut',
  'maple syrup', 'jam', 'jelly', 'vinegar', 'coconut milk'
]

/**
 * Fetches ~200â€“500 everyday foods from Open Food Facts via many small searches.
 * Dedupes by name+brand and skips products without usable kcal.
 */
export async function fetchCommonFoodsPack(
  targetCount = 350
): Promise<OnlineFoodCandidate[]> {
  const out: OnlineFoodCandidate[] = []
  const seen = new Set<string>()
  let index = 0
  let failures = 0

  const batchSize = 4
  for (let i = 0; i < COMMON_QUERIES.length && out.length < targetCount; i += batchSize) {
    const batch = COMMON_QUERIES.slice(i, i + batchSize)
    const results = await Promise.all(
      batch.map(async (term) => {
        try {
          return await offSearch(term, 12)
        } catch {
          failures++
          return [] as OffProduct[]
        }
      })
    )
    for (const products of results) {
      for (const p of products) {
        if (out.length >= targetCount) break
        const food = parseProduct(p, index++)
        if (!food) continue
        const key = foodKey(food.name, food.brand)
        if (seen.has(key)) continue
        seen.add(key)
        out.push(food)
      }
    }
  }

  if (out.length === 0 && failures > 0) {
    throw new Error(
      'Open Food Facts is unreachable right now. Try again in a few minutes.'
    )
  }

  return out
}

/** Everyday drink search terms for the drinks pack (Open Food Facts). */
const DRINK_QUERIES = [
  'water', 'sparkling water', 'mineral water',
  'black coffee', 'espresso', 'latte', 'cappuccino', 'flat white', 'mocha', 'iced coffee',
  'americano', 'macchiato', 'cold brew coffee',
  'black tea', 'green tea', 'herbal tea', 'chai tea', 'english breakfast tea',
  'orange juice', 'apple juice', 'grape juice', 'cranberry juice', 'pineapple juice', 'tomato juice',
  'cola', 'diet cola', 'lemonade', 'ginger ale', 'sprite', 'tonic water',
  'whole milk', 'skim milk', 'semi skimmed milk', 'almond milk', 'soy milk', 'oat milk', 'coconut milk drink',
  'hot chocolate', 'chocolate milk',
  'smoothie', 'berry smoothie', 'banana smoothie', 'green smoothie',
  'sports drink', 'gatorade', 'electrolyte drink',
  'energy drink', 'kombucha', 'coconut water',
  'beer', 'red wine', 'white wine'
]

/**
 * Curated everyday drinks with realistic per-serving nutrition.
 * Used as a reliable seed and fallback when Open Food Facts is flaky.
 */
const DRINK_SEED: OnlineFoodCandidate[] = [
  { sourceId: 'seed-water-plain', source: 'openfoodfacts', name: 'Water (plain)', servingLabel: '250 ml', kcal: 0, protein: 0, carbs: 0, fat: 0,
    minerals: { sodium: 2, potassium: 0, calcium: 2, magnesium: 1 } },
  { sourceId: 'seed-water-sparkling', source: 'openfoodfacts', name: 'Sparkling water', servingLabel: '250 ml', kcal: 0, protein: 0, carbs: 0, fat: 0,
    minerals: { sodium: 5, potassium: 0, calcium: 5, magnesium: 2 } },
  { sourceId: 'seed-coffee-black', source: 'openfoodfacts', name: 'Black coffee (brewed)', servingLabel: '240 ml', kcal: 2, protein: 0.3, carbs: 0, fat: 0,
    minerals: { sodium: 5, potassium: 116, calcium: 5, magnesium: 7, phosphorus: 3, manganese: 0.05 } },
  { sourceId: 'seed-espresso', source: 'openfoodfacts', name: 'Espresso', servingLabel: '30 ml', kcal: 3, protein: 0.1, carbs: 0.5, fat: 0.1,
    minerals: { sodium: 4, potassium: 35, magnesium: 24, phosphorus: 2 } },
  { sourceId: 'seed-americano', source: 'openfoodfacts', name: 'Americano', servingLabel: '240 ml', kcal: 5, protein: 0.3, carbs: 1, fat: 0,
    minerals: { sodium: 5, potassium: 110, magnesium: 10 } },
  { sourceId: 'seed-latte', source: 'openfoodfacts', name: 'Latte (whole milk)', servingLabel: '240 ml', kcal: 140, protein: 7, carbs: 11, fat: 7,
    minerals: { sodium: 100, potassium: 300, calcium: 250, magnesium: 24, phosphorus: 200, iodine: 45, selenium: 8 } },
  { sourceId: 'seed-cappuccino', source: 'openfoodfacts', name: 'Cappuccino', servingLabel: '180 ml', kcal: 80, protein: 4.5, carbs: 6, fat: 4,
    minerals: { sodium: 70, potassium: 200, calcium: 160, magnesium: 18, phosphorus: 140, iodine: 30 } },
  { sourceId: 'seed-flat-white', source: 'openfoodfacts', name: 'Flat white', servingLabel: '160 ml', kcal: 120, protein: 6, carbs: 9, fat: 6.5,
    minerals: { sodium: 85, potassium: 250, calcium: 210, magnesium: 20, phosphorus: 180, iodine: 38 } },
  { sourceId: 'seed-mocha', source: 'openfoodfacts', name: 'Mocha', servingLabel: '350 ml', kcal: 290, protein: 10, carbs: 35, fat: 12,
    minerals: { sodium: 150, potassium: 400, calcium: 280, magnesium: 50, phosphorus: 250, iron: 1.2 } },
  { sourceId: 'seed-iced-coffee', source: 'openfoodfacts', name: 'Iced coffee (sweetened)', servingLabel: '350 ml', kcal: 120, protein: 2, carbs: 24, fat: 2,
    minerals: { sodium: 40, potassium: 180, calcium: 60, magnesium: 20 } },
  { sourceId: 'seed-cold-brew', source: 'openfoodfacts', name: 'Cold brew coffee (black)', servingLabel: '350 ml', kcal: 5, protein: 0.3, carbs: 0, fat: 0,
    minerals: { sodium: 7, potassium: 150, magnesium: 10 } },
  { sourceId: 'seed-macchiato', source: 'openfoodfacts', name: 'Macchiato', servingLabel: '60 ml', kcal: 13, protein: 0.7, carbs: 1, fat: 0.7,
    minerals: { sodium: 15, potassium: 60, calcium: 25, magnesium: 20 } },
  { sourceId: 'seed-tea-black', source: 'openfoodfacts', name: 'Black tea (unsweetened)', servingLabel: '240 ml', kcal: 2, protein: 0, carbs: 0.5, fat: 0,
    minerals: { sodium: 7, potassium: 88, magnesium: 7, manganese: 0.5 } },
  { sourceId: 'seed-tea-green', source: 'openfoodfacts', name: 'Green tea (unsweetened)', servingLabel: '240 ml', kcal: 2, protein: 0, carbs: 0, fat: 0,
    minerals: { sodium: 2, potassium: 20, magnesium: 2, manganese: 0.4 } },
  { sourceId: 'seed-tea-herbal', source: 'openfoodfacts', name: 'Herbal tea (unsweetened)', servingLabel: '240 ml', kcal: 2, protein: 0, carbs: 0.5, fat: 0,
    minerals: { sodium: 2, potassium: 20, magnesium: 2 } },
  { sourceId: 'seed-chai', source: 'openfoodfacts', name: 'Chai latte', servingLabel: '240 ml', kcal: 180, protein: 6, carbs: 28, fat: 5,
    minerals: { sodium: 90, potassium: 280, calcium: 200, magnesium: 25, phosphorus: 170 } },
  { sourceId: 'seed-oj', source: 'openfoodfacts', name: 'Orange juice', servingLabel: '250 ml', kcal: 112, protein: 1.7, carbs: 26, fat: 0.3,
    minerals: { sodium: 2, potassium: 496, calcium: 27, magnesium: 27, phosphorus: 42, iron: 0.5 } },
  { sourceId: 'seed-apple-juice', source: 'openfoodfacts', name: 'Apple juice', servingLabel: '250 ml', kcal: 114, protein: 0.3, carbs: 28, fat: 0.3,
    minerals: { sodium: 10, potassium: 250, calcium: 20, magnesium: 12, phosphorus: 15, iron: 0.3 } },
  { sourceId: 'seed-grape-juice', source: 'openfoodfacts', name: 'Grape juice', servingLabel: '250 ml', kcal: 152, protein: 0.9, carbs: 37, fat: 0.2,
    minerals: { sodium: 8, potassium: 334, calcium: 23, magnesium: 20, phosphorus: 25, iron: 0.5 } },
  { sourceId: 'seed-cranberry-juice', source: 'openfoodfacts', name: 'Cranberry juice cocktail', servingLabel: '250 ml', kcal: 137, protein: 0, carbs: 34, fat: 0.3,
    minerals: { sodium: 5, potassium: 50, calcium: 8, magnesium: 5 } },
  { sourceId: 'seed-pineapple-juice', source: 'openfoodfacts', name: 'Pineapple juice', servingLabel: '250 ml', kcal: 132, protein: 0.9, carbs: 32, fat: 0.3,
    minerals: { sodium: 2, potassium: 325, calcium: 32, magnesium: 30, phosphorus: 20, manganese: 1.3 } },
  { sourceId: 'seed-tomato-juice', source: 'openfoodfacts', name: 'Tomato juice', servingLabel: '250 ml', kcal: 42, protein: 2, carbs: 9, fat: 0.2,
    minerals: { sodium: 640, potassium: 556, calcium: 25, magnesium: 25, phosphorus: 45, iron: 1 } },
  { sourceId: 'seed-cola', source: 'openfoodfacts', name: 'Cola (regular)', servingLabel: '330 ml', kcal: 139, protein: 0, carbs: 35, fat: 0,
    minerals: { sodium: 15, potassium: 5, phosphorus: 50 } },
  { sourceId: 'seed-diet-cola', source: 'openfoodfacts', name: 'Diet cola', servingLabel: '330 ml', kcal: 1, protein: 0, carbs: 0, fat: 0,
    minerals: { sodium: 30, potassium: 20, phosphorus: 40 } },
  { sourceId: 'seed-lemonade', source: 'openfoodfacts', name: 'Lemonade', servingLabel: '330 ml', kcal: 140, protein: 0, carbs: 36, fat: 0,
    minerals: { sodium: 10, potassium: 20 } },
  { sourceId: 'seed-ginger-ale', source: 'openfoodfacts', name: 'Ginger ale', servingLabel: '330 ml', kcal: 124, protein: 0, carbs: 32, fat: 0,
    minerals: { sodium: 20, potassium: 5 } },
  { sourceId: 'seed-lemon-lime-soda', source: 'openfoodfacts', name: 'Lemon-lime soda', servingLabel: '330 ml', kcal: 140, protein: 0, carbs: 38, fat: 0,
    minerals: { sodium: 35, potassium: 5 } },
  { sourceId: 'seed-tonic', source: 'openfoodfacts', name: 'Tonic water', servingLabel: '250 ml', kcal: 83, protein: 0, carbs: 22, fat: 0,
    minerals: { sodium: 15, potassium: 0 } },
  { sourceId: 'seed-milk-whole', source: 'openfoodfacts', name: 'Whole milk', servingLabel: '250 ml', kcal: 149, protein: 7.7, carbs: 12, fat: 8,
    minerals: { sodium: 105, potassium: 322, calcium: 276, magnesium: 24, phosphorus: 222, zinc: 0.9, selenium: 9, iodine: 50 } },
  { sourceId: 'seed-milk-skim', source: 'openfoodfacts', name: 'Skim milk', servingLabel: '250 ml', kcal: 91, protein: 8.7, carbs: 12.5, fat: 0.2,
    minerals: { sodium: 105, potassium: 380, calcium: 300, magnesium: 28, phosphorus: 250, zinc: 1, selenium: 8, iodine: 55 } },
  { sourceId: 'seed-milk-semi', source: 'openfoodfacts', name: 'Semi-skimmed milk', servingLabel: '250 ml', kcal: 117, protein: 8.5, carbs: 12, fat: 4,
    minerals: { sodium: 105, potassium: 350, calcium: 290, magnesium: 26, phosphorus: 235, zinc: 0.9, selenium: 8, iodine: 52 } },
  { sourceId: 'seed-almond-milk', source: 'openfoodfacts', name: 'Almond milk (unsweetened)', servingLabel: '250 ml', kcal: 37, protein: 1.3, carbs: 1.4, fat: 3,
    minerals: { sodium: 150, potassium: 40, calcium: 450, magnesium: 15, phosphorus: 20, iron: 0.5 } },
  { sourceId: 'seed-soy-milk', source: 'openfoodfacts', name: 'Soy milk', servingLabel: '250 ml', kcal: 80, protein: 7, carbs: 4, fat: 4,
    minerals: { sodium: 90, potassium: 300, calcium: 300, magnesium: 40, phosphorus: 120, iron: 1, zinc: 0.6 } },
  { sourceId: 'seed-oat-milk', source: 'openfoodfacts', name: 'Oat milk', servingLabel: '250 ml', kcal: 120, protein: 3, carbs: 16, fat: 5,
    minerals: { sodium: 100, potassium: 200, calcium: 350, magnesium: 20, phosphorus: 120, iron: 0.5 } },
  { sourceId: 'seed-coconut-milk-drink', source: 'openfoodfacts', name: 'Coconut milk drink', servingLabel: '250 ml', kcal: 45, protein: 0.5, carbs: 6, fat: 2.5,
    minerals: { sodium: 40, potassium: 50, calcium: 200, magnesium: 10, iron: 0.3 } },
  { sourceId: 'seed-hot-chocolate', source: 'openfoodfacts', name: 'Hot chocolate', servingLabel: '240 ml', kcal: 190, protein: 8, carbs: 28, fat: 6,
    minerals: { sodium: 150, potassium: 400, calcium: 280, magnesium: 50, phosphorus: 220, iron: 1.5, zinc: 1 } },
  { sourceId: 'seed-chocolate-milk', source: 'openfoodfacts', name: 'Chocolate milk', servingLabel: '250 ml', kcal: 208, protein: 8, carbs: 26, fat: 8.5,
    minerals: { sodium: 150, potassium: 425, calcium: 280, magnesium: 40, phosphorus: 240, iron: 0.8, iodine: 45 } },
  { sourceId: 'seed-smoothie-berry', source: 'openfoodfacts', name: 'Berry smoothie', servingLabel: '300 ml', kcal: 180, protein: 4, carbs: 38, fat: 1.5,
    minerals: { sodium: 40, potassium: 350, calcium: 80, magnesium: 30, phosphorus: 80, iron: 1, manganese: 0.8 } },
  { sourceId: 'seed-smoothie-banana', source: 'openfoodfacts', name: 'Banana smoothie', servingLabel: '300 ml', kcal: 210, protein: 6, carbs: 42, fat: 2.5,
    minerals: { sodium: 50, potassium: 550, calcium: 150, magnesium: 50, phosphorus: 120, iron: 0.6 } },
  { sourceId: 'seed-smoothie-green', source: 'openfoodfacts', name: 'Green smoothie', servingLabel: '300 ml', kcal: 150, protein: 4, carbs: 30, fat: 2,
    minerals: { sodium: 40, potassium: 500, calcium: 100, magnesium: 60, phosphorus: 80, iron: 1.5, manganese: 0.6 } },
  { sourceId: 'seed-sports-drink', source: 'openfoodfacts', name: 'Sports drink', servingLabel: '500 ml', kcal: 120, protein: 0, carbs: 30, fat: 0,
    minerals: { sodium: 270, potassium: 75, magnesium: 10, calcium: 5 } },
  { sourceId: 'seed-coconut-water', source: 'openfoodfacts', name: 'Coconut water', servingLabel: '330 ml', kcal: 60, protein: 0.7, carbs: 15, fat: 0,
    minerals: { sodium: 105, potassium: 600, calcium: 60, magnesium: 25, phosphorus: 50, manganese: 0.5 } },
  { sourceId: 'seed-kombucha', source: 'openfoodfacts', name: 'Kombucha', servingLabel: '330 ml', kcal: 35, protein: 0, carbs: 8, fat: 0,
    minerals: { sodium: 10, potassium: 30 } },
  { sourceId: 'seed-energy-drink', source: 'openfoodfacts', name: 'Energy drink', servingLabel: '250 ml', kcal: 110, protein: 0, carbs: 28, fat: 0,
    minerals: { sodium: 100, potassium: 10 } },
  { sourceId: 'seed-beer', source: 'openfoodfacts', name: 'Beer (lager)', servingLabel: '330 ml', kcal: 140, protein: 1.2, carbs: 11, fat: 0,
    minerals: { sodium: 10, potassium: 90, magnesium: 20, phosphorus: 40 } },
  { sourceId: 'seed-wine-red', source: 'openfoodfacts', name: 'Red wine', servingLabel: '150 ml', kcal: 125, protein: 0.1, carbs: 4, fat: 0,
    minerals: { sodium: 5, potassium: 180, magnesium: 15, phosphorus: 30, iron: 0.5, manganese: 0.2 } },
  { sourceId: 'seed-wine-white', source: 'openfoodfacts', name: 'White wine', servingLabel: '150 ml', kcal: 121, protein: 0.1, carbs: 4, fat: 0,
    minerals: { sodium: 5, potassium: 150, magnesium: 12, phosphorus: 25 } }
]

/**
 * Builds a drinks pack: curated seed first, then Open Food Facts drink searches.
 * Dedupes by name+brand. Seed ensures useful drinks even when OFF is unreachable.
 */
export async function fetchDrinksPack(
  targetCount = 120
): Promise<OnlineFoodCandidate[]> {
  const out: OnlineFoodCandidate[] = []
  const seen = new Set<string>()
  let index = 0
  let failures = 0

  for (const seed of DRINK_SEED) {
    const key = foodKey(seed.name, seed.brand)
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ ...seed })
  }

  const batchSize = 4
  for (let i = 0; i < DRINK_QUERIES.length && out.length < targetCount; i += batchSize) {
    const batch = DRINK_QUERIES.slice(i, i + batchSize)
    const results = await Promise.all(
      batch.map(async (term) => {
        try {
          return await offSearch(term, 10)
        } catch {
          failures++
          return [] as OffProduct[]
        }
      })
    )
    for (const products of results) {
      for (const p of products) {
        if (out.length >= targetCount) break
        const food = parseProduct(p, index++)
        if (!food) continue
        const key = foodKey(food.name, food.brand)
        if (seen.has(key)) continue
        seen.add(key)
        out.push(food)
      }
    }
  }

  if (out.length === 0 && failures > 0) {
    throw new Error(
      'Open Food Facts is unreachable right now. Try again in a few minutes.'
    )
  }

  return out
}

export function toFoodInput(c: OnlineFoodCandidate): Omit<Food, 'id'> {
  const minerals = normalizeMinerals(c.minerals)
  return {
    name: c.name,
    brand: c.brand,
    servingLabel: c.servingLabel,
    kcal: c.kcal,
    protein: c.protein,
    carbs: c.carbs,
    fat: c.fat,
    ...(minerals ? { minerals } : {})
  }
}
export function getDrinkSeedInputs(): Omit<Food, 'id'>[] {
  return DRINK_SEED.map(toFoodInput)
}

/** Everyday homemade / home-cooked search terms for optional OFF enrichment. */
const HOMEMADE_QUERIES = [
  'fried egg', 'scrambled eggs', 'boiled egg', 'omelette',
  'steamed fish', 'fried fish', 'grilled fish', 'fried chicken',
  'fried pork', 'beef stir fry', 'steamed rice', 'fried rice',
  'mashed potato', 'roast potato', 'chicken soup', 'vegetable soup',
  'dumpling', 'wonton soup', 'mapo tofu', 'stir fried vegetables',
  'pancakes homemade', 'porridge', 'bacon fried', 'sausage fried'
]

/**
 * Curated everyday homemade / home-cooked dishes with realistic per-serving nutrition.
 * Used as a reliable seed and fallback when Open Food Facts is flaky.
 */
const HOMEMADE_SEED: OnlineFoodCandidate[] = [
  // Eggs
  { sourceId: 'seed-hm-egg-boiled', source: 'openfoodfacts', name: 'Boiled egg', servingLabel: '1 large (50 g)', kcal: 78, protein: 6.3, carbs: 0.6, fat: 5.3,
    minerals: { sodium: 62, potassium: 63, calcium: 25, magnesium: 5, phosphorus: 86, iron: 0.6, zinc: 0.5, selenium: 15, iodine: 24 } },
  { sourceId: 'seed-hm-eggs-scrambled', source: 'openfoodfacts', name: 'Scrambled eggs', servingLabel: '2 eggs (100 g)', kcal: 168, protein: 11, carbs: 2, fat: 12,
    minerals: { sodium: 180, potassium: 140, calcium: 70, magnesium: 12, phosphorus: 180, iron: 1.5, selenium: 28, iodine: 45 } },
  { sourceId: 'seed-hm-egg-fried-sunny', source: 'openfoodfacts', name: 'Fried egg (sunny side)', servingLabel: '1 egg (50 g)', kcal: 90, protein: 6.3, carbs: 0.4, fat: 7,
    minerals: { sodium: 90, potassium: 70, calcium: 28, magnesium: 6, phosphorus: 99, iron: 0.9, selenium: 15, iodine: 24 } },
  { sourceId: 'seed-hm-eggs-fried-2', source: 'openfoodfacts', name: 'Fried eggs (2)', servingLabel: '2 eggs (100 g)', kcal: 180, protein: 12.6, carbs: 0.8, fat: 14,
    minerals: { sodium: 180, potassium: 140, calcium: 56, magnesium: 12, phosphorus: 198, iron: 1.8, selenium: 30, iodine: 48 } },
  { sourceId: 'seed-hm-omelette-plain', source: 'openfoodfacts', name: 'Omelette plain', servingLabel: '2-egg omelette', kcal: 175, protein: 12, carbs: 1, fat: 13.5,
    minerals: { sodium: 200, potassium: 150, calcium: 60, magnesium: 12, phosphorus: 200, iron: 1.6, selenium: 28, iodine: 45 } },
  { sourceId: 'seed-hm-omelette-cheese', source: 'openfoodfacts', name: 'Cheese omelette', servingLabel: '2-egg with cheese', kcal: 250, protein: 16, carbs: 2, fat: 19,
    minerals: { sodium: 380, potassium: 170, calcium: 220, magnesium: 18, phosphorus: 300, iron: 1.6, selenium: 30, iodine: 50 } },
  { sourceId: 'seed-hm-egg-fried-rice', source: 'openfoodfacts', name: 'Egg fried rice (small bowl)', servingLabel: '1 small bowl (200 g)', kcal: 310, protein: 10, carbs: 42, fat: 11,
    minerals: { sodium: 520, potassium: 140, calcium: 30, magnesium: 25, phosphorus: 120, iron: 1.5, selenium: 18 } },
  { sourceId: 'seed-hm-eggs-scrambled-milk', source: 'openfoodfacts', name: 'Scrambled eggs with milk', servingLabel: '2 eggs + splash milk', kcal: 190, protein: 13, carbs: 3, fat: 13,
    minerals: { sodium: 200, potassium: 200, calcium: 120, magnesium: 16, phosphorus: 230, iron: 1.5, selenium: 28, iodine: 55 } },

  // Fish / seafood home cook
  { sourceId: 'seed-hm-fish-steamed-white', source: 'openfoodfacts', name: 'Steamed white fish fillet', servingLabel: '150 g cooked', kcal: 150, protein: 30, carbs: 0, fat: 3,
    minerals: { sodium: 90, potassium: 450, calcium: 20, magnesium: 40, phosphorus: 280, iron: 0.5, selenium: 45, iodine: 50 } },
  { sourceId: 'seed-hm-salmon-steamed', source: 'openfoodfacts', name: 'Steamed salmon', servingLabel: '120 g cooked', kcal: 230, protein: 25, carbs: 0, fat: 14,
    minerals: { sodium: 70, potassium: 420, calcium: 12, magnesium: 35, phosphorus: 280, iron: 0.5, selenium: 40, iodine: 20 } },
  { sourceId: 'seed-hm-fish-panfried', source: 'openfoodfacts', name: 'Pan-fried fish', servingLabel: '150 g cooked', kcal: 220, protein: 28, carbs: 0, fat: 11,
    minerals: { sodium: 150, potassium: 400, calcium: 25, magnesium: 40, phosphorus: 260, iron: 0.6, selenium: 42, iodine: 40 } },
  { sourceId: 'seed-hm-fish-battered', source: 'openfoodfacts', name: 'Battered fried fish', servingLabel: '1 piece (150 g)', kcal: 340, protein: 22, carbs: 22, fat: 18,
    minerals: { sodium: 420, potassium: 300, calcium: 30, magnesium: 30, phosphorus: 220, iron: 1.2, selenium: 35 } },
  { sourceId: 'seed-hm-fish-grilled', source: 'openfoodfacts', name: 'Grilled fish', servingLabel: '150 g cooked', kcal: 180, protein: 30, carbs: 0, fat: 6,
    minerals: { sodium: 100, potassium: 450, calcium: 25, magnesium: 40, phosphorus: 280, iron: 0.5, selenium: 45, iodine: 45 } },
  { sourceId: 'seed-hm-fish-stirfry', source: 'openfoodfacts', name: 'Fish stir-fry', servingLabel: '1 serve (250 g)', kcal: 280, protein: 28, carbs: 12, fat: 14,
    minerals: { sodium: 550, potassium: 500, calcium: 50, magnesium: 45, phosphorus: 280, iron: 1.2, selenium: 40 } },
  { sourceId: 'seed-hm-prawns-stirfried', source: 'openfoodfacts', name: 'Prawns stir-fried', servingLabel: '1 serve (180 g)', kcal: 200, protein: 28, carbs: 6, fat: 7,
    minerals: { sodium: 600, potassium: 280, calcium: 80, magnesium: 45, phosphorus: 250, iron: 1.5, selenium: 40, iodine: 60 } },
  { sourceId: 'seed-hm-tuna-steak-grilled', source: 'openfoodfacts', name: 'Tuna steak grilled', servingLabel: '150 g cooked', kcal: 220, protein: 40, carbs: 0, fat: 5,
    minerals: { sodium: 80, potassium: 500, calcium: 20, magnesium: 50, phosphorus: 300, iron: 1.5, selenium: 90, iodine: 30 } },

  // Fried / pan meats
  { sourceId: 'seed-hm-chicken-thigh-fried', source: 'openfoodfacts', name: 'Fried chicken thigh', servingLabel: '1 thigh (120 g)', kcal: 290, protein: 26, carbs: 2, fat: 20,
    minerals: { sodium: 280, potassium: 280, calcium: 15, magnesium: 25, phosphorus: 200, iron: 1.2, zinc: 2, selenium: 25 } },
  { sourceId: 'seed-hm-chicken-breast-fried', source: 'openfoodfacts', name: 'Fried chicken breast', servingLabel: '1 breast (140 g)', kcal: 260, protein: 35, carbs: 3, fat: 11,
    minerals: { sodium: 250, potassium: 350, calcium: 15, magnesium: 30, phosphorus: 260, iron: 1, zinc: 1.2, selenium: 30 } },
  { sourceId: 'seed-hm-beef-steak-panfried', source: 'openfoodfacts', name: 'Pan-fried beef steak', servingLabel: '150 g cooked', kcal: 320, protein: 36, carbs: 0, fat: 19,
    minerals: { sodium: 90, potassium: 420, calcium: 15, magnesium: 30, phosphorus: 280, iron: 3, zinc: 6, selenium: 28 } },
  { sourceId: 'seed-hm-pork-chop-fried', source: 'openfoodfacts', name: 'Fried pork chop', servingLabel: '1 chop (140 g)', kcal: 310, protein: 32, carbs: 0, fat: 19,
    minerals: { sodium: 100, potassium: 400, calcium: 20, magnesium: 28, phosphorus: 260, iron: 1.2, zinc: 3, selenium: 35 } },
  { sourceId: 'seed-hm-bacon-fried', source: 'openfoodfacts', name: 'Bacon fried', servingLabel: '2 rasher (40 g)', kcal: 180, protein: 12, carbs: 0.5, fat: 14,
    minerals: { sodium: 580, potassium: 180, calcium: 5, magnesium: 10, phosphorus: 140, iron: 0.5, zinc: 1.2, selenium: 15 } },
  { sourceId: 'seed-hm-sausage-fried', source: 'openfoodfacts', name: 'Sausage fried', servingLabel: '2 sausages (100 g)', kcal: 280, protein: 14, carbs: 6, fat: 22,
    minerals: { sodium: 700, potassium: 220, calcium: 20, magnesium: 15, phosphorus: 140, iron: 1.2, zinc: 2, selenium: 12 } },
  { sourceId: 'seed-hm-lamb-chop-grilled', source: 'openfoodfacts', name: 'Lamb chop grilled', servingLabel: '1 chop (120 g)', kcal: 290, protein: 28, carbs: 0, fat: 20,
    minerals: { sodium: 80, potassium: 320, calcium: 15, magnesium: 25, phosphorus: 220, iron: 2, zinc: 4, selenium: 20 } },
  { sourceId: 'seed-hm-minced-beef-fried', source: 'openfoodfacts', name: 'Minced beef fried', servingLabel: '100 g cooked', kcal: 250, protein: 26, carbs: 0, fat: 16,
    minerals: { sodium: 80, potassium: 320, calcium: 15, magnesium: 22, phosphorus: 200, iron: 2.5, zinc: 5, selenium: 20 } },
  { sourceId: 'seed-hm-beef-stirfried', source: 'openfoodfacts', name: 'Stir-fried beef', servingLabel: '1 serve (200 g)', kcal: 320, protein: 30, carbs: 10, fat: 18,
    minerals: { sodium: 650, potassium: 450, calcium: 40, magnesium: 35, phosphorus: 250, iron: 3, zinc: 5, selenium: 22 } },
  { sourceId: 'seed-hm-chicken-stirfried', source: 'openfoodfacts', name: 'Stir-fried chicken', servingLabel: '1 serve (200 g)', kcal: 280, protein: 32, carbs: 10, fat: 12,
    minerals: { sodium: 600, potassium: 400, calcium: 35, magnesium: 35, phosphorus: 260, iron: 1.5, zinc: 1.5, selenium: 28 } },
  { sourceId: 'seed-hm-sweet-sour-pork', source: 'openfoodfacts', name: 'Sweet and sour pork (home)', servingLabel: '1 serve (250 g)', kcal: 420, protein: 24, carbs: 40, fat: 18,
    minerals: { sodium: 750, potassium: 380, calcium: 40, magnesium: 30, phosphorus: 220, iron: 1.5, zinc: 2.5 } },
  { sourceId: 'seed-hm-roast-chicken-portion', source: 'openfoodfacts', name: 'Roast chicken portion', servingLabel: '1 portion (150 g)', kcal: 250, protein: 32, carbs: 0, fat: 13,
    minerals: { sodium: 120, potassium: 320, calcium: 18, magnesium: 28, phosphorus: 240, iron: 1.2, zinc: 1.8, selenium: 28 } },

  // Home veg / sides
  { sourceId: 'seed-hm-veg-stirfried', source: 'openfoodfacts', name: 'Stir-fried mixed vegetables', servingLabel: '1 serve (200 g)', kcal: 120, protein: 4, carbs: 14, fat: 6,
    minerals: { sodium: 350, potassium: 450, calcium: 60, magnesium: 35, phosphorus: 80, iron: 1.5, manganese: 0.4 } },
  { sourceId: 'seed-hm-broccoli-steamed', source: 'openfoodfacts', name: 'Steamed broccoli', servingLabel: '1 cup (150 g)', kcal: 50, protein: 4, carbs: 10, fat: 0.5,
    minerals: { sodium: 50, potassium: 450, calcium: 60, magnesium: 30, phosphorus: 100, iron: 1, manganese: 0.3 } },
  { sourceId: 'seed-hm-bok-choy-steamed', source: 'openfoodfacts', name: 'Steamed bok choy', servingLabel: '1 cup (150 g)', kcal: 20, protein: 2, carbs: 3, fat: 0.3,
    minerals: { sodium: 90, potassium: 380, calcium: 150, magnesium: 25, phosphorus: 50, iron: 1.2 } },
  { sourceId: 'seed-hm-fried-rice-plain', source: 'openfoodfacts', name: 'Fried rice plain', servingLabel: '1 bowl (200 g)', kcal: 280, protein: 6, carbs: 45, fat: 8,
    minerals: { sodium: 450, potassium: 80, calcium: 20, magnesium: 20, phosphorus: 70, iron: 1, selenium: 10 } },
  { sourceId: 'seed-hm-steamed-rice-bowl', source: 'openfoodfacts', name: 'Steamed rice bowl', servingLabel: '1 bowl (180 g)', kcal: 230, protein: 4.5, carbs: 50, fat: 0.5,
    minerals: { sodium: 5, potassium: 55, calcium: 15, magnesium: 20, phosphorus: 70, iron: 0.4, selenium: 12 } },
  { sourceId: 'seed-hm-mashed-potato', source: 'openfoodfacts', name: 'Mashed potato', servingLabel: '1 cup (210 g)', kcal: 210, protein: 4, carbs: 35, fat: 7,
    minerals: { sodium: 350, potassium: 620, calcium: 40, magnesium: 30, phosphorus: 90, iron: 0.6 } },
  { sourceId: 'seed-hm-roast-potato', source: 'openfoodfacts', name: 'Roast potato', servingLabel: '150 g', kcal: 200, protein: 3.5, carbs: 32, fat: 7,
    minerals: { sodium: 200, potassium: 550, calcium: 20, magnesium: 30, phosphorus: 80, iron: 1 } },
  { sourceId: 'seed-hm-home-fries', source: 'openfoodfacts', name: 'Home fries', servingLabel: '1 cup (150 g)', kcal: 250, protein: 3, carbs: 30, fat: 13,
    minerals: { sodium: 400, potassium: 500, calcium: 20, magnesium: 25, phosphorus: 70, iron: 1 } },
  { sourceId: 'seed-hm-toast-butter', source: 'openfoodfacts', name: 'Toast with butter', servingLabel: '1 slice + butter', kcal: 140, protein: 4, carbs: 15, fat: 7,
    minerals: { sodium: 200, potassium: 50, calcium: 30, magnesium: 15, phosphorus: 50, iron: 0.8, selenium: 8 } },
  { sourceId: 'seed-hm-pancake', source: 'openfoodfacts', name: 'Pancake homemade', servingLabel: '2 pancakes (100 g)', kcal: 220, protein: 6, carbs: 30, fat: 8,
    minerals: { sodium: 350, potassium: 150, calcium: 100, magnesium: 20, phosphorus: 150, iron: 1.5 } },
  { sourceId: 'seed-hm-porridge-congee', source: 'openfoodfacts', name: 'Porridge / congee plain', servingLabel: '1 bowl (300 g)', kcal: 150, protein: 3, carbs: 32, fat: 1,
    minerals: { sodium: 10, potassium: 40, calcium: 10, magnesium: 15, phosphorus: 40, iron: 0.4 } },

  // Dairy-ish home breakfast
  { sourceId: 'seed-hm-cottage-cheese', source: 'openfoodfacts', name: 'Cottage cheese', servingLabel: '100 g', kcal: 98, protein: 11, carbs: 3.4, fat: 4.3,
    minerals: { sodium: 360, potassium: 100, calcium: 80, magnesium: 8, phosphorus: 160, selenium: 10, iodine: 20 } },
  { sourceId: 'seed-hm-yogurt-bowl', source: 'openfoodfacts', name: 'Homemade yogurt bowl', servingLabel: '1 bowl (200 g)', kcal: 180, protein: 12, carbs: 22, fat: 4,
    minerals: { sodium: 80, potassium: 300, calcium: 250, magnesium: 25, phosphorus: 220, selenium: 8, iodine: 40 } },

  // Soups / stews
  { sourceId: 'seed-hm-chicken-soup', source: 'openfoodfacts', name: 'Chicken soup homemade', servingLabel: '1 bowl (300 ml)', kcal: 120, protein: 12, carbs: 8, fat: 4,
    minerals: { sodium: 600, potassium: 350, calcium: 30, magnesium: 20, phosphorus: 120, iron: 0.8, zinc: 0.8 } },
  { sourceId: 'seed-hm-vegetable-soup', source: 'openfoodfacts', name: 'Vegetable soup', servingLabel: '1 bowl (300 ml)', kcal: 90, protein: 3, carbs: 15, fat: 2.5,
    minerals: { sodium: 550, potassium: 450, calcium: 50, magnesium: 25, phosphorus: 60, iron: 1.2 } },
  { sourceId: 'seed-hm-beef-stew', source: 'openfoodfacts', name: 'Beef stew portion', servingLabel: '1 serve (300 g)', kcal: 320, protein: 28, carbs: 18, fat: 14,
    minerals: { sodium: 650, potassium: 600, calcium: 40, magnesium: 40, phosphorus: 250, iron: 3.5, zinc: 5 } },

  // Asian home staples (AU)
  { sourceId: 'seed-hm-dumpling-steamed-3', source: 'openfoodfacts', name: 'Steamed dumpling (3)', servingLabel: '3 dumplings (90 g)', kcal: 180, protein: 9, carbs: 22, fat: 6,
    minerals: { sodium: 400, potassium: 120, calcium: 30, magnesium: 15, phosphorus: 90, iron: 1.2 } },
  { sourceId: 'seed-hm-wonton-soup', source: 'openfoodfacts', name: 'Wonton soup bowl', servingLabel: '1 bowl (350 ml)', kcal: 220, protein: 14, carbs: 24, fat: 7,
    minerals: { sodium: 900, potassium: 250, calcium: 40, magnesium: 25, phosphorus: 140, iron: 1.5 } },
  { sourceId: 'seed-hm-noodle-soup', source: 'openfoodfacts', name: 'Noodle soup homemade', servingLabel: '1 bowl (400 ml)', kcal: 350, protein: 18, carbs: 45, fat: 10,
    minerals: { sodium: 950, potassium: 300, calcium: 40, magnesium: 30, phosphorus: 180, iron: 2 } },
  { sourceId: 'seed-hm-tofu-stirfry', source: 'openfoodfacts', name: 'Tofu stir-fry', servingLabel: '1 serve (220 g)', kcal: 220, protein: 16, carbs: 12, fat: 12,
    minerals: { sodium: 500, potassium: 350, calcium: 200, magnesium: 60, phosphorus: 180, iron: 3, manganese: 0.8 } },
  { sourceId: 'seed-hm-mapo-tofu', source: 'openfoodfacts', name: 'Mapo tofu mild portion', servingLabel: '1 serve (250 g)', kcal: 280, protein: 18, carbs: 12, fat: 18,
    minerals: { sodium: 800, potassium: 400, calcium: 250, magnesium: 70, phosphorus: 200, iron: 3.5, manganese: 0.9 } },

  // Extra everyday home cook
  { sourceId: 'seed-hm-poached-egg', source: 'openfoodfacts', name: 'Poached egg', servingLabel: '1 large (50 g)', kcal: 72, protein: 6.3, carbs: 0.4, fat: 4.8,
    minerals: { sodium: 140, potassium: 69, calcium: 28, magnesium: 6, phosphorus: 99, iron: 0.9, selenium: 15, iodine: 24 } },
  { sourceId: 'seed-hm-french-toast', source: 'openfoodfacts', name: 'French toast homemade', servingLabel: '2 slices', kcal: 280, protein: 12, carbs: 30, fat: 12,
    minerals: { sodium: 400, potassium: 180, calcium: 120, magnesium: 25, phosphorus: 200, iron: 2, selenium: 20 } },
  { sourceId: 'seed-hm-grilled-cheese', source: 'openfoodfacts', name: 'Grilled cheese sandwich', servingLabel: '1 sandwich', kcal: 380, protein: 16, carbs: 30, fat: 22,
    minerals: { sodium: 700, potassium: 150, calcium: 350, magnesium: 30, phosphorus: 300, iron: 2, selenium: 15 } },
  { sourceId: 'seed-hm-stirfried-egg-tomato', source: 'openfoodfacts', name: 'Stir-fried egg and tomato', servingLabel: '1 serve (200 g)', kcal: 200, protein: 12, carbs: 8, fat: 13,
    minerals: { sodium: 350, potassium: 350, calcium: 50, magnesium: 20, phosphorus: 180, iron: 1.8, selenium: 25 } },
  { sourceId: 'seed-hm-steamed-chicken', source: 'openfoodfacts', name: 'Steamed chicken', servingLabel: '150 g cooked', kcal: 200, protein: 35, carbs: 0, fat: 6,
    minerals: { sodium: 80, potassium: 350, calcium: 15, magnesium: 30, phosphorus: 260, iron: 1, zinc: 1.5, selenium: 30 } },
  { sourceId: 'seed-hm-roast-veg', source: 'openfoodfacts', name: 'Roast vegetables', servingLabel: '1 serve (200 g)', kcal: 150, protein: 3, carbs: 20, fat: 7,
    minerals: { sodium: 200, potassium: 500, calcium: 50, magnesium: 30, phosphorus: 70, iron: 1.2 } },
  { sourceId: 'seed-hm-baked-salmon', source: 'openfoodfacts', name: 'Baked salmon homemade', servingLabel: '120 g', kcal: 250, protein: 25, carbs: 0, fat: 16,
    minerals: { sodium: 70, potassium: 400, calcium: 12, magnesium: 35, phosphorus: 280, iron: 0.5, selenium: 40, iodine: 18 } },
  { sourceId: 'seed-hm-fried-tofu', source: 'openfoodfacts', name: 'Fried tofu', servingLabel: '100 g', kcal: 190, protein: 12, carbs: 5, fat: 14,
    minerals: { sodium: 200, potassium: 150, calcium: 200, magnesium: 50, phosphorus: 150, iron: 2.5, manganese: 0.7 } },
  { sourceId: 'seed-hm-miso-soup', source: 'openfoodfacts', name: 'Miso soup homemade', servingLabel: '1 bowl (250 ml)', kcal: 60, protein: 4, carbs: 6, fat: 2,
    minerals: { sodium: 800, potassium: 200, calcium: 40, magnesium: 20, phosphorus: 50, iron: 0.8 } },
  { sourceId: 'seed-hm-congee-chicken', source: 'openfoodfacts', name: 'Chicken congee', servingLabel: '1 bowl (350 g)', kcal: 220, protein: 14, carbs: 30, fat: 4,
    minerals: { sodium: 550, potassium: 200, calcium: 20, magnesium: 20, phosphorus: 120, iron: 0.8, zinc: 1 } },
  { sourceId: 'seed-hm-steamed-veg-mix', source: 'openfoodfacts', name: 'Steamed mixed vegetables', servingLabel: '1 cup (150 g)', kcal: 45, protein: 2.5, carbs: 8, fat: 0.4,
    minerals: { sodium: 40, potassium: 350, calcium: 40, magnesium: 25, phosphorus: 55, iron: 0.8 } },
  { sourceId: 'seed-hm-fried-noodles', source: 'openfoodfacts', name: 'Fried noodles homemade', servingLabel: '1 serve (250 g)', kcal: 380, protein: 12, carbs: 50, fat: 14,
    minerals: { sodium: 800, potassium: 200, calcium: 40, magnesium: 30, phosphorus: 150, iron: 2 } }
]

/**
 * Builds a homemade foods pack: curated seed first, then optional Open Food Facts enrichment.
 * Dedupes by name+brand. Seed ensures useful dishes even when OFF is unreachable.
 */
export async function fetchHomemadeFoodsPack(
  targetCount = 120
): Promise<OnlineFoodCandidate[]> {
  const out: OnlineFoodCandidate[] = []
  const seen = new Set<string>()
  let index = 0
  let failures = 0

  for (const seed of HOMEMADE_SEED) {
    const key = foodKey(seed.name, seed.brand)
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ ...seed })
  }

  const batchSize = 4
  for (let i = 0; i < HOMEMADE_QUERIES.length && out.length < targetCount; i += batchSize) {
    const batch = HOMEMADE_QUERIES.slice(i, i + batchSize)
    const results = await Promise.all(
      batch.map(async (term) => {
        try {
          return await offSearch(term, 10)
        } catch {
          failures++
          return [] as OffProduct[]
        }
      })
    )
    for (const products of results) {
      for (const p of products) {
        if (out.length >= targetCount) break
        const food = parseProduct(p, index++)
        if (!food) continue
        const key = foodKey(food.name, food.brand)
        if (seen.has(key)) continue
        seen.add(key)
        out.push(food)
      }
    }
  }

  if (out.length === 0 && failures > 0) {
    throw new Error(
      'Open Food Facts is unreachable right now. Try again in a few minutes.'
    )
  }

  return out
}

export function getHomemadeSeedInputs(): Omit<Food, 'id'>[] {
  return HOMEMADE_SEED.map(toFoodInput)
}
