import type React from 'react'
import { useEffect, useMemo, useState } from 'react'
import type { PortionPlan } from '../../../shared/types'

export type PlateMode = 'healthy' | 'muscle'
export type FoodGroup = 'vegetables' | 'carbohydrates' | 'protein'

type PlateShare = {
  vegetables: number
  carbohydrates: number
  protein: number
  labels: { vegetables: string[]; carbohydrates: string[]; protein: string[] }
  source: 'plan' | 'healthy-default'
}

export const PLATE_MODES: Record<
  PlateMode,
  {
    vegetables: number
    carbohydrates: number
    protein: number
    label: string
    subtitle: string
  }
> = {
  healthy: {
    vegetables: 50,
    carbohydrates: 25,
    protein: 25,
    label: 'Healthy Eating',
    subtitle: '2 veg · 1 carb · 1 protein'
  },
  muscle: {
    vegetables: 40,
    carbohydrates: 20,
    protein: 40,
    label: 'Healthy Eating & Muscle Gain',
    subtitle: '2 veg · 2 protein · 1 carb'
  }
}

const VEG_RE =
  /veg|spinach|broccoli|lettuce|cucumber|tomato|capsicum|carrot|celery|mushroom|peas|corn|salad|bok|cabbage|zucchini|bean sprout|mixed vegetable|passata|onion|garlic|avocado/i
const PROTEIN_RE =
  /chicken|beef|pork|lamb|fish|tuna|salmon|egg|tofu|tempeh|prawn|shrimp|ham|turkey|sardine|yoghurt|yogurt|cheese|protein|lentil|chickpea|bean|mince/i
const CARB_RE =
  /rice|pasta|bread|oat|potato|noodle|couscous|quinoa|cereal|muesli|wrap|tortilla|cracker|flour|weet|cornflake|bagel|toast/i

const DEFAULT_LABELS: Record<FoodGroup, string[]> = {
  vegetables: ['Leafy greens', 'Broccoli', 'Salad mix', 'Cucumber', 'Capsicum'],
  carbohydrates: ['Rice', 'Potato', 'Pasta', 'Oats', 'Wholegrain bread'],
  protein: ['Chicken', 'Fish', 'Eggs', 'Tofu', 'Yoghurt']
}

const GROUP_META: Record<
  FoodGroup,
  { title: string; short: string; fill: string; text: string }
> = {
  vegetables: { title: 'Vegetables', short: 'Vegetables', fill: '#8fbc8f', text: '#2f4f2f' },
  carbohydrates: { title: 'Carbohydrates', short: 'Carbs', fill: '#e8c47a', text: '#5a4020' },
  protein: { title: 'Protein', short: 'Protein', fill: '#c47a6a', text: '#5a2a22' }
}

/** Classify a food/shopping name into plate group using shared regexes. */
export function classifyFoodGroup(name: string): FoodGroup | null {
  if (VEG_RE.test(name)) return 'vegetables'
  if (PROTEIN_RE.test(name)) return 'protein'
  if (CARB_RE.test(name)) return 'carbohydrates'
  return null
}

function pushUnique(list: string[], name: string, max: number): void {
  const trimmed = name.trim()
  if (!trimmed) return
  const lower = trimmed.toLowerCase()
  if (list.some((x) => x.toLowerCase() === lower)) return
  if (list.length >= max) return
  list.push(trimmed)
}

/** Collect food labels from the plan and optional shopping names; max ~5 per group. */
function collectLabels(
  plan: PortionPlan | null,
  shoppingNames?: string[],
  maxPerGroup = 5
): PlateShare['labels'] {
  const labels = {
    vegetables: [] as string[],
    carbohydrates: [] as string[],
    protein: [] as string[]
  }

  if (plan) {
    for (const r of plan.items) {
      if (!r.matched || r.servingsPerDay <= 0) continue
      const byName = classifyFoodGroup(r.name)
      const pKcal = r.perDay.protein * 4
      const cKcal = r.perDay.carbs * 4
      const fKcal = r.perDay.fat * 9
      let bucket = byName
      if (!bucket) {
        if (pKcal >= cKcal && pKcal >= fKcal && r.perDay.protein >= 8) bucket = 'protein'
        else if (cKcal >= pKcal) bucket = 'carbohydrates'
        else if (fKcal > 0 && r.perDay.fat >= 8 && r.perDay.carbs < 5 && r.perDay.protein < 5)
          bucket = 'vegetables'
        else bucket = 'carbohydrates'
      }
      pushUnique(labels[bucket], r.name, maxPerGroup)
    }
  }

  if (shoppingNames) {
    for (const raw of shoppingNames) {
      const g = classifyFoodGroup(raw)
      if (!g) continue
      pushUnique(labels[g], raw, maxPerGroup)
    }
  }

  return labels
}

