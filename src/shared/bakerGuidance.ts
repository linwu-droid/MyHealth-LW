/**
 * Baker Institute-style public nutrition principles for MyHealth tips.
 * Summarised from publicly available Baker Heart and Diabetes Institute
 * fact-sheet themes (portion plate, heart-healthy eating, fibre, convenience
 * meals, supermarket shopping, salt/blood pressure). Not a copy of any
 * fact sheet and not medical advice.
 */

import { collectAvoidAliases, textMatchesAlias } from './health'
import type { HealthProfile, NutritionAnalysis } from './types'

export const BAKER_DISCLAIMER =
  'Not medical advice. Adapted from Baker Institute-style public fact sheet principles (heart, fibre, portions, shopping). Confirm with a clinician or dietitian for personal advice.'

export type BakerTipTopic =
  | 'plate'
  | 'veg'
  | 'fibre'
  | 'sodium'
  | 'omega3'
  | 'water'
  | 'heart'
  | 'shopping'

export type BakerTip = {
  id: string
  topic: BakerTipTopic
  message: string
}

export type BakerPlateMix = {
  vegetables: number
  carbohydrates: number
  protein: number
  source?: 'period-macros' | 'healthy-default' | 'plan' | string
}

export type BakerGuidanceInput = {
  analysis?: NutritionAnalysis | null
  plate?: BakerPlateMix | null
  water?: { actualMl: number; goalMl: number } | null
  /** Extra names (pantry / plan / diary) used as fibre/veg/fish proxies. */
  foodNames?: string[]
  profile?: HealthProfile | null
  avoidAliases?: string[]
  /** Include always-on compact principles (Health page). */
  includePrinciples?: boolean
  /** Cap on gap-based tips (principles not counted). */
  maxGapTips?: number
}

const VEG_RE =
  /veg|spinach|broccoli|lettuce|cucumber|tomato|capsicum|carrot|celery|mushroom|peas|corn|salad|bok|cabbage|zucchini|bean sprout|mixed vegetable|passata|onion|garlic|avocado|kale|asparagus|cauliflower|pumpkin|squash|greens|rocket|arugula|beet|eggplant|aubergine|salad pack/i

const FIBRE_RE =
  /oat|bran|barley|lentil|chickpea|bean|psyllium|wholegrain|whole wheat|wholemeal|whole-grain|legume|pear|apple|fibre|fiber|quinoa|freekeh|bulgur|skin|pearled|four-bean|four bean/i

const FISH_RE =
  /salmon|tuna|sardine|mackerel|trout|herring|pilchard|barramundi|anchovy|fish|omega/i

const STOP = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'of',
  'to',
  'for',
  'with',
  'your',
  'you',
  'is',
  'at',
  'on',
  'in',
  'try',
  'buy',
  'add',
  'aim',
  'from',
  'that',
  'this',
  'are',
  'vs',
  'per',
  'day'
])

function avoidList(input: BakerGuidanceInput): string[] {
  if (input.avoidAliases && input.avoidAliases.length) return input.avoidAliases
  if (input.profile) return collectAvoidAliases(input.profile).map((r) => r.alias)
  return []
}

export function filterTipFoods(foods: string[], avoidAliases: string[]): string[] {
  if (!avoidAliases.length) return foods.filter(Boolean)
  return foods.filter((f) => !avoidAliases.some((a) => textMatchesAlias(f, a)))
}

function joinFoods(foods: string[]): string {
  if (foods.length === 0) return ''
  if (foods.length === 1) return foods[0]
  if (foods.length === 2) return `${foods[0]} or ${foods[1]}`
  return `${foods.slice(0, -1).join(', ')}, or ${foods.slice(-1)[0]}`
}

function namesFrom(input: BakerGuidanceInput): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const push = (n: string): void => {
    const t = n.trim()
    if (!t) return
    const k = t.toLowerCase()
    if (seen.has(k)) return
    seen.add(k)
    out.push(t)
  }
  for (const n of input.foodNames ?? []) push(n)
  for (const f of input.analysis?.topFoods ?? []) push(f.name)
  return out
}

function countMatching(names: string[], re: RegExp): number {
  return names.reduce((n, name) => n + (re.test(name) ? 1 : 0), 0)
}

