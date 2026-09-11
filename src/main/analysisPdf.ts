import { BrowserWindow, dialog } from 'electron'
import { writeFileSync } from 'fs'
import {
  getHealthProfile,
  getNutritionAnalysis,
  getSettings,
  getWaterGoalMl,
  listExercise,
  listWater
} from './store'
import { MINERAL_KEYS, MINERAL_META, mineralDisplayLabel } from '../shared/minerals'
import { collectAvoidAliases, textMatchesAlias } from '../shared/health'
import { formatMlExact } from '../shared/water'
import type { HealthProfile, MealBreakdown, NutritionAnalysis } from '../shared/types'

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
  source: 'diary-foods' | 'macro-approx' | 'healthy-default'
}

/** Diary-derived Protein / Carbohydrate / Vegetables kcal shares (never fat as 3rd slice). */
function derivePlateShares(a: NutritionAnalysis): PlateShares {
  const buckets: Record<PlateGroup, number> = {
    vegetables: 0,
    carbohydrates: 0,
    protein: 0
  }
  let classifiedKcal = 0
  let topTotal = 0
  for (const f of a.topFoods) {
    topTotal += f.kcal
    const g = classifyFoodGroup(f.name)
    if (!g) continue
    buckets[g] += f.kcal
    classifiedKcal += f.kcal
  }

  const thin =
    a.topFoods.length === 0 ||
    topTotal <= 0 ||
    classifiedKcal < topTotal * 0.35 ||
    classifiedKcal < 50

  if (!thin && classifiedKcal > 0) {
    return {
      vegetables: (buckets.vegetables / classifiedKcal) * 100,
      carbohydrates: (buckets.carbohydrates / classifiedKcal) * 100,
      protein: (buckets.protein / classifiedKcal) * 100,
      source: 'diary-foods'
    }
  }

  const totalKcal = a.vsGoals.kcal.actual || a.averagePerDay.kcal || a.totals.kcal
  if (totalKcal > 0) {
    const protK = Math.max(0, a.vsGoals.protein.actual * 4)
    const carbK = Math.max(0, a.vsGoals.carbs.actual * 4)
    // Third slice = leftover after protein+carb macros (veg-like / plant remainder). Do NOT label as fat.
    const leftover = Math.max(0, totalKcal - protK - carbK)
    const vegK = Math.max(leftover, totalKcal * 0.2)
    const sum = protK + carbK + vegK
    if (sum > 0) {
      return {
        vegetables: (vegK / sum) * 100,
        carbohydrates: (carbK / sum) * 100,
        protein: (protK / sum) * 100,
        source: 'macro-approx'
      }
    }
  }

  return { vegetables: 50, carbohydrates: 25, protein: 25, source: 'healthy-default' }
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
  footnote: string,
  ariaLabel: string
): string {
  const positive = slices.map((s) => ({ ...s, pct: Math.max(0, s.pct) }))
  const sum = positive.reduce((a, s) => a + s.pct, 0)
  // Normalize to 100 when we have any mass; otherwise empty ring
  const norm =
    sum > 0
      ? positive.map((s) => ({ ...s, pct: (s.pct / sum) * 100 }))
      : positive.map((s) => ({ ...s, pct: 0 }))

  const cx = 110
  const cy = 110
  const r = 88
  let cursor = 0
  const paths: string[] = []
  for (const s of norm) {
    const start = cursor
    const end = cursor + s.pct
    cursor = end
    const d = pieSlicePath(cx, cy, r, start, end)
    if (!d) continue
    paths.push(`<path d="${d}" fill="${s.color}"/>`)
  }
  if (sum <= 0) {
    paths.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="#e8efe4"/>`)
  }

  const legend = norm
    .map((s, i) => {
      const y = 40 + i * 28
      return `<rect x="210" y="${y}" width="14" height="14" fill="${s.color}" rx="2"/>
      <text x="230" y="${y + 12}" fill="${s.textColor ?? '#2c3228'}">${esc(s.label)} ${Math.round(s.pct)}%</text>`
    })
    .join('\n')

  const titleBlock = title
    ? `<div class="chart-title">${esc(title)}</div>`
    : ''

  return `<div class="chart-block">
  ${titleBlock}
  <svg viewBox="0 0 320 230" width="320" height="230" role="img" aria-label="${esc(ariaLabel)}">
    <rect width="320" height="230" fill="#f5f0e6"/>
    ${paths.join('\n    ')}
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#c9d4c4" stroke-width="3"/>
    <g font-family="Segoe UI, sans-serif" font-size="11">
      ${legend}
    </g>
    <text x="10" y="218" fill="#6b7a62" font-size="9" font-family="Segoe UI, sans-serif">${esc(footnote)}</text>
  </svg>
</div>`
}

function buildPlatePieSvg(shares: PlateShares): string {
  const veg = Math.max(0, shares.vegetables)
  const carb = Math.max(0, shares.carbohydrates)
  const prot = Math.max(0, shares.protein)
  const sourceNote =
    shares.source === 'diary-foods'
      ? 'From diary top foods (name classification)'
      : shares.source === 'macro-approx'
        ? 'Approx. from protein/carb macros + veg-like remainder'
        : 'Healthy plate default 50 / 25 / 25'

  return buildPieSvg(
    '',
    [
      { label: 'Vegetables', pct: veg, color: '#8fbc8f', textColor: '#2f4f2f' },
      { label: 'Carbohydrate', pct: carb, color: '#e8c47a', textColor: '#5a4020' },
      { label: 'Protein', pct: prot, color: '#c47a6a', textColor: '#5a2a22' }
    ],
    sourceNote,
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

/**
 * Horizontal bars: 100% = goal mark (vertical line). Fill uses a shared scale so
 * values above goal extend past the 100% line (not clamped into the 100% track).
 */
function buildHBarChartSvg(title: string, items: BarItem[], heightPer = 28): string {
  if (items.length === 0) return ''
  const left = 132
  const top = 36
  const trackW = 240
  const rightPad = 56
  const width = left + trackW + rightPad
  const height = top + items.length * heightPer + 20

  const maxPct = Math.max(100, ...items.map((it) => Math.max(0, it.pct)))
  // Keep proportional scale; give at least a little room past 100% so overflow is visible.
  const scaleMax = Math.max(120, Math.ceil(maxPct / 10) * 10)
  const goalX = left + (100 / scaleMax) * trackW

  const rows = items
    .map((it, i) => {
      const y = top + i * heightPer
      const pct = Math.max(0, it.pct)
      const w = (pct / scaleMax) * trackW
      const fill =
        pct >= 90 && pct <= 110 ? '#6f9f7a' : pct < 70 ? '#c9a46a' : pct > 110 ? '#c47a6a' : '#8fbc8f'
      return `<text x="8" y="${y + 14}" fill="#3d5a45" font-size="10" font-family="Segoe UI, sans-serif">${esc(it.label)}</text>
    <rect x="${left}" y="${y + 2}" width="${trackW}" height="16" rx="4" fill="#e8efe4"/>
    <rect x="${left}" y="${y + 2}" width="${Math.max(pct > 0 ? 2 : 0, w)}" height="16" rx="4" fill="${fill}"/>
    <text x="${left + trackW + 8}" y="${y + 14}" fill="#2c3228" font-size="10" font-family="Segoe UI, sans-serif">${Math.round(pct)}%</text>`
    })
    .join('\n')

  return `<div class="chart-block">
  <div class="chart-title">${esc(title)}</div>
  <svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${esc(title)}">
    <rect width="${width}" height="${height}" fill="#f5f0e6"/>
    <text x="${goalX}" y="18" text-anchor="middle" fill="#2f6f4e" font-size="9" font-family="Segoe UI, sans-serif" font-weight="600">100% goal</text>
    ${rows}
    <line x1="${goalX}" y1="${top - 4}" x2="${goalX}" y2="${height - 12}" stroke="#2f6f4e" stroke-width="1.5" stroke-dasharray="3 2"/>
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
    background: #f5f0e6;
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
  .disclaimer { font-size: 8.5pt; color: #7a8674; margin-top: 8px; }
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
  <p class="sub">Protein / Carbohydrate / Vegetables (not fat). Prefer diary food classification.</p>
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
