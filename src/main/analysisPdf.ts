import { BrowserWindow, dialog } from 'electron'
import { writeFileSync } from 'fs'
import {
  getHealthProfile,
  getNutritionAnalysis,
  getSettings,
  getWaterGoalMl,
  listDiary,
  listFoods,
  listExercise,
  listWater
} from './store'
import {
  MINERAL_KEYS,
  MINERAL_META,
  hasAnyMineral,
  mineralDisplayLabel,
  roundMineral,
  scaleMinerals,
  type MineralKey
} from '../shared/minerals'
import { collectAvoidAliases, textMatchesAlias } from '../shared/health'
import { formatMlExact } from '../shared/water'
import type {
  DiaryEntry,
  Food,
  HealthProfile,
  MealBreakdown,
  NutritionAnalysis
} from '../shared/types'

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function fmt(n: number, unit = ''): string {
  const v =
    Math.abs(n) < 10 && unit !== 'kcal'
      ? Math.round(n * 10) / 10
      : Math.round(n)
  return unit ? `${v} ${unit}` : String(v)
}

function vsLine(label: string, actual: number, goal: number, unit: string, pct: number): string {
  return `<tr><td>${esc(label)}</td><td>${fmt(actual, unit)}</td><td>${fmt(goal, unit)}</td><td>${Math.round(pct)}%</td></tr>`
}

/** Mirror PlateVisual classify heuristics (main process cannot import renderer). */
const VEG_RE =
  /veg|spinach|broccoli|lettuce|cucumber|tomato|capsicum|carrot|celery|mushroom|peas|corn|salad|bok|cabbage|zucchini|bean sprout|mixed vegetable|passata|onion|garlic|avocado|kale|asparagus|cauliflower|pumpkin|squash|greens|rocket|arugula|beet|eggplant|aubergine/i
const PROTEIN_RE =
  /chicken|beef|pork|lamb|fish|tuna|salmon|egg|tofu|tempeh|prawn|shrimp|ham|turkey|sardine|yoghurt|yogurt|cheese|protein|lentil|chickpea|bean|mince|whey|casein|steak|cottage/i
const CARB_RE =
  /rice|pasta|bread|oat|potato|noodle|couscous|quinoa|cereal|muesli|wrap|tortilla|cracker|flour|weet|cornflake|bagel|toast|granola|barley|bulgur|freekeh|porridge/i

type PlateGroup = 'vegetables' | 'carbohydrates' | 'protein'

function classifyFoodGroup(name: string): PlateGroup | null {
  if (VEG_RE.test(name)) return 'vegetables'
  if (PROTEIN_RE.test(name)) return 'protein'
  if (CARB_RE.test(name)) return 'carbohydrates'
  return null
}

type PlateShares = {
  vegetables: number
  carbohydrates: number
  protein: number
  source: 'period-macros' | 'healthy-default'
  vegFrom: 'foods' | 'remainder' | 'none'
  /** Display-capped % of recommended Healthy Eating 50/25/25 portion. */
  portionOfRec: { vegetables: number; carbohydrates: number; protein: number }
}

/** Healthy Eating 2-1-1 — no stored plateMode in settings. */
const HEALTHY_PLATE_SHARES = {
  vegetables: 0.5,
  carbohydrates: 0.25,
  protein: 0.25
} as const

function portionPct(actualEnergy: number, totalKcal: number, targetShare: number): number {
  const denom = totalKcal * targetShare
  if (!(denom > 0) || !(actualEnergy >= 0)) return 0
  return Math.round(Math.min(999, Math.max(0, (actualEnergy / denom) * 100)))
}

function classifiedVegKcalPerDay(a: NutritionAnalysis): number {
  let period = 0
  for (const f of a.topFoods) {
    if (classifyFoodGroup(f.name) === 'vegetables') period += Math.max(0, f.kcal)
  }
  const days = Math.max(1, a.days || 1)
  return period / days
}

function normalizePlateEnergies(
  vegK: number,
  carbK: number,
  protK: number
): { vegetables: number; carbohydrates: number; protein: number } {
  const v = Math.max(0, vegK)
  const c = Math.max(0, carbK)
  const p = Math.max(0, protK)
  const sum = v + c + p
  if (!(sum > 0)) return { vegetables: 50, carbohydrates: 25, protein: 25 }
  return {
    vegetables: (v / sum) * 100,
    carbohydrates: (c / sum) * 100,
    protein: (p / sum) * 100
  }
}

/**
 * Plate slices from period consumption (never fat as a 3rd slice).
 * Protein/carb = macro grams x 4; veg = classified topFoods kcal or non-macro remainder.
 * No fake vegetable floor.
 */