function foodClause(lead: string, foods: string[], avoidAliases: string[], trailing = ''): string | null {
  const ok = filterTipFoods(foods, avoidAliases)
  if (ok.length === 0) return null
  return `${lead} Try ${joinFoods(ok)}.${trailing}`
}

/** Compact always-on Heart & plate principles (Health / empty analysis). */
export function bakerHeartPlatePrinciples(): BakerTip[] {
  return [
    {
      id: 'principle-plate',
      topic: 'plate',
      message:
        'Healthy plate: 1/2 vegetables or salad, 1/4 lean protein (palm-sized), 1/4 lower-GI carbohydrate (fist-sized). Add a small amount of healthy fat. Use a plate smaller than 25 cm.'
    },
    {
      id: 'principle-heart',
      topic: 'heart',
      message:
        'Heart-healthy fats: prefer mono- and polyunsaturated (extra virgin olive oil, nuts, seeds). Oily fish 3 serves a week (150-200 g). Choose lean or plant protein. Soluble fibre and plant sterols can support cholesterol.'
    },
    {
      id: 'principle-fibre',
      topic: 'fibre',
      message:
        'Fibre: women at least 25 g/day, men at least 30 g/day. Combine soluble (oats, barley, legumes, psyllium, fruit and veg flesh) with insoluble (wholegrains, bran, skins). Increase gradually and drink water.'
    },
    {
      id: 'principle-convenience',
      topic: 'veg',
      message:
        'Convenience meals: fill half the plate with vegetables (salad packs or frozen mixed veg) and a quarter with lean protein (canned or frozen fish, tofu, eggs, legumes).'
    },
    {
      id: 'principle-shop',
      topic: 'shopping',
      message:
        'Shop: fresh or frozen vegetables and fruit; wholegrain breads and cereals; reduced-fat higher-calcium dairy; legumes; oily fish; extra virgin olive oil, nuts and seeds. Choose water first. Limit salty processed foods. Label guide: saturated fat under 2 g/100 g, fibre over 5 g/100 g, sodium under 400 mg/100 g.'
    }
  ]
}

export type BakerAnalysisGaps = {
  lowVeg: boolean
  lowFibre: boolean
  highSodium: boolean
  lowFish: boolean
  lowWater: boolean
  plateImbalance: boolean
}

/** Plate mix from diary macros + veg-classified top foods (kcal). */
export function inferPlateMix(a: NutritionAnalysis): BakerPlateMix {
  const proteinK = Math.max(0, (a.vsGoals.protein.actual || 0) * 4)
  const carbK = Math.max(0, (a.vsGoals.carbs.actual || 0) * 4)
  let vegPeriod = 0
  for (const f of a.topFoods) {
    if (VEG_RE.test(f.name)) vegPeriod += Math.max(0, f.kcal)
  }
  const vegK = vegPeriod / Math.max(1, a.days || 1)
  const sum = vegK + carbK + proteinK
  if (!(sum > 0.5)) {
    return { vegetables: 50, carbohydrates: 25, protein: 25, source: 'healthy-default' }
  }
  return {
    vegetables: (vegK / sum) * 100,
    carbohydrates: (carbK / sum) * 100,
    protein: (proteinK / sum) * 100,
    source: 'period-macros'
  }
}

export function detectBakerGaps(input: BakerGuidanceInput): BakerAnalysisGaps {
  const a = input.analysis
  const names = namesFrom(input)
  const vegHits = countMatching(names, VEG_RE)
  const fibreHits = countMatching(names, FIBRE_RE)
  const fishHits = countMatching(names, FISH_RE)
  const hasDiary = !!a && a.entryCount > 0
  const hasNames = names.length > 0

  const plate = input.plate ?? (a && a.entryCount > 0 ? inferPlateMix(a) : undefined)
  const vegShare = plate?.vegetables
  const carbShare = plate?.carbohydrates
  const protShare = plate?.protein
  const plateKnown = vegShare != null && Number.isFinite(vegShare)
  const lowVeg = plateKnown
    ? vegShare < 35
    : (hasDiary || hasNames) && vegHits === 0

  const plateImbalance = plateKnown
    ? vegShare < 35 || vegShare > 72 || (carbShare != null && carbShare > 50 && (protShare ?? 0) < 15)
    : lowVeg

  const sodium = a?.vsMineralGoals.sodium
  const highSodium = !!sodium && sodium.pctOfGoal > 110

  const water = input.water
  const lowWater = !!water && water.goalMl > 0 && (water.actualMl / water.goalMl) * 100 < 80

  const lowFibre = (hasDiary || hasNames) && fibreHits <= 1
  const lowFish = (hasDiary || hasNames) && fishHits === 0

  return { lowVeg, lowFibre, highSodium, lowFish, lowWater, plateImbalance }
}

