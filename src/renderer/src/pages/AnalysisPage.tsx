import type React from 'react'
import { useEffect, useState } from 'react'
import type { MacroVsGoal, MealType, MineralKey, NutritionAnalysis } from '../../../shared/types'
import { MINERAL_KEYS, MINERAL_META } from '../../../shared/minerals'
import { todayIso } from '../lib/format'

type Props = { onToast: (msg: string) => void }

const RANGE_OPTIONS: { days: number; label: string }[] = [
  { days: 1, label: 'Today' },
  { days: 7, label: '7 days' },
  { days: 14, label: '14 days' },
  { days: 30, label: '30 days' }
]

const MEAL_LABELS: { key: MealType; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'snacks', label: 'Snacks' }
]

const MINERAL_COLORS: Record<MineralKey, string> = {
  sodium: '#8b3a3a',
  potassium: '#5f7d65',
  calcium: '#6b8f71',
  magnesium: '#2f6f4e',
  phosphorus: '#7a8f6b',
  iron: '#a05a2c',
  zinc: '#8a7a4a',
  copper: '#b07a3a',
  manganese: '#6a7a5a',
  selenium: '#4a7a8a',
  iodine: '#5a6a8a'
}

function formatAmt(n: number, unit: string): string {
  if (unit === 'µg' || Math.abs(n) < 10) {
    const r = Math.round(n * 100) / 100
    return String(r)
  }
  if (Math.abs(n) < 100) return String(Math.round(n * 10) / 10)
  return String(Math.round(n))
}

function GoalBar(props: {
  label: string
  unit: string
  vs: MacroVsGoal
  color: string
}): React.JSX.Element {
  const pct = Math.min(100, Math.max(0, props.vs.pctOfGoal))
  const over = props.vs.remaining < 0
  return (
    <div className="macro-bar">
      <div className="macro-bar-head">
        <span>{props.label}</span>
        <span>
          {formatAmt(props.vs.actual, props.unit)} / {formatAmt(props.vs.goal, props.unit)}{' '}
          {props.unit}
          <span className={`muted small`} style={{ marginLeft: 8 }}>
            {Math.round(props.vs.pctOfGoal)}%
            {over
              ? ` · +${formatAmt(-props.vs.remaining, props.unit)} over`
              : ` · ${formatAmt(props.vs.remaining, props.unit)} left`}
          </span>
        </span>
      </div>
      <div className="macro-track">
        <div
          className="macro-fill"
          style={{
            width: `${pct}%`,
            background: over ? 'var(--danger)' : props.color
          }}
        />
      </div>
    </div>
  )
}

function BalanceBar(props: {
  label: string
  pct: number
  color: string
}): React.JSX.Element {
  return (
    <div className="macro-bar">
      <div className="macro-bar-head">
        <span>{props.label}</span>
        <span>{props.pct}%</span>
      </div>
      <div className="macro-track">
        <div
          className="macro-fill"
          style={{ width: `${Math.min(100, props.pct)}%`, background: props.color }}
        />
      </div>
    </div>
  )
}

