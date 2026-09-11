import type { Food, OnlineFoodCandidate } from '../shared/types'

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

  return {
    sourceId,
    source: 'openfoodfacts',
    name,
    brand,
    servingLabel,
    kcal: round1(kcal),
    protein: round1(protein),
    carbs: round1(carbs),
    fat: round1(fat)
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
 * Fetches ~200–500 everyday foods from Open Food Facts via many small searches.
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

export function toFoodInput(c: OnlineFoodCandidate): Omit<Food, 'id'> {
  return {
    name: c.name,
    brand: c.brand,
    servingLabel: c.servingLabel,
    kcal: c.kcal,
    protein: c.protein,
    carbs: c.carbs,
    fat: c.fat
  }
}
