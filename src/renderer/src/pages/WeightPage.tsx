import type React from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AppSettings, WeightLog } from '../../../shared/types'
import type { SexOption } from '../../../shared/weight'
import {
  bmi,
  bmiCategory,
  goalProgressPct,
  healthyWeightRangeKg,
  idealBodyWeightKg,
  kgDeltaToGoal,
  recommendedWeightKg,
  round1
} from '../../../shared/weight'
import { formatWeight, kgToLb, lbToKg, todayIso } from '../lib/format'

type Props = { onToast: (msg: string) => void }

function daysBetween(aIso: string, bIso: string): number {
  const a = new Date(aIso + 'T00:00:00')
  const b = new Date(bIso + 'T00:00:00')
  return Math.round((a.getTime() - b.getTime()) / 86400000)
}

/** Closest log at least `minDays` before latest (logs newest-first). */
function logAtLeastDaysAgo(logs: WeightLog[], minDays: number): WeightLog | null {
  if (logs.length < 2) return null
  const latest = logs[0]
  let best: WeightLog | null = null
  let bestExtra = Infinity
  for (let i = 1; i < logs.length; i++) {
    const d = daysBetween(latest.date, logs[i].date)
    if (d >= minDays && d - minDays < bestExtra) {
      best = logs[i]
      bestExtra = d - minDays
    }
  }
  return best
}

function fmtDelta(kgDelta: number, unit: 'kg' | 'lb'): string {
  const v = unit === 'lb' ? kgToLb(kgDelta) : kgDelta
  const sign = v > 0 ? '+' : ''
  return `${sign}${v.toFixed(1)} ${unit}`
}