function derivePlateShares(a: NutritionAnalysis): PlateShares {
  const totalKcal = Math.max(
    0,
    a.vsGoals.kcal.actual || a.averagePerDay.kcal || a.totals.kcal || 0
  )
  const proteinK = Math.max(0, (a.vsGoals.protein.actual || 0) * 4)
  const carbK = Math.max(0, (a.vsGoals.carbs.actual || 0) * 4)
  const fatK = Math.max(0, (a.vsGoals.fat.actual || 0) * 9)

  const vegFoods = classifiedVegKcalPerDay(a)
  const remainder = Math.max(0, totalKcal - proteinK - carbK - fatK)
  const vegWeak = !(vegFoods > 1)
  const vegK = vegWeak ? remainder : vegFoods
  const vegFrom: PlateShares['vegFrom'] = vegWeak ? 'remainder' : 'foods'

  const consumedSum = vegK + carbK + proteinK
  const portionOfRec = {
    vegetables: portionPct(vegK, totalKcal, HEALTHY_PLATE_SHARES.vegetables),
    carbohydrates: portionPct(carbK, totalKcal, HEALTHY_PLATE_SHARES.carbohydrates),
    protein: portionPct(proteinK, totalKcal, HEALTHY_PLATE_SHARES.protein)
  }

  if (!(consumedSum > 0.5)) {
    return {
      vegetables: 50,
      carbohydrates: 25,
      protein: 25,
      source: 'healthy-default',
      vegFrom: 'none',
      portionOfRec: totalKcal > 0.5 ? portionOfRec : { vegetables: 0, carbohydrates: 0, protein: 0 }
    }
  }

  return {
    ...normalizePlateEnergies(vegK, carbK, proteinK),
    source: 'period-macros',
    vegFrom,
    portionOfRec
  }
}

function polar(cx: number, cy: number, r: number, angleDeg: number): [number, number] {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)]
}

/**
 * SVG pie slice from startPct→endPct (0–100 cumulative).
 * Handles zero-span (empty string) and full-circle (two semicircles — SVG cannot arc to same point).
 */
function pieSlicePath(cx: number, cy: number, r: number, startPct: number, endPct: number): string {
  const span = endPct - startPct
  if (!(span > 0.05)) return ''
  const startAngle = startPct * 3.6
  if (span >= 99.95) {
    const [x1, y1] = polar(cx, cy, r, startAngle)
    const [xMid, yMid] = polar(cx, cy, r, startAngle + 180)
    return `M${cx} ${cy} L${x1} ${y1} A${r} ${r} 0 1 1 ${xMid} ${yMid} A${r} ${r} 0 1 1 ${x1} ${y1} Z`
  }
  const endAngle = endPct * 3.6
  const [x1, y1] = polar(cx, cy, r, startAngle)
  const [x2, y2] = polar(cx, cy, r, endAngle)
  const large = endAngle - startAngle > 180 ? 1 : 0
  return `M${cx} ${cy} L${x1} ${y1} A${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`
}

type PieSlice = { label: string; pct: number; color: string; textColor?: string }