/** Fixed mode ratios for the plate visual; labels still come from the plan when present. */
export function derivePlateShare(
  plan: PortionPlan | null,
  mode: PlateMode = 'healthy',
  shoppingNames?: string[]
): PlateShare {
  const meta = PLATE_MODES[mode]
  const labels = collectLabels(plan, shoppingNames)
  return {
    vegetables: meta.vegetables,
    carbohydrates: meta.carbohydrates,
    protein: meta.protein,
    labels,
    source: plan && plan.items.some((r) => r.matched) ? 'plan' : 'healthy-default'
  }
}

export type PlateBalanceGap = {
  group: FoodGroup
  label: string
  tip: string
  examples: string
  count: number
  sharePct: number
  targetPct: number
}

/** Score shopping / plan items against plate mode targets; return purchase gaps. */
export function computePlateBalanceGaps(
  names: string[],
  mode: PlateMode,
  kcalByName?: Map<string, number>
): PlateBalanceGap[] {
  const meta = PLATE_MODES[mode]
  const counts: Record<FoodGroup, number> = {
    vegetables: 0,
    carbohydrates: 0,
    protein: 0
  }
  const kcal: Record<FoodGroup, number> = {
    vegetables: 0,
    carbohydrates: 0,
    protein: 0
  }
  for (const name of names) {
    const g = classifyFoodGroup(name)
    if (!g) continue
    counts[g]++
    const k = kcalByName?.get(name.toLowerCase()) ?? 1
    kcal[g] += Math.max(0, k)
  }
  const totalKcal = kcal.vegetables + kcal.carbohydrates + kcal.protein
  const share = (g: FoodGroup): number =>
    totalKcal > 0 ? (kcal[g] / totalKcal) * 100 : counts[g] > 0 ? 33.3 : 0

  const tips: { group: FoodGroup; label: string; tip: string; examples: string }[] = [
    {
      group: 'vegetables',
      label: 'Vegetables',
      tip: 'Buy more: Vegetables',
      examples: 'Leafy greens, broccoli, salad mix, cucumber, capsicum, frozen mixed veg'
    },
    {
      group: 'protein',
      label: 'Protein',
      tip: 'Buy more: Protein',
      examples: 'Chicken, fish, eggs, tofu, yoghurt, legumes'
    },
    {
      group: 'carbohydrates',
      label: 'Carbohydrates',
      tip: 'Buy more: Carbohydrates',
      examples: 'Rice, oats, potato, pasta, wholegrain bread'
    }
  ]

  const gaps: PlateBalanceGap[] = []
  for (const t of tips) {
    const target = meta[t.group]
    const sharePct = share(t.group)
    const count = counts[t.group]
    const under = count === 0 || sharePct < target / 2
    if (under) {
      gaps.push({
        group: t.group,
        label: t.label,
        tip: t.tip,
        examples: t.examples,
        count,
        sharePct: Math.round(sharePct),
        targetPct: target
      })
    }
  }
  return gaps
}

function polar(cx: number, cy: number, r: number, angleDeg: number): [number, number] {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)]
}

/** Pie slice from startPct to endPct (0-100), angles from top clockwise. */
function piePath(cx: number, cy: number, r: number, startPct: number, endPct: number): string {
  const startAngle = startPct * 3.6
  const endAngle = endPct * 3.6
  const [x1, y1] = polar(cx, cy, r, startAngle)
  const [x2, y2] = polar(cx, cy, r, endAngle)
  const large = endAngle - startAngle > 180 ? 1 : 0
  return `M${cx} ${cy} L${x1} ${y1} A${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`
}

function labelAt(cx: number, cy: number, r: number, startPct: number, endPct: number): [number, number] {
  const mid = ((startPct + endPct) / 2) * 3.6
  return polar(cx, cy, r * 0.55, mid)
}

function displayNames(labels: string[], group: FoodGroup): string[] {
  return (labels.length ? labels : DEFAULT_LABELS[group]).slice(0, 5)
}

