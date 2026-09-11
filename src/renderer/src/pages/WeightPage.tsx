import type React from 'react'
import { useCallback, useEffect, useState } from 'react'
import type { AppSettings, WeightLog } from '../../../shared/types'
import { formatWeight, lbToKg, todayIso } from '../lib/format'

type Props = { onToast: (msg: string) => void }

export default function WeightPage({ onToast }: Props): React.JSX.Element {
  const [logs, setLogs] = useState<WeightLog[]>([])
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [date, setDate] = useState(todayIso())
  const [value, setValue] = useState('')

  const reload = useCallback(async () => {
    const [list, s] = await Promise.all([window.api.listWeight(), window.api.getSettings()])
    setLogs(list)
    setSettings(s)
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

  const latest = logs[0]
  const prev = logs[1]
  const unit = settings?.weightUnit ?? 'kg'
  const delta =
    latest && prev ? latest.kg - prev.kg : null

  return (
    <div>
      <div className="page-header">
        <h2>Weight</h2>
      </div>

      <div className="cards tight">
        <div className="card">
          <div className="label">Latest</div>
          <div className="value">
            {latest ? formatWeight(latest.kg, unit) : '—'}
          </div>
        </div>
        <div className="card">
          <div className="label">Previous</div>
          <div className="value">
            {prev ? formatWeight(prev.kg, unit) : '—'}
          </div>
        </div>
        <div className="card">
          <div className="label">Trend</div>
          <div className={`value ${delta != null && delta > 0 ? 'warn' : delta != null && delta < 0 ? 'good' : ''}`}>
            {delta == null
              ? '—'
              : `${delta >= 0 ? '+' : ''}${delta.toFixed(1)} kg`}
          </div>
        </div>
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
