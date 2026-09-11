import type React from 'react'
import { BAKER_DISCLAIMER, type BakerTip } from '../../../shared/bakerGuidance'

type Props = {
  tips: BakerTip[]
  title?: string
  showDisclaimer?: boolean
  emptyText?: string
  /** Compact nested block (Pantry plate-balance) vs full panel body. */
  nested?: boolean
}

/**
 * Compact Heart & plate tips list. Same strings as the analysis PDF via bakerGuidance.
 */
export default function HeartPlateTips({
  tips,
  title = 'Heart & plate tips',
  showDisclaimer = false,
  emptyText,
  nested = false
}: Props): React.JSX.Element | null {
  if (tips.length === 0 && !emptyText) return null

  const heading = nested ? (
    <div className="portion-section-header">
      <h3>{title}</h3>
    </div>
  ) : null

  return (
    <div className={`heart-plate-tips${nested ? ' nested' : ''}`}>
      {heading}
      {tips.length === 0 ? (
        <p className="muted small">{emptyText}</p>
      ) : (
        <ul className="insight-list heart-plate-list">
          {tips.map((t) => (
            <li key={t.id} className={`insight insight-info baker-tip baker-tip-${t.topic}`}>
              <span className="insight-dot" aria-hidden />
              <span>{t.message}</span>
            </li>
          ))}
        </ul>
      )}
      {showDisclaimer ? <p className="health-disclaimer baker-disclaimer">{BAKER_DISCLAIMER}</p> : null}
    </div>
  )
}