function shortName(name: string, max = 16): string {
  const t = name.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}

function loadImage(url: string, timeoutMs: number): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    let done = false
    const finish = (value: HTMLImageElement | null): void => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve(value)
    }
    const timer = setTimeout(() => finish(null), timeoutMs)
    img.onload = () => finish(img)
    img.onerror = () => finish(null)
    img.src = url
  })
}

function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  cx: number,
  cy: number,
  size: number
): void {
  const iw = img.naturalWidth || img.width
  const ih = img.naturalHeight || img.height
  if (!iw || !ih) return
  const scale = Math.max(size / iw, size / ih)
  const dw = iw * scale
  const dh = ih * scale
  ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh)
}

function drawWedgeText(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  title: string,
  pct: number,
  foods: string[],
  textColor: string
): void {
  const lines = [`${title} ${pct}%`, ...foods.slice(0, 4).map((n) => shortName(n, 18))]
  const lineH = 18
  const padX = 10
  const padY = 6
  ctx.font = '650 15px "Segoe UI", sans-serif'
  let maxW = 0
  for (let i = 0; i < lines.length; i++) {
    ctx.font = i === 0 ? '650 15px "Segoe UI", sans-serif' : '10px "Segoe UI", sans-serif'
    maxW = Math.max(maxW, ctx.measureText(lines[i]).width)
  }
  const boxW = maxW + padX * 2
  const boxH = lines.length * lineH + padY * 2 - 4
  const left = x - boxW / 2
  const top = y - boxH / 2

  ctx.save()
  ctx.fillStyle = 'rgba(245, 240, 230, 0.82)'
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)'
  ctx.lineWidth = 1
  const r = 8
  ctx.beginPath()
  ctx.moveTo(left + r, top)
  ctx.arcTo(left + boxW, top, left + boxW, top + boxH, r)
  ctx.arcTo(left + boxW, top + boxH, left, top + boxH, r)
  ctx.arcTo(left, top + boxH, left, top, r)
  ctx.arcTo(left, top, left + boxW, top, r)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()

  let ty = top + padY + 12
  for (let i = 0; i < lines.length; i++) {
    ctx.font = i === 0 ? '650 15px "Segoe UI", sans-serif' : '10px "Segoe UI", sans-serif'
    ctx.fillStyle = textColor
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.strokeStyle = 'rgba(255,253,248,0.75)'
    ctx.lineWidth = 2.5
    ctx.strokeText(lines[i], x, ty)
    ctx.fillText(lines[i], x, ty)
    ty += lineH
  }
  ctx.restore()
}

type Props = {
  plan: PortionPlan | null
  onToast: (msg: string) => void
  /** Controlled plate mode (preferred when Shopping owns mode for portion tips). */
  mode?: PlateMode
  onModeChange?: (mode: PlateMode) => void
  /** Shopping list item names to merge into wedge food labels. */
  shoppingNames?: string[]
}

type SliceSpec = {
  group: FoodGroup
  startPct: number
  endPct: number
  pct: number
  path: string
  lx: number
  ly: number
  foods: string[]
}

/**
 * Recommended-plate SVG with two fixed modes:
 * Healthy Eating (2-1-1 -> 50/25/25) and Muscle Gain (2-2-1 -> 40/20/40).
 */
