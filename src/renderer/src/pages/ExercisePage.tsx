import type React from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Exercise } from '../../../shared/types'
import {
  PRESETS,
  estimateExerciseKcal,
  findPreset,
  resolveMetFromName
} from '../../../shared/exerciseMet'
import { todayIso } from '../lib/format'

type Props = { onToast: (msg: string) => void }

const DEFAULT_WEIGHT_KG = 70

export default function ExercisePage({ onToast }: Props): React.JSX.Element {
  const [date, setDate] = useState(todayIso())
  const [items, setItems] = useState<Exercise[]>([])
  const [recent, setRecent] = useState<Exercise[]>([])
  const [name, setName] = useState('')
  const [minutes, setMinutes] = useState('')
  const [kcal, setKcal] = useState('')
  const [kcalManual, setKcalManual] = useState(false)
  const [weightKg, setWeightKg] = useState(DEFAULT_WEIGHT_KG)
  const [weightIsDefault, setWeightIsDefault] = useState(true)
  const [filterDay, setFilterDay] = useState(true)

  const reload = useCallback(async () => {
    const [dayList, all] = await Promise.all([
      window.api.listExercise(date),
      window.api.listExercise()
    ])
    setItems(dayList)
    setRecent(all.slice(0, 30))
  }, [date])

  const loadWeight = useCallback(async () => {
    try {
      const [weights, settings] = await Promise.all([
        window.api.listWeight(),
        window.api.getSettings()
      ])
      const latest = weights[0]?.kg
      if (latest && latest > 0) {
        setWeightKg(latest)
        setWeightIsDefault(false)
        return
      }
      const goal = settings.weightGoalKg
      if (goal && goal > 0) {
        setWeightKg(goal)
        setWeightIsDefault(false)
        return
      }
      setWeightKg(DEFAULT_WEIGHT_KG)
      setWeightIsDefault(true)
    } catch {
      setWeightKg(DEFAULT_WEIGHT_KG)
      setWeightIsDefault(true)
    }
  }, [])

  useEffect(() => {
    void reload().catch(() => onToast('Failed to load exercise'))
  }, [reload, onToast])

  useEffect(() => {
    void loadWeight()
  }, [loadWeight])

  const resolvedMet = useMemo(() => resolveMetFromName(name), [name])
  const minutesNum = minutes ? Number(minutes) : NaN
  const canAuto =
    resolvedMet !== null &&
    Number.isFinite(minutesNum) &&
    minutesNum > 0 &&
    weightKg > 0

  const autoKcal = useMemo(() => {
    if (!canAuto || resolvedMet === null) return null
    return estimateExerciseKcal({
      met: resolvedMet,
      weightKg,
      minutes: minutesNum
    })
  }, [canAuto, resolvedMet, weightKg, minutesNum])

  // Auto-fill kcal when not manually overridden
  useEffect(() => {
    if (kcalManual) return
    if (autoKcal !== null) {
      setKcal(String(autoKcal))
    } else if (!kcalManual) {
      // Clear auto value when inputs incomplete (keep field empty for clarity)
      setKcal((prev) => (prev && !kcalManual ? '' : prev))
    }
  }, [autoKcal, kcalManual])

  function onNameChange(value: string): void {
    setName(value)
    setKcalManual(false)
  }

  function onPresetSelect(presetId: string): void {
    if (!presetId) return
    const preset = PRESETS.find((p) => p.id === presetId)
    if (!preset) return
    setName(preset.name)
    setKcalManual(false)
  }

  function onMinutesChange(value: string): void {
    setMinutes(value)
    setKcalManual(false)
  }

  function onKcalChange(value: string): void {
    setKcal(value)
    setKcalManual(true)
  }

  function recalculate(): void {
    setKcalManual(false)
    if (autoKcal !== null) {
      setKcal(String(autoKcal))
    } else if (resolvedMet !== null && Number.isFinite(minutesNum) && minutesNum > 0) {
      const est = estimateExerciseKcal({
        met: resolvedMet,
        weightKg,
        minutes: minutesNum
      })
      setKcal(String(est))
    } else {
      onToast('Enter activity + minutes to recalculate')
    }
  }

  async function add(): Promise<void> {
    if (!name.trim()) {
      onToast('Name is required')
      return
    }
    const mins = minutes ? Number(minutes) : undefined
    let kcalVal = Number(kcal) || 0

    if ((!mins || mins <= 0) && kcalVal <= 0) {
      onToast('Enter minutes (for auto) or calories')
      return
    }

    if (kcalVal <= 0 && mins && mins > 0) {
      const met = resolveMetFromName(name.trim())
      if (met !== null) {
        kcalVal = estimateExerciseKcal({ met, weightKg, minutes: mins })
      }
    }

    await window.api.addExercise({
      date,
      name: name.trim(),
      minutes: mins && mins > 0 ? mins : undefined,
      kcal: kcalVal
    })
    onToast('Exercise logged')
    setName('')
    setMinutes('')
    setKcal('')
    setKcalManual(false)
    await reload()
  }

  async function remove(id: string): Promise<void> {
    await window.api.deleteExercise(id)
    onToast('Exercise deleted')
    await reload()
  }

  const list = filterDay ? items : recent
  const dayBurn = items.reduce((s, e) => s + e.kcal, 0)
  const matchedPreset = name ? findPreset(name) : null
  const selectedPresetId =
    matchedPreset && matchedPreset.name.toLowerCase() === name.trim().toLowerCase()
      ? matchedPreset.id
      : ''

  return (
    <div>
      <div className="page-header">
        <h2>Exercise</h2>
        <div className="row-actions">
          <input
            type="date"
            className="input"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      </div>

      <div className="cards tight">
        <div className="card">
          <div className="label">Burned today</div>
          <div className="value">{Math.round(dayBurn)} kcal</div>
        </div>
        <div className="card">
          <div className="label">Sessions today</div>
          <div className="value">{items.length}</div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2>Log exercise</h2>
        </div>
        <div className="form-grid">
          <label>
            Activity
            <select
              className="input"
              value={selectedPresetId}
              onChange={(e) => onPresetSelect(e.target.value)}
            >
              <option value="">Custom / pick preset…</option>
              {[...PRESETS].sort((a, b) => a.name.localeCompare(b.name)).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (MET {p.met})
                </option>
              ))}
            </select>
          </label>
          <label>
            Name
            <input
              className="input"
              list="exercise-presets"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="e.g. Brisk walk"
            />
            <datalist id="exercise-presets">
              {[...PRESETS].sort((a, b) => a.name.localeCompare(b.name)).map((p) => (
                <option key={p.id} value={p.name} />
              ))}
            </datalist>
          </label>
          <label>
            Minutes {canAuto || !kcal ? '(needed for auto)' : '(optional if kcal set)'}
            <input
              className="input"
              type="number"
              min={0}
              step={1}
              value={minutes}
              onChange={(e) => onMinutesChange(e.target.value)}
              placeholder="e.g. 30"
            />
          </label>
          <label>
            Calories burned
            <input
              className="input"
              type="number"
              min={0}
              step={1}
              value={kcal}
              onChange={(e) => onKcalChange(e.target.value)}
              placeholder="Auto or enter"
            />
          </label>
          <div className="full">
            <p className="muted small" style={{ margin: '0 0 6px' }}>
              Auto from MET x weight x time — edit to override.
              {weightIsDefault
                ? ' Using default 70 kg (log weight or set a goal for accuracy).'
                : ` Weight ${weightKg} kg.`}
            </p>
            {autoKcal !== null && resolvedMet !== null ? (
              <p className="muted small" style={{ margin: '0 0 8px' }}>
                Est. {autoKcal} kcal | MET {resolvedMet} | {weightKg} kg
                {kcalManual ? ' (manual override — change activity/minutes or Recalculate)' : ''}
              </p>
            ) : name.trim() && !resolvedMet ? (
              <p className="muted small" style={{ margin: '0 0 8px' }}>
                Unknown activity MET — enter calories manually or pick a preset.
              </p>
            ) : null}
            <div className="row-actions">
              <button type="button" className="btn primary" onClick={() => void add()}>
                Save
              </button>
              <button type="button" className="btn" onClick={() => recalculate()}>
                Recalculate
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2>{filterDay ? 'Selected day' : 'Recent'}</h2>
          <div className="spacer" />
          <button
            type="button"
            className={`btn compact ${filterDay ? 'primary' : ''}`}
            onClick={() => setFilterDay(true)}
          >
            Day
          </button>
          <button
            type="button"
            className={`btn compact ${!filterDay ? 'primary' : ''}`}
            onClick={() => setFilterDay(false)}
          >
            Recent
          </button>
        </div>
        {list.length === 0 ? (
          <div className="empty">
            <h3>No exercise logged</h3>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Name</th>
                  <th>Minutes</th>
                  <th>kcal</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((e) => (
                  <tr key={e.id}>
                    <td>{e.date}</td>
                    <td>{e.name}</td>
                    <td>{e.minutes ?? '—'}</td>
                    <td>{Math.round(e.kcal)}</td>
                    <td className="row-actions">
                      <button
                        type="button"
                        className="btn danger compact"
                        onClick={() => void remove(e.id)}
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