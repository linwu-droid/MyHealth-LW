import type React from 'react'
import { useEffect, useState } from 'react'
import type { DashboardSummary, AppSettings } from '../../../shared/types'
import type { AppView } from '../App'
import { formatWeight, todayIso } from '../lib/format'

type Props = {
  onToast: (msg: string) => void
  onNavigate: (v: AppView) => void
}

function MacroBar(props: {
  label: string
  value: number
  goal: number
  color: string
}): React.JSX.Element {
  const pct = props.goal > 0 ? Math.min(100, (props.value / props.goal) * 100) : 0
  return (
    <div className="macro-bar">
      <div className="macro-bar-head">
        <span>{props.label}</span>
        <span>
          {Math.round(props.value)} / {props.goal} g
        </span>
      </div>
      <div className="macro-track">
        <div className="macro-fill" style={{ width: `${pct}%`, background: props.color }} />
      </div>
    </div>
  )
}

export default function HomePage({ onToast, onNavigate }: Props): React.JSX.Element {
  const [dash, setDash] = useState<DashboardSummary | null>(null)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const date = todayIso()

  useEffect(() => {
    void Promise.all([window.api.getDashboard(date), window.api.getSettings()])
      .then(([d, s]) => {
        setDash(d)
        setSettings(s)
      })
      .catch(() => onToast('Failed to load dashboard'))
  }, [date, onToast])

  if (!dash || !settings) {
    return (
      <div className="panel">
        <p className="muted">Loading…</p>
      </div>
    )
  }

  const greeting = settings.displayName
    ? `Hi, ${settings.displayName}`
    : 'Welcome'

  const remainingClass =
    dash.remainingKcal < 0 ? 'value danger' : dash.remainingKcal < 200 ? 'value warn' : 'value'

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>{greeting}</h2>
          <p className="muted">Today · {date}</p>
        </div>
        <div className="row-actions">
          <button type="button" className="btn primary" onClick={() => onNavigate('diary')}>
            Open diary
          </button>
          <button type="button" className="btn" onClick={() => onNavigate('weight')}>
            Log weight
          </button>
        </div>
      </div>

      <div className="cards">
        <div className="card">
          <div className="label">Calories eaten</div>
          <div className="value">{Math.round(dash.eaten.kcal)}</div>
          <div className="muted small">Goal {dash.calorieGoal} kcal</div>
        </div>
        <div className="card">
          <div className="label">Remaining</div>
          <div className={remainingClass}>{Math.round(dash.remainingKcal)}</div>
          <div className="muted small">
            −{Math.round(dash.exerciseKcal)} exercise burned
          </div>
        </div>
        <div className="card">
          <div className="label">Diary entries</div>
          <div className="value">{dash.entryCount}</div>
          <div className="muted small">{dash.exerciseCount} exercises today</div>
        </div>
        <div className="card">
          <div className="label">Latest weight</div>
          <div className="value">
            {dash.latestWeightKg != null
              ? formatWeight(dash.latestWeightKg, settings.weightUnit)
              : '—'}
          </div>
          <div className="muted small">
            {dash.latestWeightKg != null && dash.previousWeightKg != null
              ? `Prev ${formatWeight(dash.previousWeightKg, settings.weightUnit)} (${
                  dash.latestWeightKg - dash.previousWeightKg >= 0 ? '+' : ''
                }${(dash.latestWeightKg - dash.previousWeightKg).toFixed(1)} kg)`
              : 'No trend yet'}
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2>Macros today</h2>
        </div>
        <MacroBar
          label="Protein"
          value={dash.eaten.protein}
          goal={dash.proteinGoalG}
          color="#2f6f4e"
        />
        <MacroBar
          label="Carbs"
          value={dash.eaten.carbs}
          goal={dash.carbsGoalG}
          color="#c47a2c"
        />
        <MacroBar
          label="Fat"
          value={dash.eaten.fat}
          goal={dash.fatGoalG}
          color="#8b3a3a"
        />
      </div>
    </div>
  )
}