function gapTips(input: BakerGuidanceInput, gaps: BakerAnalysisGaps): BakerTip[] {
  const avoid = avoidList(input)
  const tips: BakerTip[] = []
  const a = input.analysis

  if (gaps.plateImbalance || gaps.lowVeg) {
    const msg = foodClause(
      'Plate looks light on vegetables versus a 1/2 veg, 1/4 protein, 1/4 lower-GI carb mix (palm / fist serves; plate under 25 cm).',
      [
        'leafy salad or salad packs',
        'frozen mixed vegetables',
        'broccoli',
        'capsicum',
        'zucchini'
      ],
      avoid,
      ' Fill half the plate at lunch and dinner.'
    )
    tips.push({
      id: 'gap-plate',
      topic: 'plate',
      message:
        msg ??
        'Aim for half the plate as vegetables or salad, a palm of lean protein, a fist of lower-GI carbohydrate, and a small amount of healthy fat. Use a plate smaller than 25 cm. Choose veg that fit your Health avoid list.'
    })
  }

  if (gaps.lowVeg && !gaps.plateImbalance) {
    const msg = foodClause(
      'Vegetable intake looks low.',
      ['salad packs', 'frozen mixed vegetables', 'leafy greens', 'tomato', 'carrot'],
      avoid,
      ' Convenience meals: half plate veg, quarter lean protein.'
    )
    if (msg) {
      tips.push({ id: 'gap-veg', topic: 'veg', message: msg })
    }
  }

  if (gaps.lowFibre) {
    const msg = foodClause(
      'Fibre-rich foods look scarce (women at least 25 g/day, men at least 30 g/day). Mix soluble and insoluble fibre; increase gradually and drink water.',
      ['oats or oat bran', 'barley', 'psyllium husk', 'four-bean mix or lentils', 'fruit with skins', 'wholegrain bread'],
      avoid,
      ''
    )
    if (msg) {
      tips.push({ id: 'gap-fibre', topic: 'fibre', message: msg })
    } else {
      tips.push({
        id: 'gap-fibre',
        topic: 'fibre',
        message:
          'Fibre: women at least 25 g/day, men at least 30 g/day. Increase gradually with water, using options that fit your Health avoid list (soluble: oats, legumes, fruit flesh; insoluble: wholegrains, bran, skins).'
      })
    }
  }

  if (gaps.highSodium) {
    const pct = a?.vsMineralGoals.sodium ? Math.round(a.vsMineralGoals.sodium.pctOfGoal) : 0
    tips.push({
      id: 'gap-sodium',
      topic: 'sodium',
      message:
        `Sodium is high${pct ? ` (${pct}% of goal)` : ''}. For blood pressure, limit salty processed foods and choose labels with sodium under 400 mg/100 g; flavour with herbs. Saturated fat under 2 g/100 g is a useful heart-label check.`
    })
  }

  if (gaps.lowFish) {
    const oily = filterTipFoods(
      ['salmon', 'sardines', 'mackerel', 'tuna'],
      avoid
    )
    const plant = filterTipFoods(['walnuts', 'chia seeds', 'linseed / flaxseed'], avoid)
    if (oily.length > 0) {
      tips.push({
        id: 'gap-omega3',
        topic: 'omega3',
        message: `Oily fish looks limited. Aim for 3 serves a week (150-200 g each) - try ${joinFoods(oily)}. Prefer extra virgin olive oil, nuts, and seeds for unsaturated fats.`
      })
    } else if (plant.length > 0) {
      tips.push({
        id: 'gap-omega3',
        topic: 'omega3',
        message: `Oily fish is off the list for your profile. For unsaturated fats, try ${joinFoods(plant)} and extra virgin olive oil if those suit you.`
      })
    }
  }

  if (gaps.lowWater) {
    const w = input.water
    const pct = w && w.goalMl > 0 ? Math.round((w.actualMl / w.goalMl) * 100) : 0
    tips.push({
      id: 'gap-water',
      topic: 'water',
      message: `Water is behind goal${pct ? ` (${pct}%)` : ''}. Choose water first (not sugary drinks), and sip more when you increase fibre.`
    })
  }

  const max = input.maxGapTips
  if (max != null && max >= 0 && tips.length > max) return tips.slice(0, max)
  return tips
}

