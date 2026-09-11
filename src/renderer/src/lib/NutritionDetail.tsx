import type React from 'react'
import { MINERAL_KEYS, MINERAL_META, hasAnyMineral, type MineralMap } from '../../../shared/minerals'

export type NutritionDetailData = {
  name: string
  brand?: string
  servingLabel?: string
  servingQty?: number
  kcal: number
  protein: number
  carbs: number
  fat: number
  minerals?: MineralMap
  /** Optional per-serving baseline when showing diary qty-scaled totals. */
  perServing?: {
    servingLabel?: string
    kcal: number
    protein: number
    carbs: number
    fat: number
    minerals?: MineralMap
  }
}

type Props = {
  open: boolean
  onClose: () => void
  data: NutritionDetailData | null
  /** When true, amounts are entry totals (qty already applied). */
  scaled?: boolean
}

function fmtMacro(n: number): string {
  if (!Number.isFinite(n)) return '0'
  if (Math.abs(n) >= 100) return String(Math.round(n))
  if (Math.abs(n) >= 10) return String(Math.round(n * 10) / 10)
  return String(Math.round(n * 100) / 100)
}

function fmtMineral(n: number, unit: string): string {
  if (unit === 'µg' || Math.abs(n) < 10) return String(Math.round(n * 100) / 100)
  if (Math.abs(n) < 100) return String(Math.round(n * 10) / 10)
  return String(Math.round(n))
}

/**
 * Compact expandable nutrition detail panel (macros + minerals).
 * Place after macro columns on Foods / Diary rows.
 */
export default function NutritionDetail({ open, onClose, data, scaled }: Props): React.JSX.Element | null {
  if (!open || !data) return null

  const minerals = data.minerals
  const showMinerals = hasAnyMineral(minerals)

  return (
    <div className="nutrition-detail" role="region" aria-label={`Nutrition detail for ${data.name}`}>
      <div className="nutrition-detail-head">
        <div>
          <strong>{data.name}</strong>
          {data.brand ? <span className="muted"> · {data.brand}</span> : null}
          {data.servingLabel ? (
            <div className="muted small">
              Serving: {data.servingLabel}
              {data.servingQty != null && data.servingQty !== 1
                ? ` · qty ${data.servingQty}`
                : ''}
              {scaled ? ' · entry totals' : ' · per serving'}
            </div>
          ) : null}
        </div>
        <button type="button" className="btn ghost compact" onClick={onClose} aria-label="Close detail">
          Close
        </button>
      </div>

      <div className="nutrition-detail-macros">
        <div>
          <span className="muted small">kcal</span>
          <strong>{fmtMacro(data.kcal)}</strong>
        </div>
        <div>
          <span className="muted small">Protein</span>
          <strong>{fmtMacro(data.protein)} g</strong>
        </div>
        <div>
          <span className="muted small">Carbohydrate</span>
          <strong>{fmtMacro(data.carbs)} g</strong>
        </div>
        <div>
          <span className="muted small">Fat</span>
          <strong>{fmtMacro(data.fat)} g</strong>
        </div>
      </div>

      {showMinerals ? (
        <div className="nutrition-detail-minerals">
          <div className="muted small" style={{ marginBottom: 6 }}>
            Minerals
          </div>
          <div className="nutrition-detail-mineral-grid">
            {MINERAL_KEYS.map((key) => {
              const v = minerals?.[key]
              if (v === undefined || v === null || !Number.isFinite(v)) return null
              const meta = MINERAL_META[key]
              return (
                <div key={key} className="nutrition-detail-mineral">
                  <span>{meta.label}</span>
                  <span>
                    {fmtMineral(v, meta.unit)} {meta.unit}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <p className="muted small" style={{ marginBottom: 0 }}>
          No mineral data for this item.
        </p>
      )}

      {data.perServing ? (
        <div className="nutrition-detail-perserving muted small">
          Per serving ({data.perServing.servingLabel || '1 serving'}):{' '}
          {fmtMacro(data.perServing.kcal)} kcal · Protein {fmtMacro(data.perServing.protein)} g ·
          Carbohydrate {fmtMacro(data.perServing.carbs)} g · Fat {fmtMacro(data.perServing.fat)} g
        </div>
      ) : null}
    </div>
  )
}
