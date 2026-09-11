import type React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
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

/** Classify a food/shopping name into plate group using shared regexes. */
export function classifyFoodGroup(name: string): FoodGroup | null {
  if (VEG_RE.test(name)) return 'vegetables'
  if (PROTEIN_RE.test(name)) return 'protein'
  if (CARB_RE.test(name)) return 'carbohydrates'
  return null
}

/** Collect example food labels from the plan; percentages come from PlateMode. */
function collectLabels(plan: PortionPlan | null): PlateShare['labels'] {
  const labels = {
    vegetables: [] as string[],
    carbohydrates: [] as string[],
    protein: [] as string[]
  }
  if (!plan) return labels

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
    if (bucket === 'vegetables') {
      if (labels.vegetables.length < 4) labels.vegetables.push(r.name)
    } else if (bucket === 'protein') {
      if (labels.protein.length < 4) labels.protein.push(r.name)
    } else if (labels.carbohydrates.length < 4) {
      labels.carbohydrates.push(r.name)
    }
  }
  return labels
}

/** Fixed mode ratios for the plate visual; labels still come from the plan when present. */
export function derivePlateShare(plan: PortionPlan | null, mode: PlateMode = 'healthy'): PlateShare {
  const meta = PLATE_MODES[mode]
  const labels = collectLabels(plan)
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

type Props = {
  plan: PortionPlan | null
  onToast: (msg: string) => void
  /** Controlled plate mode (preferred when Shopping owns mode for portion tips). */
  mode?: PlateMode
  onModeChange?: (mode: PlateMode) => void
}

/**
 * Recommended-plate SVG with two fixed modes:
 * Healthy Eating (2-1-1 -> 50/25/25) and Muscle Gain (2-2-1 -> 40/20/40).
 */
export default function PlateVisual({
  plan,
  onToast,
  mode: modeProp,
  onModeChange
}: Props): React.JSX.Element {
  const [internalMode, setInternalMode] = useState<PlateMode>('healthy')
  const mode = modeProp ?? internalMode
  const setMode = (next: PlateMode): void => {
    if (onModeChange) onModeChange(next)
    else setInternalMode(next)
  }

  const share = useMemo(() => derivePlateShare(plan, mode), [plan, mode])
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [generating, setGenerating] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setPreviewUrl(null)
  }, [mode])

  const vegPct = share.vegetables
  const carbPct = share.carbohydrates
  const protPct = share.protein
  const meta = PLATE_MODES[mode]

  const vegEnd = vegPct
  const carbEnd = vegPct + carbPct
  const vegPath = piePath(180, 180, 140, 0, vegEnd)
  const carbPath = piePath(180, 180, 140, vegEnd, carbEnd)
  const protPath = piePath(180, 180, 140, carbEnd, 100)
  const [vegLx, vegLy] = labelAt(180, 180, 140, 0, vegEnd)
  const [carbLx, carbLy] = labelAt(180, 180, 140, vegEnd, carbEnd)
  const [protLx, protLy] = labelAt(180, 180, 140, carbEnd, 100)

  const [d1x, d1y] = polar(180, 180, 140, vegEnd * 3.6)
  const [d2x, d2y] = polar(180, 180, 140, carbEnd * 3.6)
  const [d0x, d0y] = polar(180, 180, 140, 0)

  async function renderPngDataUrl(): Promise<string> {
    const svg = svgRef.current
    if (!svg) throw new Error('Plate SVG unavailable')
    const xml = new XMLSerializer().serializeToString(svg)
    const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    try {
      const img = new Image()
      const loaded = new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('Could not render plate image'))
      })
      img.src = url
      await loaded
      const canvas = document.createElement('canvas')
      canvas.width = 720
      canvas.height = 720
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas unavailable')
      ctx.fillStyle = '#f5f0e6'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      return canvas.toDataURL('image/png')
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  async function showPlateImage(): Promise<void> {
    setGenerating(true)
    try {
      const dataUrl = await renderPngDataUrl()
      setPreviewUrl(dataUrl)
      onToast('Plate image shown')
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not generate plate image')
    } finally {
      setGenerating(false)
    }
  }

  async function savePng(): Promise<void> {
    setSaving(true)
    try {
      const dataUrl = previewUrl ?? (await renderPngDataUrl())
      if (!previewUrl) setPreviewUrl(dataUrl)
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
          ref={svgRef}
          viewBox="0 0 360 360"
          width="280"
          height="280"
          role="img"
          aria-label={`Plate: vegetables ${vegPct}%, carbohydrates ${carbPct}%, protein ${protPct}%`}
        >
          <rect width="360" height="360" fill="#f5f0e6" />
          <circle cx="180" cy="180" r="150" fill="#fffdf8" stroke="#c9d4c4" strokeWidth="10" />
          <circle cx="180" cy="180" r="140" fill="#f8f4ec" />
          <path d={vegPath} fill="#8fbc8f" opacity="0.92" />
          <path d={carbPath} fill="#e8c47a" opacity="0.95" />
          <path d={protPath} fill="#c47a6a" opacity="0.92" />
          <line x1="180" y1="180" x2={d0x} y2={d0y} stroke="#f5f0e6" strokeWidth="3" />
          <line x1="180" y1="180" x2={d1x} y2={d1y} stroke="#f5f0e6" strokeWidth="3" />
          <line x1="180" y1="180" x2={d2x} y2={d2y} stroke="#f5f0e6" strokeWidth="3" />
          <text
            x={vegLx}
            y={vegLy - 8}
            textAnchor="middle"
            fill="#2f4f2f"
            fontSize="13"
            fontFamily="Segoe UI, sans-serif"
            fontWeight="650"
          >
            Vegetables
          </text>
          <text
            x={vegLx}
            y={vegLy + 12}
            textAnchor="middle"
            fill="#2f4f2f"
            fontSize="12"
            fontFamily="Segoe UI, sans-serif"
          >
            {vegPct}%
          </text>
          <text
            x={carbLx}
            y={carbLy - 8}
            textAnchor="middle"
            fill="#5a4020"
            fontSize="12"
            fontFamily="Segoe UI, sans-serif"
            fontWeight="650"
          >
            Carbs
          </text>
          <text
            x={carbLx}
            y={carbLy + 12}
            textAnchor="middle"
            fill="#5a4020"
            fontSize="12"
            fontFamily="Segoe UI, sans-serif"
          >
            {carbPct}%
          </text>
          <text
            x={protLx}
            y={protLy - 8}
            textAnchor="middle"
            fill="#5a2a22"
            fontSize="12"
            fontFamily="Segoe UI, sans-serif"
            fontWeight="650"
          >
            Protein
          </text>
          <text
            x={protLx}
            y={protLy + 12}
            textAnchor="middle"
            fill="#5a2a22"
            fontSize="12"
            fontFamily="Segoe UI, sans-serif"
          >
            {protPct}%
          </text>
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