function buildPieSvg(
  title: string,
  slices: PieSlice[],
  footnote: string | string[],
  ariaLabel: string
): string {
  const positive = slices.map((s) => ({ ...s, pct: Math.max(0, s.pct) }))
  const sum = positive.reduce((a, s) => a + s.pct, 0)
  // Normalize to 100 before drawing so slices match legend %.
  const norm =
    sum > 0
      ? positive.map((s) => ({ ...s, pct: (s.pct / sum) * 100 }))
      : positive.map((s) => ({ ...s, pct: 0 }))

  const cx = 110
  const cy = 105
  const r = 88
  let cursor = 0
  const paths: string[] = []
  for (const s of norm) {
    const start = cursor
    const end = cursor + s.pct
    cursor = end
    if (!(s.pct > 0.05)) continue
    const d = pieSlicePath(cx, cy, r, start, end)
    if (!d) continue
    paths.push(`<path d="${d}" fill="${s.color}"/>`)
  }
  if (sum <= 0) {
    paths.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="#e8efe4"/>`)
  }

  const legend = norm
    .map((s, i) => {
      const y = 36 + i * 28
      return `<rect x="210" y="${y}" width="14" height="14" fill="${s.color}" rx="2"/>
      <text x="230" y="${y + 12}" fill="${s.textColor ?? '#2c3228'}">${esc(s.label)} ${Math.round(s.pct)}%</text>`
    })
    .join('\n')

  const titleBlock = title
    ? `<div class="chart-title">${esc(title)}</div>`
    : ''

  const notes = (Array.isArray(footnote) ? footnote : [footnote])
    .map((n) => n.trim())
    .filter((n) => n.length > 0)
  const noteHtml = notes
    .map((n) => `<p class="note chart-footnote">${esc(n)}</p>`)
    .join('\n  ')

  return `<div class="chart-block">
  ${titleBlock}
  <svg viewBox="0 0 320 210" width="320" height="210" role="img" aria-label="${esc(ariaLabel)}">
    <rect width="320" height="210" fill="#faf8f3"/>
    ${paths.join('\n    ')}
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#c9d4c4" stroke-width="3"/>
    <g font-family="Segoe UI, sans-serif" font-size="11">
      ${legend}
    </g>
  </svg>
  ${noteHtml}
</div>`
}

function buildPlatePieSvg(shares: PlateShares): string {
  const veg = Math.max(0, shares.vegetables)
  const carb = Math.max(0, shares.carbohydrates)
  const prot = Math.max(0, shares.protein)
  const footnotes =
    shares.source === 'healthy-default'
      ? ['Healthy plate default 50 / 25 / 25']
      : [
          'Plate shares from period macros (veg from foods or non-macro remainder)',
          `Of recommended Healthy Eating 50/25/25: veg ~${shares.portionOfRec.vegetables}% · carb ~${shares.portionOfRec.carbohydrates}% · protein ~${shares.portionOfRec.protein}%`
        ]

  return buildPieSvg(
    '',
    [
      { label: 'Vegetables', pct: veg, color: '#8fbc8f', textColor: '#2f4f2f' },
      { label: 'Carbohydrate', pct: carb, color: '#e8c47a', textColor: '#5a4020' },
      { label: 'Protein', pct: prot, color: '#c47a6a', textColor: '#5a2a22' }
    ],
    footnotes,
    'Plate proportion pie'
  )
}

function buildMealPieSvg(meals: MealBreakdown): string {
  const rows: PieSlice[] = [
    { label: 'Breakfast', pct: Math.max(0, meals.breakfast.kcal), color: '#e8c47a', textColor: '#5a4020' },
    { label: 'Lunch', pct: Math.max(0, meals.lunch.kcal), color: '#8fbc8f', textColor: '#2f4f2f' },
    { label: 'Dinner', pct: Math.max(0, meals.dinner.kcal), color: '#c47a6a', textColor: '#5a2a22' },
    { label: 'Snacks', pct: Math.max(0, meals.snacks.kcal), color: '#7a9eb8', textColor: '#2a3a4a' }
  ]
  const total = rows.reduce((a, r) => a + r.pct, 0)
  const pctRows =
    total > 0
      ? rows.map((r) => ({ ...r, pct: (r.pct / total) * 100 }))
      : rows.map((r) => ({ ...r, pct: 0 }))
  return buildPieSvg(
    'Calories by meal',
    pctRows,
    total > 0 ? `% of ${Math.round(total)} kcal across meals` : 'No meal calories in this range',
    'Meal calorie pie'
  )
}

type BarItem = { label: string; pct: number; actual: string; goal: string }

/** Clip id counter so multiple charts on one page stay unique. */
let hBarClipSeq = 0

const OVERFLOW_DEEP: Record<string, string> = {
  '#6f9f7a': '#4d7a58',
  '#8fbc8f': '#5f8f6a',
  '#c9a46a': '#a67d3a',
  '#c47a6a': '#a35548'
}

/**
 * Horizontal bars — same per-row logic as Water:
 * - pct <= 100: track = 100% goal width; colored fill = actual %; light remainder = rest.
 *   No 100% goal label/line on under-goal rows.
 * - pct > 100: continuous bar via clipPath — 0–100% base fill, overflow segment deeper
 *   same-hue; no separate stub gap. No chart-wide 100% indicator.
 */
function buildHBarChartSvg(title: string, items: BarItem[], heightPer = 28): string {
  if (items.length === 0) return ''
  const left = 132
  const top = 28
  const trackW = 240
  const overflowPad = 48
  const rightPad = 56
  const width = left + trackW + overflowPad + rightPad
  const height = top + items.length * heightPer + 16
  const trackFill = '#eef3ea'

  const rows = items
    .map((it, idx) => {
      const y = top + idx * heightPer
      const pct = Math.max(0, it.pct)
      const fill =
        pct >= 90 && pct <= 110 ? '#6f9f7a' : pct < 70 ? '#c9a46a' : pct > 110 ? '#c47a6a' : '#8fbc8f'
      const deep = OVERFLOW_DEEP[fill] ?? fill
      const within = Math.min(pct, 100)
      const fillW = (within / 100) * trackW
      const over = Math.max(0, pct - 100)
      const overW = over > 0 ? Math.min(overflowPad, (over / 100) * trackW) : 0
      const by = y + 2
      const barH = 16
      const label = `<text x="8" y="${y + 14}" fill="#3d5a45" font-size="10" font-family="Segoe UI, sans-serif">${esc(it.label)}</text>`
      const pctText = `<text x="${left + trackW + overflowPad + 8}" y="${y + 14}" fill="#2c3228" font-size="10" font-family="Segoe UI, sans-serif">${Math.round(pct)}%</text>`
      const track = `<rect x="${left}" y="${by}" width="${trackW}" height="${barH}" rx="4" fill="${trackFill}"/>`

      if (overW > 0) {
        const clipId = `hbar-clip-${hBarClipSeq++}`
        const totalW = trackW + overW
        return `${label}
    ${track}
    <defs><clipPath id="${clipId}"><rect x="${left}" y="${by}" width="${totalW}" height="${barH}" rx="4"/></clipPath></defs>
    <g clip-path="url(#${clipId})">
      <rect x="${left}" y="${by}" width="${trackW}" height="${barH}" fill="${fill}"/>
      <rect x="${left + trackW}" y="${by}" width="${overW}" height="${barH}" fill="${deep}"/>
    </g>
    ${pctText}`
      }

      return `${label}
    ${track}
    <rect x="${left}" y="${by}" width="${pct > 0 ? Math.max(2, fillW) : 0}" height="${barH}" rx="4" fill="${fill}"/>
    ${pctText}`
    })
    .join('\n')

  return `<div class="chart-block">
  <div class="chart-title">${esc(title)}</div>
  <svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${esc(title)}">
    <rect width="${width}" height="${height}" fill="#faf8f3"/>
    ${rows}
  </svg>
</div>`
}


function filterFoods(foods: string[], avoidAliases: string[]): string[] {
  return foods.filter((f) => !avoidAliases.some((a) => textMatchesAlias(f, a)))
}

function joinFoods(foods: string[]): string {
  if (foods.length === 0) return ''
  if (foods.length === 1) return foods[0]
  if (foods.length === 2) return `${foods[0]} or ${foods[1]}`
  return `${foods.slice(0, -1).join(', ')}, or ${foods[foods.length - 1]}`
}

/** Concrete buy/intake recommendations from gaps; skips avoided foods from health profile. */
function buildRecommendations(
  a: NutritionAnalysis,
  plate: PlateShares,
  water: { actualMl: number; goalMl: number } | undefined,
  exerciseKcalAvg: number,
  profile: HealthProfile
): string[] {
  const avoidAliases = collectAvoidAliases(profile).map((r) => r.alias)
  const out: string[] = []

  const pushFoodRec = (lead: string, foods: string[], trailing = ''): void => {
    const ok = filterFoods(foods, avoidAliases)
    if (ok.length === 0) {
      out.push(`${lead} Choose options that fit your Health profile avoid list.${trailing}`)
      return
    }
    out.push(`${lead} Try/buy ${joinFoods(ok)}.${trailing}`)
  }

  if (a.entryCount === 0) {
    out.push('Log meals in Diary so we can suggest concrete food and intake recommendations.')
    return out
  }

  if (plate.vegetables < 30 || plate.source === 'healthy-default') {
    if (plate.vegetables < 30) {
      pushFoodRec(
        'Vegetable intake looks low relative to your plate mix.',
        [
          'leafy greens (spinach, kale, rocket)',
          'broccoli',
          'mixed salad vegetables',
          'capsicum',
          'zucchini'
        ],
        ' Aim for a larger veg share at lunch and dinner.'
      )
    }
  }

  if (a.vsGoals.protein.pctOfGoal < 80) {
    pushFoodRec(
      `Protein is at ${Math.round(a.vsGoals.protein.pctOfGoal)}% of goal.`,
      ['lean chicken or turkey', 'eggs', 'Greek yoghurt', 'tofu or tempeh', 'lean beef mince', 'canned tuna'],
      ' Add a protein source to each main meal.'
    )
  }

  if (a.vsGoals.carbs.pctOfGoal < 70) {
    pushFoodRec(
      `Carbohydrate is at ${Math.round(a.vsGoals.carbs.pctOfGoal)}% of goal.`,
      ['oats', 'brown rice', 'wholegrain bread', 'potato', 'quinoa'],
      ''
    )
  }

  const iron = a.vsMineralGoals.iron
  if (iron && iron.pctOfGoal < 70) {
    pushFoodRec(
      `Iron is low (${Math.round(iron.pctOfGoal)}% of goal).`,
      ['lean red meat', 'spinach and leafy greens', 'lentils', 'chickpeas', 'tofu', 'iron-fortified cereal'],
      ' Pair plant iron with vitamin C–rich veg where possible.'
    )
  }

  const calcium = a.vsMineralGoals.calcium
  if (calcium && calcium.pctOfGoal < 70) {
    pushFoodRec(
      `Calcium is low (${Math.round(calcium.pctOfGoal)}% of goal).`,
      ['milk', 'yoghurt', 'cheese', 'calcium-set tofu', 'fortified plant milk', 'canned salmon with bones'],
      ''
    )
  }

  const potassium = a.vsMineralGoals.potassium
  if (potassium && potassium.pctOfGoal < 70) {
    pushFoodRec(
      `Potassium is low (${Math.round(potassium.pctOfGoal)}% of goal).`,
      ['banana', 'potato', 'sweet potato', 'avocado', 'spinach', 'beans'],
      ''
    )
  }

  const magnesium = a.vsMineralGoals.magnesium
  if (magnesium && magnesium.pctOfGoal < 70) {
    pushFoodRec(
      `Magnesium is low (${Math.round(magnesium.pctOfGoal)}% of goal).`,
      ['pumpkin seeds', 'almonds', 'cashews', 'spinach', 'black beans', 'oats'],
      ''
    )
  }

  const zinc = a.vsMineralGoals.zinc
  if (zinc && zinc.pctOfGoal < 70) {
    pushFoodRec(
      `Zinc is low (${Math.round(zinc.pctOfGoal)}% of goal).`,
      ['lean beef', 'pumpkin seeds', 'chickpeas', 'cashews', 'eggs', 'yoghurt'],
      ''
    )
  }

  const iodine = a.vsMineralGoals.iodine
  if (iodine && iodine.pctOfGoal < 70) {
    pushFoodRec(
      `Iodine is low (${Math.round(iodine.pctOfGoal)}% of goal).`,
      ['iodised salt (in cooking)', 'yoghurt', 'eggs', 'canned tuna', 'nori seaweed'],
      ''
    )
  }

  const sodium = a.vsMineralGoals.sodium
  if (sodium && sodium.pctOfGoal > 110) {
    out.push(
      `Sodium is high (${Math.round(sodium.pctOfGoal)}% of goal). Cut back on salty snacks, processed meats, and packaged sauces; flavour with herbs instead.`
    )
  }

  if (water && water.goalMl > 0) {
    const wPct = (water.actualMl / water.goalMl) * 100
    if (wPct < 80) {
      out.push(
        `Water is at ${Math.round(wPct)}% of goal (${formatMlExact(water.actualMl)} / ${formatMlExact(water.goalMl)}). Drink more water across the day — keep a bottle handy and sip between meals.`
      )
    }
  }

  const kcalPct = a.vsGoals.kcal.pctOfGoal
  if (kcalPct > 110) {
    const burnNote =
      exerciseKcalAvg < 150
        ? ` Exercise burn is low (~${Math.round(exerciseKcalAvg)} kcal/day avg) — add a walk, cycle, or workout to increase burn.`
        : ` Keep up activity (~${Math.round(exerciseKcalAvg)} kcal/day avg burned) and trim portions or snacks if weight management is a goal.`
    out.push(
      `Calories are ${Math.round(kcalPct)}% of goal (${fmt(a.vsGoals.kcal.actual, 'kcal')} vs ${fmt(a.vsGoals.kcal.goal, 'kcal')}).${burnNote}`
    )
  } else if (kcalPct < 70 && a.entryCount > 0) {
    out.push(
      `Calories are only ${Math.round(kcalPct)}% of goal. If logging is complete, add a balanced meal or snack; otherwise finish logging diary entries.`
    )
  }

  if (out.length === 0) {
    out.push(
      'Intake looks broadly on track vs your goals for this range. Keep logging consistently and adjust portions as needed.'
    )
  }

  if (avoidAliases.length > 0) {
    out.push(
      'Suggestions skip foods that match your Health profile avoid list where possible — always double-check labels.'
    )
  }

  return out
}


function diaryEntryMinerals(e: DiaryEntry, foodsById: Map<string, Food>) {
  if (hasAnyMineral(e.minerals)) return e.minerals
  if (e.foodId) {
    const food = foodsById.get(e.foodId)
    if (food?.minerals) return scaleMinerals(food.minerals, e.servingQty || 1)
  }
  return undefined
}

/** Foods contributing the most to each mineral that exceeds 100% of goal. */
function buildMineralOverGoalHtml(a: NutritionAnalysis): string {
  const overKeys: MineralKey[] = MINERAL_KEYS.filter((key) => {
    const vs = a.vsMineralGoals[key]
    return !!vs && vs.pctOfGoal > 100
  })
  if (overKeys.length === 0) return ''

  const foodsById = new Map(listFoods().map((f) => [f.id, f] as const))
  const diary = listDiary().filter((e) => e.date >= a.rangeStart && e.date <= a.rangeEnd)

  const blocks: string[] = []
  for (const key of overKeys) {
    const vs = a.vsMineralGoals[key]
    if (!vs) continue
    const meta = MINERAL_META[key]
    const byName = new Map<string, number>()
    for (const e of diary) {
      const m = diaryEntryMinerals(e, foodsById)
      const raw = m?.[key]
      if (raw === undefined || raw === null || !Number.isFinite(raw) || !(raw > 0)) continue
      byName.set(e.name, roundMineral((byName.get(e.name) ?? 0) + raw))
    }
    const contributors = [...byName.entries()]
      .filter(([, amt]) => amt > 0)
      .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
      .slice(0, 10)
    if (contributors.length === 0) continue
    const items = contributors
      .map(
        ([name, amt]) =>
          `<li><span class="food">${esc(name)}</span> – ${fmt(amt, meta.unit)}</li>`
      )
      .join('')
    blocks.push(`<div class="mineral-over-item">
      <div class="mineral-over-head">${esc(mineralDisplayLabel(key))} · ${Math.round(vs.pctOfGoal)}% of goal</div>
      <ul>${items}</ul>
    </div>`)
  }

  if (blocks.length === 0) return ''
  return `<div class="mineral-over">
  <div class="mineral-over-title">Over goal — eat less of</div>
  ${blocks.join('\n')}
</div>`
}

function buildAnalysisHtml(
  a: NutritionAnalysis,
  displayName: string,
  water?: { actualMl: number; goalMl: number; daysLogged: number },
  exerciseKcalAvg = 0,
  profile?: HealthProfile
): string {
  const range =
    a.days === 1
      ? a.date
      : `${a.rangeStart} → ${a.rangeEnd} (${a.days} days, ${a.daysWithEntries} logged)`
  const who = displayName.trim() ? esc(displayName.trim()) : 'MyHealth user'
  const mealRows = a.mealBreakdown
    ? (['breakfast', 'lunch', 'dinner', 'snacks'] as const)
        .map((k) => {
          const m = a.mealBreakdown![k]
          const label = k.charAt(0).toUpperCase() + k.slice(1)
          return `<tr><td>${label}</td><td>${fmt(m.kcal, 'kcal')}</td><td>${fmt(m.protein, 'g')}</td><td>${fmt(m.carbs, 'g')}</td><td>${fmt(m.fat, 'g')}</td></tr>`
        })
        .join('')
    : ''

  const mineralRows = MINERAL_KEYS.map((key) => {
    const vs = a.vsMineralGoals[key]
    if (!vs) return ''
    const meta = MINERAL_META[key]
    return vsLine(mineralDisplayLabel(key), vs.actual, vs.goal, meta.unit, vs.pctOfGoal)
  }).join('')

  const health = profile ?? { restrictions: [] }
  const plateShares = derivePlateShares(a)
  const recommendations = buildRecommendations(a, plateShares, water, exerciseKcalAvg, health)
  const recItems = recommendations.map((t) => `<li>${esc(t)}</li>`).join('')
  const notes = a.notes.map((n) => `<p class="note">${esc(n)}</p>`).join('')
  const topFoods = a.topFoods
    .map(
      (f) =>
        `<tr><td>${esc(f.name)}</td><td>${fmt(f.kcal, 'kcal')}</td><td>${f.pctOfTotal}%</td><td>${f.entries}</td></tr>`
    )
    .join('')

  const platePie = buildPlatePieSvg(plateShares)
  const mealPie = a.mealBreakdown ? buildMealPieSvg(a.mealBreakdown) : ''

  const goalBars = buildHBarChartSvg('Vs goals (% of goal)', [
    {
      label: 'Calories',
      pct: a.vsGoals.kcal.pctOfGoal,
      actual: fmt(a.vsGoals.kcal.actual, 'kcal'),
      goal: fmt(a.vsGoals.kcal.goal, 'kcal')
    },
    {
      label: 'Protein',
      pct: a.vsGoals.protein.pctOfGoal,
      actual: fmt(a.vsGoals.protein.actual, 'g'),
      goal: fmt(a.vsGoals.protein.goal, 'g')
    },
    {
      label: 'Carbohydrate',
      pct: a.vsGoals.carbs.pctOfGoal,
      actual: fmt(a.vsGoals.carbs.actual, 'g'),
      goal: fmt(a.vsGoals.carbs.goal, 'g')
    },
    {
      label: 'Fat',
      pct: a.vsGoals.fat.pctOfGoal,
      actual: fmt(a.vsGoals.fat.actual, 'g'),
      goal: fmt(a.vsGoals.fat.goal, 'g')
    }
  ])

  const waterPct =
    water && water.goalMl > 0 ? (water.actualMl / water.goalMl) * 100 : 0
  const waterBars =
    water
      ? buildHBarChartSvg('Water (% of goal)', [
          {
            label: a.days > 1 ? 'Water avg/day' : 'Water',
            pct: waterPct,
            actual: formatMlExact(water.actualMl),
            goal: formatMlExact(water.goalMl)
          }
        ])
      : ''

  const mineralBarItems: BarItem[] = MINERAL_KEYS.map((key) => {
    const vs = a.vsMineralGoals[key]
    if (!vs) return null
    const meta = MINERAL_META[key]
    return {
      label: mineralDisplayLabel(key),
      pct: vs.pctOfGoal,
      actual: fmt(vs.actual, meta.unit),
      goal: fmt(vs.goal, meta.unit)
    }
  }).filter((x): x is BarItem => !!x)

  const mineralBars = buildHBarChartSvg('Minerals (% of goal)', mineralBarItems, 24)
  const mineralOverHtml = buildMineralOverGoalHtml(a)

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>MyHealth Analysis</title>
<style>
  @page { margin: 16mm 14mm; }
  body {
    font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
    color: #2c3228;
    background: #faf8f3;
    font-size: 11pt;
    line-height: 1.45;
    margin: 0;
    padding: 12px 8px;
  }
  h1 { font-size: 20pt; color: #2f6f4e; margin: 0 0 4px; }
  h2 { font-size: 13pt; color: #3d5a45; margin: 18px 0 8px; border-bottom: 1px solid #c9d4c4; padding-bottom: 4px; }
  .sub { color: #5f6b5a; font-size: 10pt; margin: 0 0 12px; }
  .brand { color: #6b7a62; font-size: 9pt; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; margin: 6px 0 10px; }
  th, td { text-align: left; padding: 5px 8px; border-bottom: 1px solid #ddd8cc; }
  th { background: #e8efe4; color: #2f6f4e; font-weight: 600; font-size: 10pt; }
  ul { margin: 6px 0 10px 18px; padding: 0; }
  li { margin-bottom: 6px; }
  .note { color: #5f6b5a; font-size: 9.5pt; margin: 4px 0; }
  .cards { display: flex; gap: 10px; flex-wrap: wrap; margin: 8px 0 12px; }
  .card {
    background: #fffdf8;
    border: 1px solid #d8d2c4;
    border-radius: 8px;
    padding: 10px 14px;
    min-width: 110px;
  }
  .card .label { font-size: 9pt; color: #6b7a62; }
  .card .value { font-size: 16pt; font-weight: 650; color: #2f6f4e; }
  .footer { margin-top: 24px; font-size: 8.5pt; color: #7a8674; }
  .chart-block { margin: 8px 0 14px; page-break-inside: avoid; }
  .chart-title { font-size: 10.5pt; color: #3d5a45; font-weight: 650; margin-bottom: 4px; }
  .charts-row { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-start; }
  details.compact-backup { margin-top: 6px; color: #5f6b5a; font-size: 9.5pt; }
  details.compact-backup summary { cursor: pointer; color: #2f6f4e; }
  svg { display: block; max-width: 100%; }
  .chart-footnote { margin: 4px 0 0; max-width: 320px; }
  .disclaimer { font-size: 8.5pt; color: #7a8674; margin-top: 8px; }
  .mineral-over {
    margin: 10px 0 14px;
    padding: 10px 12px;
    background: #fff8f4;
    border: 1px solid #e8d0c8;
    border-radius: 8px;
    page-break-inside: avoid;
  }
  .mineral-over-title {
    font-size: 10.5pt;
    color: #a35548;
    font-weight: 650;
    margin-bottom: 6px;
  }
  .mineral-over-item { margin: 6px 0 2px; }
  .mineral-over-head {
    font-size: 10pt;
    color: #3d5a45;
    font-weight: 600;
  }
  .mineral-over ul { margin: 4px 0 6px 16px; padding: 0; }
  .mineral-over li { margin-bottom: 2px; font-size: 9.5pt; }
  .mineral-over .food { color: #2c3228; }
</style>
</head>
<body>
  <h1>MyHealth</h1>
  <div class="brand">RevoCon · L.W. · Nutrition analysis report</div>
  <p class="sub">Prepared for ${who} · Range: ${esc(range)} · Generated ${esc(new Date().toISOString().slice(0, 10))}</p>

  <h2>Summary</h2>
  <div class="cards">
    <div class="card"><div class="label">Calories${a.days > 1 ? ' (avg/day)' : ''}</div><div class="value">${fmt(a.vsGoals.kcal.actual)}</div></div>
    <div class="card"><div class="label">Protein</div><div class="value">${fmt(a.vsGoals.protein.actual, 'g')}</div></div>
    <div class="card"><div class="label">Carbohydrate</div><div class="value">${fmt(a.vsGoals.carbs.actual, 'g')}</div></div>
    <div class="card"><div class="label">Fat</div><div class="value">${fmt(a.vsGoals.fat.actual, 'g')}</div></div>
  </div>
  <p class="sub">Period totals: ${fmt(a.totals.kcal, 'kcal')} · Protein ${fmt(a.totals.protein, 'g')} · Carbohydrate ${fmt(a.totals.carbs, 'g')} · Fat ${fmt(a.totals.fat, 'g')} · ${a.entryCount} entries</p>

  <h2>Plate proportion</h2>
  <p class="sub">Protein / Carbohydrate / Vegetables from amount consumed in the period (not fat). Pie is consumed mix; footnote shows % of recommended Healthy Eating 50/25/25 portions.</p>
  <div class="charts-row">${platePie}</div>

  <h2>Vs goals</h2>
  ${goalBars}
  <details class="compact-backup">
    <summary>Table backup</summary>
    <table>
      <thead><tr><th>Nutrient</th><th>Actual</th><th>Goal</th><th>% of goal</th></tr></thead>
      <tbody>
        ${vsLine('Calories', a.vsGoals.kcal.actual, a.vsGoals.kcal.goal, 'kcal', a.vsGoals.kcal.pctOfGoal)}
        ${vsLine('Protein', a.vsGoals.protein.actual, a.vsGoals.protein.goal, 'g', a.vsGoals.protein.pctOfGoal)}
        ${vsLine('Carbohydrate', a.vsGoals.carbs.actual, a.vsGoals.carbs.goal, 'g', a.vsGoals.carbs.pctOfGoal)}
        ${vsLine('Fat', a.vsGoals.fat.actual, a.vsGoals.fat.goal, 'g', a.vsGoals.fat.pctOfGoal)}
      </tbody>
    </table>
  </details>

  <h2>Macro balance</h2>
  <p>Protein ${a.macroBalance.proteinPct}% · Carbohydrate ${a.macroBalance.carbsPct}% · Fat ${a.macroBalance.fatPct}% of kcal</p>

  ${
    water
      ? `<h2>Water</h2>
  ${waterBars}
  <p class="sub">${formatMlExact(water.actualMl)} ${a.days > 1 ? 'avg/day' : 'today'} · Goal ${formatMlExact(water.goalMl)} · ${water.daysLogged}/${a.days} days logged</p>`
      : ''
  }

  <h2>Minerals</h2>
  <p class="sub">Coverage ${a.mineralCoverage.entriesWithData}/${a.mineralCoverage.entryCount} (${Math.round(a.mineralCoverage.pct)}%)</p>
  ${mineralBars}
  ${mineralOverHtml}
  <details class="compact-backup">
    <summary>Mineral table backup</summary>
    <table>
      <thead><tr><th>Mineral</th><th>Actual</th><th>Goal</th><th>% of goal</th></tr></thead>
      <tbody>${mineralRows}</tbody>
    </table>
  </details>

  ${
    mealRows
      ? `<h2>Meal breakdown</h2>
  <table>
    <thead><tr><th>Meal</th><th>kcal</th><th>Protein</th><th>Carbohydrate</th><th>Fat</th></tr></thead>
    <tbody>${mealRows}</tbody>
  </table>
  <div class="charts-row">${mealPie}</div>`
      : ''
  }

  <h2>Recommendations</h2>
  <ul>${recItems}</ul>
  ${notes}
  <p class="disclaimer">Not medical advice. Recommendations are general nutrition suggestions based on your logged diary vs goals and Health profile avoid list — talk to a qualified professional for personal medical or dietary advice.</p>

  ${
    topFoods
      ? `<h2>Top foods by calories</h2>
  <table>
    <thead><tr><th>Food</th><th>kcal</th><th>% of total</th><th>Entries</th></tr></thead>
    <tbody>${topFoods}</tbody>
  </table>`
      : ''
  }

  <div class="footer">MyHealth · RevoCon · L.W. · Local report — not medical advice.</div>
</body>
</html>`
}

/**
 * Build an analysis PDF for the selected day window via Electron printToPDF.
 * Opens a save dialog; default name MyHealth-Analysis-YYYY-MM-DD.pdf.
 */
export async function exportAnalysisPdf(
  win: BrowserWindow | null,
  days: number
): Promise<{ cancelled?: boolean; path?: string; error?: string }> {
  try {
    const safeDays = [1, 7, 14, 30].includes(days) ? days : 1
    const date = new Date().toISOString().slice(0, 10)
    const analysis = getNutritionAnalysis(date, safeDays)
    const settings = getSettings()
    const profile = getHealthProfile()
    const end = date
    const endDate = new Date(end + 'T12:00:00')
    const startDate = new Date(endDate)
    startDate.setDate(startDate.getDate() - (safeDays - 1))
    const start = startDate.toISOString().slice(0, 10)
    const logs = listWater().filter((w) => w.date >= start && w.date <= end)
    const byDay = new Map<string, number>()
    for (const w of logs) byDay.set(w.date, (byDay.get(w.date) ?? 0) + w.ml)
    const sum = [...byDay.values()].reduce((a, b) => a + b, 0)
    const waterActual = safeDays === 1 ? sum : Math.round(sum / safeDays)
    const water = {
      actualMl: waterActual,
      goalMl: getWaterGoalMl(),
      daysLogged: byDay.size
    }
    const exercises = listExercise().filter((e) => e.date >= start && e.date <= end)
    const exerciseSum = exercises.reduce((s, e) => s + (e.kcal || 0), 0)
    const exerciseKcalAvg = safeDays === 1 ? exerciseSum : exerciseSum / safeDays
    const html = buildAnalysisHtml(
      analysis,
      settings.displayName ?? '',
      water,
      exerciseKcalAvg,
      profile
    )

    const res = await dialog.showSaveDialog(win ?? undefined!, {
      title: 'Export nutrition analysis PDF',
      defaultPath: `MyHealth-Analysis-${date}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (res.canceled || !res.filePath) return { cancelled: true }

    const pdfWin = new BrowserWindow({
      show: false,
      width: 800,
      height: 1100,
      webPreferences: {
        sandbox: true,
        contextIsolation: true
      }
    })

    try {
      await pdfWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
      // Brief settle so layout / SVG paints before print
      await new Promise((r) => setTimeout(r, 350))
      const pdf = await pdfWin.webContents.printToPDF({
        printBackground: true,
        pageSize: 'A4',
        margins: { marginType: 'default' }
      })
      writeFileSync(res.filePath, pdf)
      return { path: res.filePath }
    } finally {
      if (!pdfWin.isDestroyed()) pdfWin.destroy()
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'PDF export failed' }
  }
}
