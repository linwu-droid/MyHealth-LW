import type React from 'react'
import { useCallback, useEffect, useState } from 'react'
import type { Food } from '../../../shared/types'

type Props = { onToast: (msg: string) => void }

const blank = {
  name: '',
  brand: '',
  servingLabel: '1 serving',
  kcal: '',
  protein: '',
  carbs: '',
  fat: ''
}

export default function FoodsPage({ onToast }: Props): React.JSX.Element {
  const [foods, setFoods] = useState<Food[]>([])
  const [query, setQuery] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(blank)
  const [showForm, setShowForm] = useState(false)

  const reload = useCallback(async () => {
    setFoods(await window.api.listFoods(query))
  }, [query])

  useEffect(() => {
    const t = window.setTimeout(() => {
      void reload().catch(() => onToast('Failed to load foods'))
    }, 120)
    return () => window.clearTimeout(t)
  }, [reload, onToast])

  function openCreate(): void {
    setEditingId(null)
    setForm(blank)
    setShowForm(true)
  }

  function openEdit(f: Food): void {
    setEditingId(f.id)
    setForm({
      name: f.name,
      brand: f.brand ?? '',
      servingLabel: f.servingLabel,
      kcal: String(f.kcal),
      protein: String(f.protein),
      carbs: String(f.carbs),
      fat: String(f.fat)
    })
    setShowForm(true)
  }

  async function save(): Promise<void> {
    if (!form.name.trim()) {
      onToast('Name is required')
      return
    }
    const payload = {
      name: form.name.trim(),
      brand: form.brand.trim() || undefined,
      servingLabel: form.servingLabel.trim() || '1 serving',
      kcal: Number(form.kcal) || 0,
      protein: Number(form.protein) || 0,
      carbs: Number(form.carbs) || 0,
      fat: Number(form.fat) || 0
    }
    if (editingId) {
      await window.api.updateFood(editingId, payload)
      onToast('Food updated')
    } else {
      await window.api.createFood(payload)
      onToast('Food added')
    }
    setShowForm(false)
    await reload()
  }

  async function remove(id: string): Promise<void> {
    await window.api.deleteFood(id)
    onToast('Food deleted')
    await reload()
  }

  return (
    <div>
      <div className="page-header">
        <h2>Foods</h2>
        <div className="row-actions">
          <input
            className="input"
            placeholder="Search foods…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="button" className="btn primary" onClick={openCreate}>
            Add food
          </button>
        </div>
      </div>

      {showForm && (
        <div className="panel">
          <div className="panel-header">
            <h2>{editingId ? 'Edit food' : 'New food'}</h2>
            <div className="spacer" />
            <button type="button" className="btn ghost" onClick={() => setShowForm(false)}>
              Cancel
            </button>
          </div>
          <div className="form-grid">
            <label>
              Name
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label>
              Brand (optional)
              <input
                className="input"
                value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
              />
            </label>
            <label>
              Serving label
              <input
                className="input"
                value={form.servingLabel}
                onChange={(e) => setForm({ ...form, servingLabel: e.target.value })}
              />
            </label>
            <label>
              kcal
              <input
                className="input"
                type="number"
                value={form.kcal}
                onChange={(e) => setForm({ ...form, kcal: e.target.value })}
              />
            </label>
            <label>
              Protein g
              <input
                className="input"
                type="number"
                value={form.protein}
                onChange={(e) => setForm({ ...form, protein: e.target.value })}
              />
            </label>
            <label>
              Carbs g
              <input
                className="input"
                type="number"
                value={form.carbs}
                onChange={(e) => setForm({ ...form, carbs: e.target.value })}
              />
            </label>
            <label>
              Fat g
              <input
                className="input"
                type="number"
                value={form.fat}
                onChange={(e) => setForm({ ...form, fat: e.target.value })}
              />
            </label>
            <div className="full">
              <button type="button" className="btn primary" onClick={() => void save()}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="panel">
        <div className="panel-header">
          <h2>Database</h2>
          <span className="muted">{foods.length} foods</span>
        </div>
        {foods.length === 0 ? (
          <div className="empty">
            <h3>No foods found</h3>
            <p>Add a food or clear the search.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Brand</th>
                  <th>Serving</th>
                  <th>kcal</th>
                  <th>P</th>
                  <th>C</th>
                  <th>F</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {foods.map((f) => (
                  <tr key={f.id}>
                    <td>{f.name}</td>
                    <td>{f.brand || '—'}</td>
                    <td>{f.servingLabel}</td>
                    <td>{f.kcal}</td>
                    <td>{f.protein}</td>
                    <td>{f.carbs}</td>
                    <td>{f.fat}</td>
                    <td className="row-actions">
                      <button type="button" className="btn compact" onClick={() => openEdit(f)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn danger compact"
                        onClick={() => void remove(f.id)}
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
