import type React from 'react'
import { useMemo, useRef, useState } from 'react'
import type { PortionPlan } from '../../../shared/types'

type PlateShare = {
  vegetables: number
  carbohydrates: number
  protein: number
  labels: { vegetables: string[]; carbohydrates: string[]; protein: string[] }
  source: 'plan' | 'healthy-default'
}

const VEG_RE =
  /veg|spinach|broccoli|lettuce|cucumber|tomato|capsicum|carrot|celery|mushroom|peas|corn|salad|bok|cabbage|zucchini|bean sprout|mixed vegetable|passata|onion|garlic|avocado/i
const PROTEIN_RE =
  /chicken|beef|pork|lamb|fish|tuna|salmon|egg|tofu|tempeh|prawn|shrimp|ham|turkey|sardine|yoghurt|yogurt|cheese|protein|lentil|chickpea|bean|mince/i
const CARB_RE =
  /rice|pasta|bread|oat|potato|noodle|couscous|quinoa|cereal|muesli|wrap|tortilla|cracker|flour|weet|cornflake|bagel|toast/i

function classifyName(name: string): 'vegetables' | 'carbohydrates' | 'protein' | null {
  if (VEG_RE.test(name)) return 'vegetables'
  if (PROTEIN_RE.test(name)) return 'protein'
  if (CARB_RE.test(name)) return 'carbohydrates'
  return null
}

/** Derive plate shares from portion plan macros/names, else healthy-plate defaults. */
export function derivePlateShare(plan: PortionPlan | null): PlateShare {
  const labels = {
    vegetables: [] as string[],
    carbohydrates: [] as string[],
    protein: [] as string[]
  }
  if (!plan) {
    return {
      vegetables: 50,
      carbohydrates: 25,
      protein: 25,
      labels,
      source: 'healthy-default'
    }
  }

  let vegK = 0
  let carbK = 0
  let protK = 0

  for (const r of plan.items) {
    if (!r.matched || r.servingsPerDay <= 0) continue
    const byName = classifyName(r.name)
    const kcal = Math.max(0, r.perDay.kcal)
    const pKcal = r.perDay.protein * 4
    const cKcal = r.perDay.carbs * 4
    const fKcal = r.perDay.fat * 9
    let bucket = byName
    if (!bucket) {
      // Macro-dominant fallback
      if (pKcal >= cKcal && pKcal >= fKcal && r.perDay.protein >= 8) bucket = 'protein'
      else if (cKcal >= pKcal) bucket = 'carbohydrates'
      else if (fKcal > 0 && r.perDay.fat >= 8 && r.perDay.carbs < 5 && r.perDay.protein < 5)
        bucket = 'vegetables' // oils/veg-ish — keep off plate protein/carb if tiny
      else bucket = 'carbohydrates'
    }
    if (bucket === 'vegetables') {
      vegK += kcal || 40
      if (labels.vegetables.length < 4) labels.vegetables.push(r.name)
    } else if (bucket === 'protein') {
      protK += kcal || 40
      if (labels.protein.length < 4) labels.protein.push(r.name)
    } else {
      carbK += kcal || 40
      if (labels.carbohydrates.length < 4) labels.carbohydrates.push(r.name)
    }
  }

  const total = vegK + carbK + protK
  if (total <= 0) {
    return {
      vegetables: 50,
      carbohydrates: 25,
      protein: 25,
      labels,
      source: 'healthy-default'
    }
  }

  // Blend toward healthy-plate proportions so the visual stays readable,
  // while still reflecting the plan (60% plan / 40% healthy target).
  const planV = (vegK / total) * 100
  const planC = (carbK / total) * 100
  // protein remainder derived after veg/carb blend
  const vegetables = Math.round(planV * 0.6 + 50 * 0.4)
  const carbohydrates = Math.round(planC * 0.6 + 25 * 0.4)
  let protein = 100 - vegetables - carbohydrates
  if (protein < 10) {
    protein = 10
  }
  const sum = vegetables + carbohydrates + protein
  return {
    vegetables: Math.round((vegetables / sum) * 100),
    carbohydrates: Math.round((carbohydrates / sum) * 100),
    protein: Math.round((protein / sum) * 100),
    labels,
    source: 'plan'
  }
}