/**
 * Structured Baker-style tips. Gap generators fire from analysis / plate / pantry
 * names; optional compact principles for Health and empty states.
 */
export function buildBakerTips(input: BakerGuidanceInput = {}): BakerTip[] {
  const out: BakerTip[] = []
  const seen = new Set<string>()
  const pushAll = (list: BakerTip[]): void => {
    for (const t of list) {
      if (seen.has(t.id)) continue
      seen.add(t.id)
      out.push(t)
    }
  }
  if (input.includePrinciples) pushAll(bakerHeartPlatePrinciples())
  const hasSignal =
    !!input.analysis ||
    !!input.plate ||
    (input.foodNames && input.foodNames.length > 0) ||
    !!input.water
  if (hasSignal) {
    pushAll(gapTips(input, detectBakerGaps(input)))
  }
  return out
}

export function bakerTipMessages(tips: BakerTip[]): string[] {
  return tips.map((t) => t.message)
}

function contentWords(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9%]+/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w))
  )
}

/** Append incoming recs, skipping near-duplicates of existing strings. */
export function mergeRecommendationStrings(existing: string[], incoming: string[]): string[] {
  const out = [...existing]
  for (const tip of incoming) {
    const t = tip.trim()
    if (!t) continue
    const tw = contentWords(t)
    const dup = out.some((e) => {
      const ew = contentWords(e)
      if (ew.size === 0 || tw.size === 0) return false
      let inter = 0
      for (const w of tw) if (ew.has(w)) inter++
      const denom = Math.min(tw.size, ew.size)
      return denom > 0 && inter / denom >= 0.62
    })
    if (!dup) out.push(t)
  }
  return out
}

/**
 * Pantry / Plan My Meals: Baker shopping + plate nudges from group gaps.
 * `groups` is typically 'vegetables' | 'protein' | 'carbohydrates'.
 */
export function buildBakerShoppingTips(opts: {
  missingGroups: string[]
  foodNames?: string[]
  profile?: HealthProfile | null
  avoidAliases?: string[]
}): BakerTip[] {
  const avoid = opts.avoidAliases?.length
    ? opts.avoidAliases
    : opts.profile
      ? collectAvoidAliases(opts.profile).map((r) => r.alias)
      : []
  const missing = new Set(opts.missingGroups.map((g) => g.toLowerCase()))
  const tips: BakerTip[] = []

  if (missing.has('vegetables')) {
    const msg = foodClause(
      'Plate balance: vegetables are short of the half-plate target.',
      ['salad packs', 'frozen mixed vegetables', 'leafy greens', 'broccoli'],
      avoid,
      ' Keep the plate under 25 cm.'
    )
    tips.push({
      id: 'shop-veg',
      topic: 'veg',
      message:
        msg ??
        'Fill half the plate with vegetables or salad (fresh, frozen, or salad packs) using options that fit your Health avoid list.'
    })
  }
  if (missing.has('protein')) {
    const msg = foodClause(
      'Plate balance: protein is under a quarter-plate (palm-sized serve).',
      ['canned tuna or salmon', 'eggs', 'tofu', 'four-bean mix', 'lean chicken'],
      avoid,
      ' Oily fish 3 times a week (150-200 g) if it suits you.'
    )
    if (msg) tips.push({ id: 'shop-protein', topic: 'omega3', message: msg })
  }
  if (missing.has('carbohydrates')) {
    const msg = foodClause(
      'Plate balance: lower-GI carbohydrate is light (fist-sized serve).',
      ['oats', 'barley', 'wholegrain bread', 'brown rice', 'potato'],
      avoid,
      ' Prefer wholegrain cereals; fibre over 5 g/100 g on the label.'
    )
    if (msg) tips.push({ id: 'shop-carb', topic: 'fibre', message: msg })
  }

  tips.push({
    id: 'shop-labels',
    topic: 'shopping',
    message:
      'Basket check: fresh or frozen veg and fruit first; legumes; extra virgin olive oil, nuts and seeds; water first. Limit salty processed foods. Labels: saturated fat under 2 g/100 g, fibre over 5 g/100 g, sodium under 400 mg/100 g.'
  })

  return tips
}