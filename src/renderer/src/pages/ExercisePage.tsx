import type React from 'react'
import { useCallback, useEffect, useState } from 'react'
import type { Exercise } from '../../../shared/types'
import { todayIso } from '../lib/format'

type Props = { onToast: (msg: string) => void }

export default function ExercisePage({ onToast }: Props): React.JSX.Element {
  const [date, setDate] = useState(todayIso())
  const [items, setItems] = useState<Exercise[]>([])
  const [recent, setRecent] = useState<Exercise[]>([])
  const [name, setName] = useState('')
  const [minutes, setMinutes] = useState('')
  const [kcal, setKcal] = useState('')
  const [filterDay, setFilterDay] = useState(true)

  const reload = useCallback(async () => {
    const [dayList, all] = await Promise.all([
      window.api.listExercise(date),
      window.api.listExercise()
    ])
    setItems(dayList)
    setRecent(all.slice(0, 30))
  }, [date])

  useEffect(() => {
    void reload().catch(() => onToast('Failed to load exercise'))
  }, [reload, onToast])

  async function add(): Promise<void> {
    if (!name.trim()) {
      onToast('Name is required')
      return
    }
    await window.api.addExercise({
      date,
      name: name.trim(),
      minutes: minutes ? Number(minutes) : undefined,
      kcal: Number(kcal) || 0
    })
    onToast('Exercise logged')
    setName('')
    setMinutes('')
    setKcal('')
    await reload()
  }

  async function remove(id: string): Promise<void> {
    await window.api.deleteExercise(id)
    onToast('Exercise deleted')
    await reload()
  }

  const list = filterDay ? items : recent
  const dayBurn = items.reduce((s, e) => s + e.kcal, 0)

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
            Name
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Brisk walk"
            />
          </label>
          <label>
            Minutes (optional)
            <input
              className="input"
              type="number"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
            />
          </label>
          <label>
            Calories burned
            <input
              className="input"
              type="number"
              value={kcal}
              onChange={(e) => setKcal(e.target.value)}
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