function Sparkline({ values }: { values: number[] }): React.JSX.Element | null {
  if (values.length < 2) return null
  const w = 320
  const h = 72
  const pad = 4
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (w - pad * 2)
    const y = pad + (1 - (v - min) / span) * (h - pad * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  return (
    <svg className="sparkline" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      <polyline
        fill="none"
        stroke="#7a9a6d"
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={pts.join(' ')}
      />
    </svg>
  )
}

export default function WeightPage({ onToast }: Props): React.JSX.Element {
  const [logs, setLogs] = useState<WeightLog[]>([])
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [date, setDate] = useState(todayIso())
  const [value, setValue] = useState('')

  // Profile / goal draft (display unit for weights)
  const [heightCm, setHeightCm] = useState('')
  const [sex, setSex] = useState<SexOption>('')
  const [goalDisplay, setGoalDisplay] = useState('')
  const [startDisplay, setStartDisplay] = useState('')

  const reload = useCallback(async () => {
    const [list, s] = await Promise.all([window.api.listWeight(), window.api.getSettings()])
    setLogs(list)
    setSettings(s)
    setHeightCm(s.heightCm != null && s.heightCm > 0 ? String(s.heightCm) : '')
    setSex((s.sex as SexOption) || '')
    const unit = s.weightUnit ?? 'kg'
    if (s.weightGoalKg != null && s.weightGoalKg > 0) {
      setGoalDisplay(
        unit === 'lb' ? kgToLb(s.weightGoalKg).toFixed(1) : String(round1(s.weightGoalKg))
      )
    } else {
      setGoalDisplay('')
    }
    if (s.weightStartKg != null && s.weightStartKg > 0) {
      setStartDisplay(
        unit === 'lb' ? kgToLb(s.weightStartKg).toFixed(1) : String(round1(s.weightStartKg))
      )
    } else {
      setStartDisplay('')
    }
  }, [])

  useEffect(() => {
    void reload().catch(() => onToast('Failed to load weight'))
  }, [reload, onToast])

  async function add(): Promise<void> {
    if (!settings) return
    const n = Number(value)
    if (!n || n <= 0) {
      onToast('Enter a valid weight')
      return
    }
    const kg = settings.weightUnit === 'lb' ? lbToKg(n) : n
    await window.api.addWeight({ date, kg })
    onToast('Weight logged')
    setValue('')
    await reload()
  }

  async function remove(id: string): Promise<void> {
    await window.api.deleteWeight(id)
    onToast('Weight deleted')
    await reload()
  }

  async function saveProfile(): Promise<void> {
    if (!settings) return
    const unit = settings.weightUnit
    const h = Number(heightCm)
    const g = Number(goalDisplay)
    const st = Number(startDisplay)
    const patch: Partial<AppSettings> = {
      heightCm: h > 0 ? h : undefined,
      sex: sex || '',
      weightGoalKg: g > 0 ? (unit === 'lb' ? lbToKg(g) : g) : undefined,
      weightStartKg: st > 0 ? (unit === 'lb' ? lbToKg(st) : st) : undefined
    }
    const next = await window.api.updateSettings(patch)
    setSettings(next)
    onToast('Goals saved')
    await reload()
  }

  async function useRecommendedAsGoal(): Promise<void> {
    if (!settings?.heightCm) return
    const rec = recommendedWeightKg(settings.heightCm)
    if (rec == null) return
    const next = await window.api.updateSettings({ weightGoalKg: rec })
    setSettings(next)
    onToast('Goal set to recommended weight')
    await reload()
  }

  const latest = logs[0]
  const prev = logs[1]
  const unit = settings?.weightUnit ?? 'kg'
  const goalKg = settings?.weightGoalKg
  const height = settings?.heightCm

  const deltaPrev =
    latest && prev ? latest.kg - prev.kg : null

  const toGoal =
    latest && goalKg != null && goalKg > 0 ? kgDeltaToGoal(latest.kg, goalKg) : null

  const bmiVal = latest && height ? bmi(latest.kg, height) : null
  const range = height ? healthyWeightRangeKg(height) : null
  const recommended = height ? recommendedWeightKg(height) : null
  const ideal =
    height && settings?.sex
      ? idealBodyWeightKg(height, settings.sex as SexOption)
      : height
        ? idealBodyWeightKg(height, '')
        : null

  const oldest = logs.length ? logs[logs.length - 1] : null
  const startKg =
    settings?.weightStartKg ??
    oldest?.kg ??
    latest?.kg ??
    null
  const progress =
    latest && startKg != null && goalKg != null && goalKg > 0
      ? goalProgressPct(latest.kg, startKg, goalKg)
      : null

  const change7 = useMemo(() => {
    const older = logAtLeastDaysAgo(logs, 7)
    if (!latest || !older) return null
    return latest.kg - older.kg
  }, [logs, latest])

  const change30 = useMemo(() => {
    const older = logAtLeastDaysAgo(logs, 30)
    if (!latest || !older) return null
    return latest.kg - older.kg
  }, [logs, latest])

  const sparkValues = useMemo(() => {
    const slice = logs.slice(0, 30).slice().reverse()
    return slice.map((l) => l.kg)
  }, [logs])

  return (
    <div>
      <div className="page-header">
        <h2>Weight</h2>
      </div>

      <div className="cards tight">
        <div className="card">
          <div className="label">Latest weight</div>
          <div className="value">{latest ? formatWeight(latest.kg, unit) : '—'}</div>
        </div>
        <div className="card">
          <div className="label">Goal</div>
          <div className={`value ${goalKg == null || goalKg <= 0 ? 'muted' : ''}`}>
            {goalKg != null && goalKg > 0 ? formatWeight(goalKg, unit) : 'Set a goal'}
          </div>
        </div>
        <div className="card">
          <div className="label">To goal</div>
          <div
            className={`value ${
              toGoal == null
                ? ''
                : Math.abs(toGoal) < 0.05
                  ? 'good'
                  : toGoal > 0
                    ? 'warn'
                    : 'good'
            }`}
          >
            {toGoal == null ? '—' : Math.abs(toGoal) < 0.05 ? 'At goal' : fmtDelta(toGoal, unit)}
          </div>
          {toGoal != null && Math.abs(toGoal) >= 0.05 ? (
            <div className="sub">{toGoal > 0 ? 'Above goal' : 'Below goal'}</div>
          ) : null}
        </div>
        <div className="card">
          <div className="label">BMI</div>
          <div className="value">{bmiVal != null ? bmiVal.toFixed(1) : '—'}</div>
          {bmiVal != null ? <div className="sub">{bmiCategory(bmiVal)}</div> : null}
          {!height ? <div className="sub">Set height for BMI</div> : null}
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2>Recommended</h2>
        </div>
        {height && height >= 50 && range && recommended != null ? (
          <div>
            <p className="muted small" style={{ marginTop: 0 }}>
              Based on height {height} cm (healthy BMI 18.5–24.9; recommended ≈ BMI 22).
            </p>
            <div className="cards tight">
              <div className="card">
                <div className="label">Healthy range</div>
                <div className="value" style={{ fontSize: '1.1rem' }}>
                  {formatWeight(range.min, unit)} – {formatWeight(range.max, unit)}
                </div>
              </div>
              <div className="card">
                <div className="label">Recommended</div>
                <div className="value" style={{ fontSize: '1.1rem' }}>
                  {formatWeight(recommended, unit)}
                </div>
              </div>
              {ideal != null ? (
                <div className="card">
                  <div className="label">Ideal (Devine)</div>
                  <div className="value" style={{ fontSize: '1.1rem' }}>
                    {formatWeight(ideal, unit)}
                  </div>
                </div>
              ) : null}
            </div>
            <div style={{ marginTop: 12 }}>
              <button type="button" className="btn primary" onClick={() => void useRecommendedAsGoal()}>
                Use recommended as goal
              </button>
            </div>
          </div>
        ) : (
          <div>
            <p className="muted" style={{ marginTop: 0 }}>
              Enter your height to see a healthy weight range and recommended goal.
            </p>
            <div className="form-grid">
              <label>
                Height (cm)
                <input
                  className="input"
                  type="number"
                  step="0.1"
                  value={heightCm}
                  onChange={(e) => setHeightCm(e.target.value)}
                  placeholder="e.g. 170"
                />
              </label>
              <label>
                Sex (optional)
                <select
                  className="input"
                  value={sex}
                  onChange={(e) => setSex(e.target.value as SexOption)}
                >
                  <option value="">Prefer not to say</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <div className="full">
                <button type="button" className="btn primary" onClick={() => void saveProfile()}>
                  Save profile
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2>Goal &amp; profile</h2>
        </div>
        <div className="form-grid">
          <label>
            Height (cm)
            <input
              className="input"
              type="number"
              step="0.1"
              value={heightCm}
              onChange={(e) => setHeightCm(e.target.value)}
              placeholder="e.g. 170"
            />
          </label>
          <label>
            Sex
            <select
              className="input"
              value={sex}
              onChange={(e) => setSex(e.target.value as SexOption)}
            >
              <option value="">Prefer not to say</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>
            Goal weight ({unit})
            <input
              className="input"
              type="number"
              step="0.1"
              value={goalDisplay}
              onChange={(e) => setGoalDisplay(e.target.value)}
              placeholder={unit === 'kg' ? 'e.g. 70' : 'e.g. 154'}
            />
          </label>
          <label>
            Starting weight ({unit})
            <input
              className="input"
              type="number"
              step="0.1"
              value={startDisplay}
              onChange={(e) => setStartDisplay(e.target.value)}
              placeholder="Optional"
            />
          </label>
          <div className="full">
            <button type="button" className="btn primary" onClick={() => void saveProfile()}>
              Save goals
            </button>
          </div>
        </div>
        {progress != null ? (
          <div style={{ marginTop: 14 }}>
            <div className="muted small" style={{ marginBottom: 6 }}>
              Progress toward goal: {progress}%
            </div>
            <div className="progress-track" aria-label={`Progress ${progress}%`}>
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
          </div>
        ) : null}
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2>Trend monitor</h2>
        </div>
        <div className="cards tight">
          <div className="card">
            <div className="label">7-day change</div>
            <div
              className={`value ${
                change7 == null ? '' : change7 > 0 ? 'warn' : change7 < 0 ? 'good' : ''
              }`}
            >
              {change7 == null ? '—' : fmtDelta(change7, unit)}
            </div>
          </div>
          <div className="card">
            <div className="label">30-day change</div>
            <div
              className={`value ${
                change30 == null ? '' : change30 > 0 ? 'warn' : change30 < 0 ? 'good' : ''
              }`}
            >
              {change30 == null ? '—' : fmtDelta(change30, unit)}
            </div>
          </div>
          <div className="card">
            <div className="label">Trend</div>
            <div
              className={`value ${
                deltaPrev != null && deltaPrev > 0
                  ? 'warn'
                  : deltaPrev != null && deltaPrev < 0
                    ? 'good'
                    : ''
              }`}
            >
              {deltaPrev == null ? '—' : fmtDelta(deltaPrev, unit)}
            </div>
            <div className="sub">vs previous log</div>
          </div>
        </div>
        {sparkValues.length >= 2 ? (
          <div style={{ marginTop: 12 }}>
            <div className="muted small" style={{ marginBottom: 6 }}>
              Last {sparkValues.length} logs
            </div>
            <Sparkline values={sparkValues} />
          </div>
        ) : (
          <p className="muted small">Log at least two weights to see a sparkline.</p>
        )}
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2>Log weight</h2>
        </div>
        <div className="form-grid">
          <label>
            Date
            <input
              className="input"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label>
            Weight ({unit})
            <input
              className="input"
              type="number"
              step="0.1"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={unit === 'kg' ? 'e.g. 72.5' : 'e.g. 160'}
            />
          </label>
          <div className="full">
            <button type="button" className="btn primary" onClick={() => void add()}>
              Save
            </button>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2>History</h2>
          <span className="muted">Newest first</span>
        </div>
        {logs.length === 0 ? (
          <div className="empty">
            <h3>No weight logs yet</h3>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Weight</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {logs.map((w) => (
                  <tr key={w.id}>
                    <td>{w.date}</td>
                    <td>{formatWeight(w.kg, unit)}</td>
                    <td className="row-actions">
                      <button
                        type="button"
                        className="btn danger compact"
                        onClick={() => void remove(w.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