export default function AnalysisPage({ onToast }: Props): React.JSX.Element {
  const [date, setDate] = useState(todayIso())
  const [days, setDays] = useState(1)
  const [analysis, setAnalysis] = useState<NutritionAnalysis | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void window.api
      .analyzeNutrition({ date, days })
      .then((a) => {
        if (!cancelled) setAnalysis(a)
      })
      .catch(() => {
        if (!cancelled) onToast('Failed to load nutrition analysis')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [date, days, onToast])

  const rangeLabel =
    days === 1
      ? date
      : `${analysis?.rangeStart ?? '…'} → ${analysis?.rangeEnd ?? date}`

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Nutrition analysis</h2>
          <p className="muted">
            Diary vs your Settings goals · {rangeLabel}
            {analysis && days > 1
              ? ` · ${analysis.daysWithEntries}/${analysis.days} days logged`
              : ''}
          </p>
        </div>
        <div className="row-actions">
          <label className="block-label" style={{ marginTop: 0 }}>
            Date
            <input
              className="input"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{ marginTop: 4, minWidth: 150 }}
            />
          </label>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-header">
          <h2>Range</h2>
          <div className="spacer" />
          <div className="segmented" role="group" aria-label="Analysis range">
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.days}
                type="button"
                className={days === opt.days ? 'active' : ''}
                onClick={() => setDays(opt.days)}
              >
                {opt.days === 1 && date !== todayIso() ? 'Day' : opt.label}
              </button>
            ))}
          </div>
        </div>
        <p className="muted small" style={{ margin: 0 }}>
          {days === 1
            ? 'Comparing this day’s diary totals to your daily goals.'
            : 'Comparing average per day in the window to your daily goals (empty days count as zero).'}
        </p>
      </div>

      {loading && !analysis && (
        <div className="panel">
          <p className="muted">Loading…</p>
        </div>
      )}

      {analysis && (
        <>
          <div className="cards">
            <div className="card">
              <div className="label">Calories</div>
              <div
                className={
                  analysis.vsGoals.kcal.pctOfGoal > 110
                    ? 'value danger'
                    : analysis.vsGoals.kcal.pctOfGoal < 70
                      ? 'value warn'
                      : 'value'
                }
              >
                {Math.round(analysis.vsGoals.kcal.actual)}
              </div>
              <div className="muted small">
                Goal {analysis.vsGoals.kcal.goal} · {Math.round(analysis.vsGoals.kcal.pctOfGoal)}%
                {days > 1 ? ' avg/day' : ''}
              </div>
            </div>
            <div className="card">
              <div className="label">Protein</div>
              <div className="value">{Math.round(analysis.vsGoals.protein.actual)} g</div>
              <div className="muted small">
                Goal {analysis.vsGoals.protein.goal} g ·{' '}
                {Math.round(analysis.vsGoals.protein.pctOfGoal)}%
              </div>
            </div>
            <div className="card">
              <div className="label">Carbs</div>
              <div className="value">{Math.round(analysis.vsGoals.carbs.actual)} g</div>
              <div className="muted small">
                Goal {analysis.vsGoals.carbs.goal} g ·{' '}
                {Math.round(analysis.vsGoals.carbs.pctOfGoal)}%
              </div>
            </div>
            <div className="card">
              <div className="label">Fat</div>
              <div className="value">{Math.round(analysis.vsGoals.fat.actual)} g</div>
              <div className="muted small">
                Goal {analysis.vsGoals.fat.goal} g · {Math.round(analysis.vsGoals.fat.pctOfGoal)}%
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h2>{days === 1 ? 'Vs goals today' : 'Vs goals (avg / day)'}</h2>
            </div>
            <GoalBar
              label="Calories"
              unit="kcal"
              vs={analysis.vsGoals.kcal}
              color="#5f7d65"
            />
            <GoalBar
              label="Protein"
              unit="g"
              vs={analysis.vsGoals.protein}
              color="#2f6f4e"
            />
            <GoalBar
              label="Carbs"
              unit="g"
              vs={analysis.vsGoals.carbs}
              color="#c47a2c"
            />
            <GoalBar label="Fat" unit="g" vs={analysis.vsGoals.fat} color="#8b3a3a" />
            {days > 1 && (
              <p className="muted small" style={{ marginTop: 8, marginBottom: 0 }}>
                Period totals: {Math.round(analysis.totals.kcal)} kcal ·{' '}
                {Math.round(analysis.totals.protein)} g P · {Math.round(analysis.totals.carbs)} g
                C · {Math.round(analysis.totals.fat)} g F · {analysis.entryCount} entries
              </p>
            )}
          </div>

          <div className="panel">
            <div className="panel-header">
              <h2>Minerals</h2>
              <span className="badge-soft">
                Coverage {analysis.mineralCoverage.entriesWithData}/
                {analysis.mineralCoverage.entryCount} (
                {Math.round(analysis.mineralCoverage.pct)}%)
              </span>
            </div>
            <p className="muted small" style={{ marginTop: 0 }}>
              {days === 1
                ? 'Intake vs your daily mineral goals (Settings).'
                : 'Average per day vs daily mineral goals. Totals only include foods with mineral data.'}
            </p>
            {MINERAL_KEYS.map((key) => {
              const vs = analysis.vsMineralGoals[key]
              if (!vs) return null
              const meta = MINERAL_META[key]
              return (
                <GoalBar
                  key={key}
                  label={`${meta.label} (${meta.short})`}
                  unit={meta.unit}
                  vs={vs}
                  color={MINERAL_COLORS[key]}
                />
              )
            })}
            {analysis.mineralCoverage.pct < 100 && analysis.entryCount > 0 && (
              <p className="muted small" style={{ marginTop: 8, marginBottom: 0 }}>
                Some diary foods lack mineral data — coverage{' '}
                {Math.round(analysis.mineralCoverage.pct)}%. Re-log from the food database or
                import packs for fuller mineral tracking.
              </p>
            )}
          </div>

          <div className="panel">
            <div className="panel-header">
              <h2>Macro balance</h2>
              <span className="badge-soft">% of kcal from P / C / F</span>
            </div>
            <BalanceBar
              label="Protein (4 kcal/g)"
              pct={analysis.macroBalance.proteinPct}
              color="#2f6f4e"
            />
            <BalanceBar
              label="Carbs (4 kcal/g)"
              pct={analysis.macroBalance.carbsPct}
              color="#c47a2c"
            />
            <BalanceBar
              label="Fat (9 kcal/g)"
              pct={analysis.macroBalance.fatPct}
              color="#8b3a3a"
            />
          </div>

          {analysis.mealBreakdown && (
            <div className="panel">
              <div className="panel-header">
                <h2>Meal breakdown</h2>
              </div>
              <div className="cards meal-cards compact">
                {MEAL_LABELS.map(({ key, label }) => {
                  const m = analysis.mealBreakdown![key]
                  return (
                    <div key={key} className="card meal-plan-card compact">
                      <div className="label">{label}</div>
                      <div className="value small-value">{Math.round(m.kcal)} kcal</div>
                      <div className="muted small">
                        P {Math.round(m.protein)} · C {Math.round(m.carbs)} · F{' '}
                        {Math.round(m.fat)}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="panel">
            <div className="panel-header">
              <h2>Insights</h2>
            </div>
            <ul className="insight-list">
              {analysis.insights.map((tip) => (
                <li key={tip.id} className={`insight insight-${tip.severity}`}>
                  <span className="insight-dot" aria-hidden />
                  <span>{tip.message}</span>
                </li>
              ))}
            </ul>
            {analysis.notes.length > 0 && (
              <div className="analysis-notes">
                {analysis.notes.map((n, i) => (
                  <p key={i} className="muted small">
                    {n}
                  </p>
                ))}
              </div>
            )}
          </div>

          {analysis.topFoods.length > 0 && (
            <div className="panel">
              <div className="panel-header">
                <h2>Top foods by calories</h2>
              </div>
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Food</th>
                      <th>Kcal</th>
                      <th>% of total</th>
                      <th>Entries</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.topFoods.map((f) => (
                      <tr key={f.name}>
                        <td>{f.name}</td>
                        <td>{Math.round(f.kcal)}</td>
                        <td>{f.pctOfTotal}%</td>
                        <td>{f.entries}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
