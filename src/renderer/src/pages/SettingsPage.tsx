import type React from 'react'
import { useEffect, useState } from 'react'
import type { AppSettings, MineralKey, WeightUnit } from '../../../shared/types'
import { MINERAL_KEYS, MINERAL_META, defaultMineralGoals } from '../../../shared/minerals'

type Props = {
  onToast: (msg: string) => void
  onReset: () => void
}

function ensureMineralGoals(s: AppSettings): AppSettings {
  return {
    ...s,
    mineralGoals: { ...defaultMineralGoals(), ...(s.mineralGoals ?? {}) }
  }
}

export default function SettingsPage({ onToast, onReset }: Props): React.JSX.Element {
  const [form, setForm] = useState<AppSettings | null>(null)

  useEffect(() => {
    void window.api
      .getSettings()
      .then((s) => setForm(ensureMineralGoals(s)))
      .catch(() => onToast('Failed to load settings'))
  }, [onToast])

  async function save(): Promise<void> {
    if (!form) return
    const next = await window.api.updateSettings(ensureMineralGoals(form))
    setForm(ensureMineralGoals(next))
    onToast('Settings saved')
  }

  async function doExport(): Promise<void> {
    const res = await window.api.exportData()
    if (res.cancelled) return
    onToast(res.path ? `Exported to ${res.path}` : 'Exported')
  }

  async function doImport(): Promise<void> {
    const res = await window.api.importData()
    if (res.cancelled) return
    if (res.error) {
      onToast(`Import failed: ${res.error}`)
      return
    }
    setForm(ensureMineralGoals(await window.api.getSettings()))
    onReset()
    onToast('Data imported')
  }

  async function doReset(): Promise<void> {
    const ok = window.confirm(
      'Reset all MyHealth data? This restores default settings and the seed food list. Diary, weight and exercise logs will be cleared.'
    )
    if (!ok) return
    await window.api.resetData()
    setForm(ensureMineralGoals(await window.api.getSettings()))
    onReset()
    onToast('Data reset')
  }

  function setMineralGoal(key: MineralKey, value: number): void {
    if (!form) return
    setForm({
      ...form,
      mineralGoals: {
        ...defaultMineralGoals(),
        ...(form.mineralGoals ?? {}),
        [key]: value
      }
    })
  }

  if (!form) {
    return (
      <div className="panel">
        <p className="muted">Loading…</p>
      </div>
    )
  }

  const goals = { ...defaultMineralGoals(), ...(form.mineralGoals ?? {}) }

  return (
    <div>
      <div className="page-header">
        <h2>Settings</h2>
        <button type="button" className="btn primary" onClick={() => void save()}>
          Save settings
        </button>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2>Profile & goals</h2>
        </div>
        <div className="form-grid">
          <label>
            Display name
            <input
              className="input"
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              placeholder="Your name"
            />
          </label>
          <label>
            Daily calorie goal
            <input
              className="input"
              type="number"
              value={form.calorieGoal}
              onChange={(e) =>
                setForm({ ...form, calorieGoal: Number(e.target.value) || 0 })
              }
            />
          </label>
          <label>
            Protein goal (g)
            <input
              className="input"
              type="number"
              value={form.proteinGoalG}
              onChange={(e) =>
                setForm({ ...form, proteinGoalG: Number(e.target.value) || 0 })
              }
            />
          </label>
          <label>
            Carbs goal (g)
            <input
              className="input"
              type="number"
              value={form.carbsGoalG}
              onChange={(e) =>
                setForm({ ...form, carbsGoalG: Number(e.target.value) || 0 })
              }
            />
          </label>
          <label>
            Fat goal (g)
            <input
              className="input"
              type="number"
              value={form.fatGoalG}
              onChange={(e) =>
                setForm({ ...form, fatGoalG: Number(e.target.value) || 0 })
              }
            />
          </label>
          <label>
            Weight unit
            <select
              className="input"
              value={form.weightUnit}
              onChange={(e) =>
                setForm({ ...form, weightUnit: e.target.value as WeightUnit })
              }
            >
              <option value="kg">Kilograms (kg)</option>
              <option value="lb">Pounds (lb)</option>
            </select>
          </label>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2>Daily mineral goals</h2>
          <span className="badge-soft">Adult defaults · AU/NZ NRV-ish</span>
        </div>
        <p className="muted small" style={{ marginTop: 0 }}>
          Defaults follow general adult AU/NZ NRV / WHO guidance (sodium ≈ 2000 mg suggested
          target; iron/zinc mid-range). Override any value below. Selenium and iodine are in µg;
          others in mg.
        </p>
        <div className="form-grid">
          {MINERAL_KEYS.map((key) => {
            const meta = MINERAL_META[key]
            return (
              <label key={key}>
                {meta.label} ({meta.unit})
                <input
                  className="input"
                  type="number"
                  step="any"
                  value={goals[key]}
                  onChange={(e) => setMineralGoal(key, Number(e.target.value) || 0)}
                />
              </label>
            )
          })}
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2>Data</h2>
        </div>
        <p className="muted">
          Export or import the full local JSON store (settings, foods, diary, weight, exercise).
          Everything stays on this PC — no accounts, no paywalls.
        </p>
        <div className="row-actions" style={{ marginTop: 12 }}>
          <button type="button" className="btn" onClick={() => void doExport()}>
            Export JSON…
          </button>
          <button type="button" className="btn" onClick={() => void doImport()}>
            Import JSON…
          </button>
          <button type="button" className="btn danger" onClick={() => void doReset()}>
            Reset all data
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2>About</h2>
        </div>
        <p>
          <strong>MyHealth L.W</strong> — Food · Weight · Balance
        </p>
        <p className="muted">
          RevoCon™ · L.W. · Free local desktop tracker
        </p>
      </div>
    </div>
  )
}