type Props = {
  plan: PortionPlan | null
  onToast: (msg: string) => void
}

/**
 * Healthy-plate style SVG: ~1/2 vegetables, 1/4 carbohydrates, 1/4 protein,
 * biased by the current portion plan when available.
 */
export default function PlateVisual({ plan, onToast }: Props): React.JSX.Element {
  const share = useMemo(() => derivePlateShare(plan), [plan])
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [saving, setSaving] = useState(false)

  // Geometry: left half = veg; right half split top carbs / bottom protein
  const vegPct = share.vegetables
  const carbPct = share.carbohydrates
  const protPct = share.protein

  async function savePng(): Promise<void> {
    const svg = svgRef.current
    if (!svg) return
    setSaving(true)
    try {
      const xml = new XMLSerializer().serializeToString(svg)
      const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' })
      const url = URL.createObjectURL(blob)
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
      URL.revokeObjectURL(url)
      const dataUrl = canvas.toDataURL('image/png')
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
        <span className="muted small">
          {share.source === 'plan'
            ? 'Based on your portion recommendations'
            : 'Healthy-plate guide (½ veg · ¼ carbs · ¼ protein)'}
        </span>
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
          {/* Plate rim */}
          <circle cx="180" cy="180" r="150" fill="#fffdf8" stroke="#c9d4c4" strokeWidth="10" />
          <circle cx="180" cy="180" r="140" fill="#f8f4ec" />
          {/* Vegetables — left semicircle */}
          <path
            d="M180 40 A140 140 0 0 0 180 320 Z"
            fill="#8fbc8f"
            opacity="0.92"
          />
          {/* Carbohydrates — upper right quarter */}
          <path
            d="M180 40 A140 140 0 0 1 320 180 L180 180 Z"
            fill="#e8c47a"
            opacity="0.95"
          />
          {/* Protein — lower right quarter */}
          <path
            d="M320 180 A140 140 0 0 1 180 320 L180 180 Z"
            fill="#c47a6a"
            opacity="0.92"
          />
          {/* Divider lines */}
          <line x1="180" y1="40" x2="180" y2="320" stroke="#f5f0e6" strokeWidth="3" />
          <line x1="180" y1="180" x2="320" y2="180" stroke="#f5f0e6" strokeWidth="3" />
          {/* Labels */}
          <text x="100" y="175" textAnchor="middle" fill="#2f4f2f" fontSize="13" fontFamily="Segoe UI, sans-serif" fontWeight="650">
            Vegetables
          </text>
          <text x="100" y="195" textAnchor="middle" fill="#2f4f2f" fontSize="12" fontFamily="Segoe UI, sans-serif">
            {vegPct}%
          </text>
          <text x="250" y="110" textAnchor="middle" fill="#5a4020" fontSize="12" fontFamily="Segoe UI, sans-serif" fontWeight="650">
            Carbs
          </text>
          <text x="250" y="128" textAnchor="middle" fill="#5a4020" fontSize="12" fontFamily="Segoe UI, sans-serif">
            {carbPct}%
          </text>
          <text x="250" y="250" textAnchor="middle" fill="#5a2a22" fontSize="12" fontFamily="Segoe UI, sans-serif" fontWeight="650">
            Protein
          </text>
          <text x="250" y="268" textAnchor="middle" fill="#5a2a22" fontSize="12" fontFamily="Segoe UI, sans-serif">
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
          <button
            type="button"
            className="btn primary"
            disabled={saving}
            onClick={() => void savePng()}
          >
            {saving ? 'Saving…' : 'Generate plate image'}
          </button>
        </div>
      </div>
    </div>
  )
}