export default function PlateVisual({
  plan,
  onToast,
  mode: modeProp,
  onModeChange,
  shoppingNames
}: Props): React.JSX.Element {
  const [internalMode, setInternalMode] = useState<PlateMode>('healthy')
  const mode = modeProp ?? internalMode
  const setMode = (next: PlateMode): void => {
    if (onModeChange) onModeChange(next)
    else setInternalMode(next)
  }

  const share = useMemo(
    () => derivePlateShare(plan, mode, shoppingNames),
    [plan, mode, shoppingNames]
  )
  const [generating, setGenerating] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const shoppingKey = (shoppingNames ?? []).join('\0')
  useEffect(() => {
    setPreviewUrl(null)
  }, [mode, plan, shoppingKey])

  const vegPct = share.vegetables
  const carbPct = share.carbohydrates
  const protPct = share.protein
  const meta = PLATE_MODES[mode]

  const vegEnd = vegPct
  const carbEnd = vegPct + carbPct
  const slices: SliceSpec[] = useMemo(() => {
    const cx = 180
    const cy = 180
    const r = 140
    const mk = (
      group: FoodGroup,
      startPct: number,
      endPct: number,
      pct: number
    ): SliceSpec => {
      const [lx, ly] = labelAt(cx, cy, r, startPct, endPct)
      return {
        group,
        startPct,
        endPct,
        pct,
        path: piePath(cx, cy, r, startPct, endPct),
        lx,
        ly,
        foods: displayNames(share.labels[group], group)
      }
    }
    return [
      mk('vegetables', 0, vegEnd, vegPct),
      mk('carbohydrates', vegEnd, carbEnd, carbPct),
      mk('protein', carbEnd, 100, protPct)
    ]
  }, [share.labels, vegEnd, carbEnd, vegPct, carbPct, protPct])

  const [d1x, d1y] = polar(180, 180, 140, vegEnd * 3.6)
  const [d2x, d2y] = polar(180, 180, 140, carbEnd * 3.6)
  const [d0x, d0y] = polar(180, 180, 140, 0)

  async function renderCanvasPlate(): Promise<{ dataUrl: string; imageCount: number }> {
    const scale = 2
    const size = 360 * scale
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas unavailable')

    const cx = 180 * scale
    const cy = 180 * scale
    const r = 140 * scale

    ctx.fillStyle = '#f5f0e6'
    ctx.fillRect(0, 0, size, size)
    ctx.beginPath()
    ctx.arc(cx, cy, 150 * scale, 0, Math.PI * 2)
    ctx.fillStyle = '#fffdf8'
    ctx.fill()
    ctx.lineWidth = 10 * scale
    ctx.strokeStyle = '#c9d4c4'
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fillStyle = '#f8f4ec'
    ctx.fill()

    const scaledSlices = slices.map((s) => ({
      ...s,
      path: piePath(cx, cy, r, s.startPct, s.endPct),
      lx: s.lx * scale,
      ly: s.ly * scale
    }))

    for (const s of scaledSlices) {
      ctx.fillStyle = GROUP_META[s.group].fill
      ctx.globalAlpha = 0.92
      ctx.fill(new Path2D(s.path))
      ctx.globalAlpha = 1
    }

    // Fetch up to 2 images per group (best-effort, overall budget ~4.5s)
    const foodImage =
      typeof window.api?.foodImage === 'function'
        ? window.api.foodImage.bind(window.api)
        : null

    let imageCount = 0
    if (foodImage) {
      const deadline = Date.now() + 4500
      const jobs: Promise<void>[] = []
      for (const s of scaledSlices) {
        const names = s.foods.slice(0, 2)
        jobs.push(
          (async () => {
            const imgs: HTMLImageElement[] = []
            for (const name of names) {
              if (Date.now() > deadline) break
              try {
                const remaining = Math.max(400, deadline - Date.now())
                const url = await Promise.race([
                  foodImage(name),
                  new Promise<null>((resolve) => setTimeout(() => resolve(null), Math.min(4000, remaining)))
                ])
                if (!url || Date.now() > deadline) continue
                const img = await loadImage(url, Math.min(2500, Math.max(300, deadline - Date.now())))
                if (img) imgs.push(img)
              } catch {
                // skip
              }
            }
            if (!imgs.length) return
            ctx.save()
            ctx.clip(new Path2D(s.path))
            ctx.globalAlpha = 0.85
            const [midX, midY] = [
              ((s.startPct + s.endPct) / 2) * 3.6,
              0
            ]
            const [bx, by] = polar(cx, cy, r * 0.55, midX)
            void midY
            if (imgs.length === 1) {
              drawCoverImage(ctx, imgs[0], bx, by, r * 0.95)
              imageCount += 1
            } else {
              const a0 = s.startPct * 3.6
              const a1 = s.endPct * 3.6
              const [x0, y0] = polar(cx, cy, r * 0.55, a0 + (a1 - a0) * 0.28)
              const [x1, y1] = polar(cx, cy, r * 0.55, a0 + (a1 - a0) * 0.72)
              drawCoverImage(ctx, imgs[0], x0, y0, r * 0.7)
              drawCoverImage(ctx, imgs[1], x1, y1, r * 0.7)
              imageCount += 2
            }
            ctx.restore()
          })()
        )
      }
      await Promise.allSettled(jobs)
    }

    // Divider lines
    for (const ang of [0, vegEnd * 3.6, carbEnd * 3.6]) {
      const [x, y] = polar(cx, cy, r, ang)
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(x, y)
      ctx.strokeStyle = '#f5f0e6'
      ctx.lineWidth = 3 * scale
      ctx.stroke()
    }

    for (const s of scaledSlices) {
      drawWedgeText(
        ctx,
        s.lx,
        s.ly,
        GROUP_META[s.group].short,
        s.pct,
        s.foods,
        GROUP_META[s.group].text
      )
    }

    ctx.fillStyle = '#6b7a62'
    ctx.font = '10px "Segoe UI", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText('MyHealth L.W · RevoCon · L.W.', cx, 348 * scale)

    let dataUrl: string
    try {
      dataUrl = canvas.toDataURL('image/png')
    } catch {
      // Canvas tainted by cross-origin images without CORS — redraw text-only.
      return renderTextOnlyPlate(slices, vegEnd, carbEnd, scale)
    }
    return { dataUrl, imageCount }
  }

  function renderTextOnlyPlate(
    sliceList: SliceSpec[],
    vegEndPct: number,
    carbEndPct: number,
    scale: number
  ): { dataUrl: string; imageCount: number } {
    const size = 360 * scale
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas unavailable')
    const cx = 180 * scale
    const cy = 180 * scale
    const r = 140 * scale
    ctx.fillStyle = '#f5f0e6'
    ctx.fillRect(0, 0, size, size)
    ctx.beginPath()
    ctx.arc(cx, cy, 150 * scale, 0, Math.PI * 2)
    ctx.fillStyle = '#fffdf8'
    ctx.fill()
    ctx.lineWidth = 10 * scale
    ctx.strokeStyle = '#c9d4c4'
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fillStyle = '#f8f4ec'
    ctx.fill()
    for (const s of sliceList) {
      const path = piePath(cx, cy, r, s.startPct, s.endPct)
      ctx.fillStyle = GROUP_META[s.group].fill
      ctx.globalAlpha = 0.92
      ctx.fill(new Path2D(path))
      ctx.globalAlpha = 1
    }
    for (const ang of [0, vegEndPct * 3.6, carbEndPct * 3.6]) {
      const [x, y] = polar(cx, cy, r, ang)
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(x, y)
      ctx.strokeStyle = '#f5f0e6'
      ctx.lineWidth = 3 * scale
      ctx.stroke()
    }
    for (const s of sliceList) {
      drawWedgeText(
        ctx,
        s.lx * scale,
        s.ly * scale,
        GROUP_META[s.group].short,
        s.pct,
        s.foods,
        GROUP_META[s.group].text
      )
    }
    ctx.fillStyle = '#6b7a62'
    ctx.font = '10px "Segoe UI", sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('MyHealth L.W · RevoCon · L.W.', cx, 348 * scale)
    return { dataUrl: canvas.toDataURL('image/png'), imageCount: 0 }
  }

  async function showPlateImage(): Promise<void> {
    setGenerating(true)
    try {
      const { dataUrl, imageCount } = await renderCanvasPlate()
      setPreviewUrl(dataUrl)
      if (imageCount > 0) onToast(`Plate image shown (${imageCount} food photo${imageCount === 1 ? '' : 's'})`)
      else onToast('Plate image shown (text labels — photos unavailable)')
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not generate plate image')
    } finally {
      setGenerating(false)
    }
  }

  async function savePng(): Promise<void> {
    setSaving(true)
    try {
      let dataUrl = previewUrl
      if (!dataUrl) {
        const rendered = await renderCanvasPlate()
        dataUrl = rendered.dataUrl
        setPreviewUrl(dataUrl)
      }
      if (typeof window.api.savePngDataUrl === 'function') {
        const res = await window.api.savePngDataUrl(
          dataUrl,
          `MyHealth-Plate-${new Date().toISOString().slice(0, 10)}.png`
        )
        if (res.cancelled) onToast('Save cancelled')
        else if (res.error) onToast(res.error)
        else if (res.path) onToast(`Plate image saved: ${res.path}`)
      } else {
        const a = document.createElement('a')
        a.href = dataUrl
        a.download = `MyHealth-Plate-${new Date().toISOString().slice(0, 10)}.png`
        a.click()
        onToast('Plate image downloaded')
      }
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not save plate image')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="plate-visual">
      <div className="portion-section-header">
        <h3>Recommended plate</h3>
        <span className="muted small">{meta.subtitle}</span>
      </div>
      <div className="segmented" role="group" aria-label="Plate mode" style={{ marginBottom: 12 }}>
        {(
          [
            ['healthy', 'Healthy Eating'],
            ['muscle', 'Healthy Eating & Muscle Gain']
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={mode === id ? 'active' : ''}
            aria-pressed={mode === id}
            onClick={() => setMode(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="plate-visual-body">
        <svg
          viewBox="0 0 360 360"
          width="280"
          height="280"
          role="img"
          aria-label={`Plate: vegetables ${vegPct}%, carbohydrates ${carbPct}%, protein ${protPct}%`}
        >
          <rect width="360" height="360" fill="#f5f0e6" />
          <circle cx="180" cy="180" r="150" fill="#fffdf8" stroke="#c9d4c4" strokeWidth="10" />
          <circle cx="180" cy="180" r="140" fill="#f8f4ec" />
          {slices.map((s) => (
            <path key={s.group} d={s.path} fill={GROUP_META[s.group].fill} opacity="0.92" />
          ))}
          <line x1="180" y1="180" x2={d0x} y2={d0y} stroke="#f5f0e6" strokeWidth="3" />
          <line x1="180" y1="180" x2={d1x} y2={d1y} stroke="#f5f0e6" strokeWidth="3" />
          <line x1="180" y1="180" x2={d2x} y2={d2y} stroke="#f5f0e6" strokeWidth="3" />
          {slices.map((s) => {
            const foods = s.foods.slice(0, 4)
            const titleY = s.ly - 6 - foods.length * 5
            return (
              <g key={`${s.group}-labels`}>
                <text
                  x={s.lx}
                  y={titleY}
                  textAnchor="middle"
                  fill={GROUP_META[s.group].text}
                  fontSize="12"
                  fontFamily="Segoe UI, sans-serif"
                  fontWeight="650"
                >
                  {GROUP_META[s.group].short}
                </text>
                <text
                  x={s.lx}
                  y={titleY + 13}
                  textAnchor="middle"
                  fill={GROUP_META[s.group].text}
                  fontSize="11"
                  fontFamily="Segoe UI, sans-serif"
                >
                  {s.pct}%
                </text>
                {foods.map((name, i) => (
                  <text
                    key={`${s.group}-${name}-${i}`}
                    x={s.lx}
                    y={titleY + 26 + i * 11}
                    textAnchor="middle"
                    fill={GROUP_META[s.group].text}
                    fontSize="9"
                    fontFamily="Segoe UI, sans-serif"
                    opacity="0.95"
                  >
                    {shortName(name, 15)}
                  </text>
                ))}
              </g>
            )
          })}
          <text x="180" y="348" textAnchor="middle" fill="#6b7a62" fontSize="10" fontFamily="Segoe UI, sans-serif">
            MyHealth L.W · RevoCon · L.W.
          </text>
        </svg>
        <div className="plate-visual-legend">
          <div>
            <strong style={{ color: '#2f6f4e' }}>Vegetables ~{vegPct}%</strong>
            <div className="muted small">
              {share.labels.vegetables.length
                ? share.labels.vegetables.join(' · ')
                : 'Leafy greens, salad, mixed veg'}
            </div>
          </div>
          <div>
            <strong style={{ color: '#c47a2c' }}>Carbohydrates ~{carbPct}%</strong>
            <div className="muted small">
              {share.labels.carbohydrates.length
                ? share.labels.carbohydrates.join(' · ')
                : 'Rice, potato, pasta, grains'}
            </div>
          </div>
          <div>
            <strong style={{ color: '#8b3a3a' }}>Protein ~{protPct}%</strong>
            <div className="muted small">
              {share.labels.protein.length
                ? share.labels.protein.join(' · ')
                : 'Lean meat, fish, eggs, legumes'}
            </div>
          </div>
          <div className="plate-generate-row">
            <button
              type="button"
              className="btn primary"
              disabled={generating}
              onClick={() => void showPlateImage()}
            >
              {generating ? 'Generating…' : previewUrl ? 'Refresh plate image' : 'Show plate image'}
            </button>
            {previewUrl && (
              <div className="plate-preview-wrap">
                <img
                  className="plate-preview-img"
                  src={previewUrl}
                  alt="Generated plate preview"
                  width={200}
                  height={200}
                />
                <button
                  type="button"
                  className="btn link-btn"
                  disabled={saving}
                  onClick={() => void savePng()}
                >
                  {saving ? 'Saving…' : 'Save…'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
