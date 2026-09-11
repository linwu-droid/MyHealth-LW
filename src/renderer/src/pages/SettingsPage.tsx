import type React from 'react'
import { useEffect, useState } from 'react'
import type { AppSettings, MineralKey, WeightUnit } from '../../../shared/types'
import type { SexOption } from '../../../shared/weight'
import { MINERAL_KEYS, MINERAL_META, defaultMineralGoals } from '../../../shared/minerals'
import { kgToLb, lbToKg, round1 } from '../lib/format'
import { formatMlExact } from '../../../shared/water'

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
  const [recommendedWater, setRecommendedWater] = useState(2000)
  const [appVersion, setAppVersion] = useState('')
  const [updateMsg, setUpdateMsg] = useState('')
  const [updateBusy, setUpdateBusy] = useState(false)

  useEffect(() => {
    void window.api
      .getSettings()
      .then((s) => setForm(ensureMineralGoals(s)))
      .catch(() => onToast('Failed to load settings'))
    void window.api
      .getRecommendedWaterMl()
      .then(setRecommendedWater)
      .catch(() => {
        /* non-fatal */
      })
    void window.api
      .getAppVersion()
      .then(setAppVersion)
      .catch(() => setAppVersion(''))
  }, [onToast])

  async function save(): Promise<void> {
    if (!form) return
    const heightCm = form.heightCm != null && form.heightCm > 0 ? form.heightCm : undefined
    const weightGoalKg =
      form.weightGoalKg != null && form.weightGoalKg > 0 ? form.weightGoalKg : undefined
    const weightStartKg =
      form.weightStartKg != null && form.weightStartKg > 0 ? form.weightStartKg : undefined
    const sex: SexOption =
      form.sex === 'female' || form.sex === 'male' || form.sex === 'other' ? form.sex : ''
    const waterGoalMl =
      form.waterGoalMl != null && form.waterGoalMl > 0 ? Math.round(form.waterGoalMl) : undefined
    const next = await window.api.updateSettings(
      ensureMineralGoals({ ...form, heightCm, weightGoalKg, weightStartKg, sex, waterGoalMl })
    )
    setForm(ensureMineralGoals(next))
    try {
      setRecommendedWater(await window.api.getRecommendedWaterMl())
    } catch {
      /* ignore */
    }
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

  async function doCheckUpdates(): Promise<void> {
    setUpdateBusy(true)
    setUpdateMsg('Checking...')
    try {
      const res = await window.api.checkForUpdates()
      setUpdateMsg(res.message || (res.ok ? 'Checked.' : 'Update check failed.'))
      onToast(res.message || 'Update check finished')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setUpdateMsg(msg)
      onToast(`Update check failed: ${msg}`)
    } finally {
      setUpdateBusy(false)
    }
  }

  async function doReset(): Promise<void> {
    const ok = window.confirm(
      'Reset all MyHealth data? This restores default settings and the seed food list. Diary, water, weight and exercise logs will be cleared.'
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
        <p className="muted">Loadingâ€¦</p>
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
          <label>
            Height (cm)
            <input
              className="input"
              type="number"
              step="0.1"
              value={form.heightCm ?? ''}
              onChange={(e) => {
                const n = Number(e.target.value)
                setForm({
                  ...form,
                  heightCm: e.target.value === '' || !(n > 0) ? undefined : n
                })
              }}
              placeholder="e.g. 170"
            />
          </label>
          <label>
            Sex
            <select
              className="input"
              value={form.sex ?? ''}
              onChange={(e) =>
                setForm({ ...form, sex: e.target.value as SexOption })
              }
            >
              <option value="">Prefer not to say</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>
            Goal weight ({form.weightUnit})
            <input
              className="input"
              type="number"
              step="0.1"
              value={
                form.weightGoalKg != null && form.weightGoalKg > 0
                  ? form.weightUnit === 'lb'
                    ? round1(kgToLb(form.weightGoalKg))
                    : round1(form.weightGoalKg)
                  : ''
              }
              onChange={(e) => {
                const n = Number(e.target.value)
                if (e.target.value === '' || !(n > 0)) {
                  setForm({ ...form, weightGoalKg: undefined })
                  return
                }
                setForm({
                  ...form,
                  weightGoalKg: form.weightUnit === 'lb' ? lbToKg(n) : n
                })
              }}
              placeholder={form.weightUnit === 'kg' ? 'e.g. 70' : 'e.g. 154'}
            />
          </label>
          <label>
            Starting weight ({form.weightUnit})
            <input
              className="input"
              type="number"
              step="0.1"
              value={
                form.weightStartKg != null && form.weightStartKg > 0
                  ? form.weightUnit === 'lb'
                    ? round1(kgToLb(form.weightStartKg))
                    : round1(form.weightStartKg)
                  : ''
              }
              onChange={(e) => {
                const n = Number(e.target.value)
                if (e.target.value === '' || !(n > 0)) {
                  setForm({ ...form, weightStartKg: undefined })
                  return
                }
                setForm({
                  ...form,
                  weightStartKg: form.weightUnit === 'lb' ? lbToKg(n) : n
                })
              }}
              placeholder="Optional"
            />
          </label>
          <label>
            Water goal (ml)
            <input
              className="input"
              type="number"
              min={500}
              step={50}
              value={form.waterGoalMl ?? ''}
              onChange={(e) => {
                const n = Number(e.target.value)
                setForm({
                  ...form,
                  waterGoalMl: e.target.value === '' || !(n > 0) ? undefined : Math.round(n)
                })
              }}
              placeholder={'e.g. ' + recommendedWater}
            />
          </label>
          <div className="full row-actions" style={{ alignItems: 'center' }}>
            <span className="muted small">
              Recommended ~{formatMlExact(recommendedWater)}/day (weight Ã— 35, or 2000 ml)
            </span>
            <button
              type="button"
              className="btn"
              onClick={() => setForm({ ...form, waterGoalMl: recommendedWater })}
            >
              Use recommended
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => setForm({ ...form, waterGoalMl: undefined })}
            >
              Clear (auto)
            </button>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2>Daily mineral goals</h2>
          <span className="badge-soft">Adult defaults Â· AU/NZ NRV-ish</span>
        </div>
        <p className="muted small" style={{ marginTop: 0 }}>
          Defaults follow general adult AU/NZ NRV / WHO guidance (sodium â‰ˆ 2000 mg suggested
          target; iron/zinc mid-range). Override any value below. Selenium and iodine are in Âµg;
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
          Export or import the full local JSON store (settings, foods, diary, water, weight, exercise).
          Everything stays on this PC â€” no accounts, no paywalls.
        </p>
        <div className="row-actions" style={{ marginTop: 12 }}>
          <button type="button" className="btn" onClick={() => void doExport()}>
            Export JSONâ€¦
          </button>
          <button type="button" className="btn" onClick={() => void doImport()}>
            Import JSONâ€¦
          </button>
          <button type="button" className="btn danger" onClick={() => void doReset()}>
            Reset all data
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2>Updates</h2>
          {appVersion ? <span className="badge-soft">v{appVersion}</span> : null}
        </div>
        <p className="muted">
          Installed builds can check GitHub for a newer MyHealth release. Dev mode does not
          auto-update. Publishing a GitHub Release with the setup.exe is required for updates to
          appear.
        </p>
        <div className="row-actions" style={{ marginTop: 12 }}>
          <button
            type="button"
            className="btn"
            disabled={updateBusy}
            onClick={() => void doCheckUpdates()}
          >
            {updateBusy ? 'Checking...' : 'Check for updates'}
          </button>
        </div>
        {updateMsg ? (
          <p className="muted small" style={{ marginTop: 10 }}>
            {updateMsg}
          </p>
        ) : null}
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2>About</h2>
        </div>
        <p>
          <strong>MyHealth</strong> â€” Food Â· Weight Â· Balance
        </p>
        <p className="muted">
          RevoConâ„¢ Â· L.W. Â· Free local desktop tracker
        </p>
      </div>
    </div>
  )
}
