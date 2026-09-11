import type React from 'react'
import { useEffect, useState } from 'react'
import type { MacroVsGoal, MealType, MineralKey, NutritionAnalysis } from '../../../shared/types'
import { MINERAL_KEYS, MINERAL_META } from '../../../shared/minerals'
import { formatMlExact, waterTip } from '../../../shared/water'
import { todayIso } from '../lib/format'
import { flagDiaryEntries } from '../../../shared/health'

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

/** Lighter same-hue track behind the solid fill (hex + alpha, else cream). */
function trackTint(color: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return color + '33'
  return '#ebe4d6'
}

function GoalBar(props: {
  label: string
  unit: string
  vs: MacroVsGoal
  color: string
}): React.JSX.Element {
  const pctOfGoal = props.vs.pctOfGoal
  const over = pctOfGoal > 100 || props.vs.remaining < 0
  const fillPct = Math.min(100, Math.max(0, pctOfGoal))
  return (
    <div className="macro-bar">
      <div className="macro-bar-head">
        <span>{props.label}</span>
        <span>
          {formatAmt(props.vs.actual, props.unit)} / {formatAmt(props.vs.goal, props.unit)}{' '}
          {props.unit}
          <span className={`muted small`} style={{ marginLeft: 8 }}>
            {Math.round(pctOfGoal)}%
            {over
              ? ` · +${formatAmt(-props.vs.remaining, props.unit)} over`
              : ` · ${formatAmt(props.vs.remaining, props.unit)} left`}
          </span>
        </span>
      </div>
      <div className="macro-track" style={{ background: trackTint(props.color) }}>
        <div
          className="macro-fill"
          style={{
            width: `${fillPct}%`,
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
  const [exportingPdf, setExportingPdf] = useState(false)
  const [waterActualMl, setWaterActualMl] = useState(0)
  const [waterGoalMl, setWaterGoalMl] = useState(2000)
  const [waterDaysLogged, setWaterDaysLogged] = useState(0)
  const [dayRedFlagSummary, setDayRedFlagSummary] = useState<string | null>(null)

  useEffect(() => {
    if (days !== 1) {
      setDayRedFlagSummary(null)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const [entries, foods, health] = await Promise.all([
          window.api.listDiary(date),
          window.api.listFoods(''),
          window.api.getHealthProfile()
        ])
        if (cancelled) return
        const map = new Map(foods.map((f) => [f.id, f]))
        const flags = flagDiaryEntries(entries, map, health)
        if (flags.length === 0) {
          setDayRedFlagSummary(null)
          return
        }
        const labels = [...new Set(flags.flatMap((f) => f.hits.map((h) => h.label)))]
        setDayRedFlagSummary(
          flags.length +
            ' diary entr' +
            (flags.length === 1 ? 'y' : 'ies') +
            ' may conflict with Health profile: ' +
            labels.join(', ')
        )
      } catch {
        if (!cancelled) setDayRedFlagSummary(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [date, days])

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

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [logs, goal] = await Promise.all([
          window.api.listWater(),
          window.api.getWaterGoalMl()
        ])
        if (cancelled) return
        const end = date.slice(0, 10)
        const endDate = new Date(end + 'T12:00:00')
        const startDate = new Date(endDate)
        startDate.setDate(startDate.getDate() - (days - 1))
        const start = startDate.toISOString().slice(0, 10)
        const inRange = logs.filter((w) => w.date >= start && w.date <= end)
        const byDay = new Map<string, number>()
        for (const w of inRange) {
          byDay.set(w.date, (byDay.get(w.date) ?? 0) + w.ml)
        }
        const totals = [...byDay.values()]
        const sum = totals.reduce((a, b) => a + b, 0)
        const actual = days === 1 ? sum : sum / days
        setWaterActualMl(Math.round(actual))
        setWaterGoalMl(goal)
        setWaterDaysLogged(byDay.size)
      } catch {
        if (!cancelled) onToast('Failed to load water analysis')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [date, days, onToast])


  async function handleExportPdf(): Promise<void> {
    setExportingPdf(true)
    try {
      const res = await window.api.exportAnalysisPdf(days)
      if (res.cancelled) {
        onToast('PDF export cancelled')
      } else if (res.error) {
        onToast(res.error)
      } else if (res.path) {
        onToast(`PDF saved: ${res.path}`)
      }
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'PDF export failed')
    } finally {
      setExportingPdf(false)
    }
  }
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
        <div className="analysis-date-export">
          <label className="block-label" style={{ marginTop: 0, textAlign: 'center' }}>
            Date
            <input
              className="input"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{ marginTop: 4, minWidth: 150, display: 'block' }}
            />
          </label>
          <button
            type="button"
            className="btn primary"
            disabled={exportingPdf || !analysis}
            onClick={() => void handleExportPdf()}
          >
            {exportingPdf ? 'Exporting...' : 'Export PDF'}
          </button>
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
          {days === 1 && dayRedFlagSummary && (
            <div className="analysis-health-warn" role="status">
              <strong>Health:</strong> {dayRedFlagSummary}
            </div>
          )}
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
              <div className="label">Carbohydrate</div>
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
              label="Carbohydrate"
              unit="g"
              vs={analysis.vsGoals.carbs}
              color="#c47a2c"
            />
            <GoalBar label="Fat" unit="g" vs={analysis.vsGoals.fat} color="#8b3a3a" />
            {days > 1 && (
              <p className="muted small" style={{ marginTop: 8, marginBottom: 0 }}>
                Period totals: {Math.round(analysis.totals.kcal)} kcal ·{' '}
                {Math.round(analysis.totals.protein)} g Protein · {Math.round(analysis.totals.carbs)} g Carbohydrate · {Math.round(analysis.totals.fat)} g Fat · {analysis.entryCount} entries
              </p>
            )}
          </div>

          <div className="panel">
            <div className="panel-header">
              <h2>Water</h2>
              <span className="badge-soft">
                {days === 1 ? 'Today' : 'Avg / day'} · {waterDaysLogged}/{days} days logged
              </span>
            </div>
            <GoalBar
              label="Water intake"
              unit="ml"
              vs={{
                actual: waterActualMl,
                goal: waterGoalMl,
                pctOfGoal: waterGoalMl > 0 ? (waterActualMl / waterGoalMl) * 100 : 0,
                remaining: waterGoalMl - waterActualMl
              }}
              color="#4a7a8a"
            />
            <p className="muted small" style={{ marginBottom: 0 }}>
              {waterTip(waterActualMl, waterGoalMl).message}
            </p>
            <p className="muted small" style={{ marginTop: 6, marginBottom: 0 }}>
              Goal {formatMlExact(waterGoalMl)}
              {days > 1
                ? ' · averages include days with no water log as 0'
                : ''}
            </p>
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
              <span className="badge-soft">% of kcal from Protein / Carbohydrate / Fat</span>
            </div>
            <BalanceBar
              label="Protein (4 kcal/g)"
              pct={analysis.macroBalance.proteinPct}
              color="#2f6f4e"
            />
            <BalanceBar
              label="Carbohydrate (4 kcal/g)"
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
                        Protein {Math.round(m.protein)} g · Carbohydrate {Math.round(m.carbs)} g ·
                        Fat {Math.round(m.fat)} g
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
