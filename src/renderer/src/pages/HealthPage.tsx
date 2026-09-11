import type React from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { HealthProfile, HealthRestriction, HealthItemKind } from '../../../shared/types'
import {
  ALLERGEN_PRESETS,
  HEALTH_DISCLAIMER,
  recommendationsForProfile,
  type ExtractCandidate
} from '../../../shared/health'

type Props = { onToast: (msg: string) => void }

function kindLabel(k: HealthItemKind): string {
  switch (k) {
    case 'allergy':
      return 'Allergy'
    case 'intolerance':
      return 'Intolerance'
    case 'restriction':
      return 'Restriction'
    default:
      return 'Other'
  }
}

export default function HealthPage({ onToast }: Props): React.JSX.Element {
  const [profile, setProfile] = useState<HealthProfile | null>(null)
  const [customLabel, setCustomLabel] = useState('')
  const [customKind, setCustomKind] = useState<HealthItemKind>('allergy')
  const [customAliases, setCustomAliases] = useState('')
  const [pasteText, setPasteText] = useState('')
  const [candidates, setCandidates] = useState<ExtractCandidate[]>([])
  const [selectedCand, setSelectedCand] = useState<Set<string>>(new Set())
  const [extracting, setExtracting] = useState(false)
  const [avoidExtra, setAvoidExtra] = useState('')
  const [preferExtra, setPreferExtra] = useState('')
  const [notes, setNotes] = useState('')

  const reload = useCallback(async () => {
    const p = await window.api.getHealthProfile()
    setProfile(p)
    setNotes(p.notes ?? '')
    setAvoidExtra((p.avoidKeywords ?? []).join(', '))
    setPreferExtra((p.preferKeywords ?? []).join(', '))
  }, [])

  useEffect(() => {
    void reload().catch(() => onToast('Failed to load health profile'))
  }, [reload, onToast])

  const activeIds = useMemo(() => {
    const s = new Set<string>()
    if (!profile) return s
    for (const r of profile.restrictions) {
      if (r.enabled !== false) s.add(r.id)
    }
    return s
  }, [profile])

  const recs = useMemo(
    () => (profile ? recommendationsForProfile(profile) : { prefer: [], avoid: [] }),
    [profile]
  )

  async function persist(next: HealthProfile): Promise<void> {
    const saved = await window.api.updateHealthProfile(next)
    setProfile(saved)
  }

  async function togglePreset(presetId: string): Promise<void> {
    if (!profile) return
    const preset = ALLERGEN_PRESETS.find((p) => p.id === presetId)
    if (!preset) return
    const existing = profile.restrictions.find((r) => r.id === presetId)
    let restrictions: HealthRestriction[]
    if (existing) {
      // Toggle enabled; if already enabled, disable; if disabled, enable
      restrictions = profile.restrictions.map((r) =>
        r.id === presetId ? { ...r, enabled: r.enabled === false } : r
      )
    } else {
      restrictions = [
        ...profile.restrictions,
        {
          id: preset.id,
          label: preset.label,
          kind: preset.kind,
          aliases: [...preset.aliases],
          source: 'manual',
          enabled: true
        }
      ]
    }
    await persist({ ...profile, restrictions })
    onToast(existing && existing.enabled !== false ? `Off: ${preset.label}` : `On: ${preset.label}`)
  }

  async function removeRestriction(id: string): Promise<void> {
    if (!profile) return
    await persist({
      ...profile,
      restrictions: profile.restrictions.filter((r) => r.id !== id)
    })
    onToast('Removed from profile')
  }

  async function addCustom(): Promise<void> {
    if (!profile) return
    const label = customLabel.trim()
    if (!label) {
      onToast('Enter a label')
      return
    }
    const id = `custom-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${Date.now().toString(36)}`
    const aliases = customAliases
      .split(/[,;]/)
      .map((a) => a.trim())
      .filter(Boolean)
    const item: HealthRestriction = {
      id,
      label,
      kind: customKind,
      aliases: aliases.length ? aliases : [label.toLowerCase()],
      source: 'manual',
      enabled: true
    }
    await persist({ ...profile, restrictions: [...profile.restrictions, item] })
    setCustomLabel('')
    setCustomAliases('')
    onToast(`Added ${label}`)
  }

  async function saveNotesAndKeywords(): Promise<void> {
    if (!profile) return
    const split = (s: string) =>
      s
        .split(/[,;\n]/)
        .map((x) => x.trim())
        .filter(Boolean)
    await persist({
      ...profile,
      notes: notes.trim(),
      avoidKeywords: split(avoidExtra),
      preferKeywords: split(preferExtra)
    })
    onToast('Notes & keywords saved')
  }

  async function runExtract(text: string, excerpt?: string): Promise<void> {
    const t = text.trim()
    if (!t) {
      onToast('Paste report text or import a file first')
      return
    }
    setExtracting(true)
    try {
      const list = await window.api.extractHealthFromText(t)
      setCandidates(list)
      setSelectedCand(new Set(list.map((c) => c.presetId || c.label)))
      if (excerpt != null && profile) {
        setPasteText(t)
        // Keep excerpt in local paste; merge on confirm
        void excerpt
      }
      if (list.length === 0) onToast('No allergen mentions found — try more text or add manually')
      else onToast(`Found ${list.length} candidate(s) — confirm to merge`)
    } catch {
      onToast('Extraction failed')
    } finally {
      setExtracting(false)
    }
  }

  async function importFile(): Promise<void> {
    setExtracting(true)
    try {
      const res = await window.api.importHealthReportFile()
      if (res.cancelled) return
      if (res.error) {
        onToast(res.error)
        return
      }
      if (res.text) {
        setPasteText(res.text)
        await runExtract(res.text, res.text.slice(0, 2000))
        if (res.note) onToast(res.note)
      }
    } catch {
      onToast('Import failed')
    } finally {
      setExtracting(false)
    }
  }

  async function confirmCandidates(): Promise<void> {
    if (!profile || candidates.length === 0) return
    const chosen = candidates.filter((c) => selectedCand.has(c.presetId || c.label))
    if (chosen.length === 0) {
      onToast('Select at least one candidate')
      return
    }
    const byId = new Map(profile.restrictions.map((r) => [r.id, r]))
    for (const c of chosen) {
      const id =
        c.presetId ||
        `report-${c.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`
      const prev = byId.get(id)
      byId.set(id, {
        id,
        label: c.label,
        kind: c.kind,
        aliases: c.aliases?.length ? c.aliases : [c.label.toLowerCase()],
        source: 'report',
        enabled: true,
        notes: prev?.notes
      })
    }
    const excerpt = pasteText.trim().slice(0, 4000)
    await persist({
      ...profile,
      restrictions: [...byId.values()],
      reportExcerpt: excerpt || profile.reportExcerpt,
      notes: notes || profile.notes
    })
    setCandidates([])
    setSelectedCand(new Set())
    onToast(`Merged ${chosen.length} into health profile`)
  }

  if (!profile) {
    return (
      <div className="panel">
        <p className="muted">Loading…</p>
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <h2>Health</h2>
        <span className="muted small">
          Allergies · intolerances · food to prefer / avoid
          {profile.updatedAt
            ? ` · Updated ${new Date(profile.updatedAt).toLocaleString()}`
            : ''}
        </span>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2>Common allergens & restrictions</h2>
          <span className="badge-soft">Tap to toggle on/off</span>
        </div>
        <div className="health-preset-grid">
          {ALLERGEN_PRESETS.map((p) => {
            const on = activeIds.has(p.id)
            const inProfile = profile.restrictions.some((r) => r.id === p.id)
            return (
              <button
                key={p.id}
                type="button"
                className={`health-preset-chip ${on ? 'on' : inProfile ? 'off' : ''}`}
                onClick={() => void togglePreset(p.id)}
                title={p.aliases.slice(0, 6).join(', ')}
              >
                <span className="health-preset-label">{p.label}</span>
                <span className="health-preset-kind">{kindLabel(p.kind)}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2>Your profile</h2>
        </div>
        {profile.restrictions.length === 0 ? (
          <p className="muted">No items yet — toggle presets above or add a custom entry.</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>On</th>
                  <th>Label</th>
                  <th>Kind</th>
                  <th>Source</th>
                  <th>Aliases</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {profile.restrictions.map((r) => (
                  <tr key={r.id} className={r.enabled === false ? 'health-row-off' : undefined}>
                    <td>
                      <input
                        type="checkbox"
                        checked={r.enabled !== false}
                        onChange={() => {
                          const restrictions = profile.restrictions.map((x) =>
                            x.id === r.id ? { ...x, enabled: x.enabled === false } : x
                          )
                          void persist({ ...profile, restrictions })
                        }}
                      />
                    </td>
                    <td>{r.label}</td>
                    <td>{kindLabel(r.kind)}</td>
                    <td className="muted">{r.source === 'report' ? 'Report' : 'Manual'}</td>
                    <td className="muted small">
                      {(r.aliases ?? []).slice(0, 8).join(', ')}
                      {(r.aliases ?? []).length > 8 ? '…' : ''}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn danger compact"
                        onClick={() => void removeRestriction(r.id)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="form-grid" style={{ marginTop: 16 }}>
          <label>
            Custom label
            <input
              className="input"
              value={customLabel}
              onChange={(e) => setCustomLabel(e.target.value)}
              placeholder="e.g. Kiwi fruit"
            />
          </label>
          <label>
            Kind
            <select
              className="input"
              value={customKind}
              onChange={(e) => setCustomKind(e.target.value as HealthItemKind)}
            >
              <option value="allergy">Allergy</option>
              <option value="intolerance">Intolerance</option>
              <option value="restriction">Restriction</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="full">
            Aliases (comma-separated)
            <input
              className="input"
              value={customAliases}
              onChange={(e) => setCustomAliases(e.target.value)}
              placeholder="kiwi, kiwifruit, chinese gooseberry"
            />
          </label>
          <div className="full">
            <button type="button" className="btn primary" onClick={() => void addCustom()}>
              Add custom
            </button>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2>Import from report</h2>
          <div className="spacer" />
          <button
            type="button"
            className="btn"
            disabled={extracting}
            onClick={() => void importFile()}
          >
            Pick .txt / .pdf
          </button>
        </div>
        <p className="muted small" style={{ marginTop: 0 }}>
          Paste clinic / allergy report text, or import a text PDF / .txt file. Candidates are
          suggested for you to confirm before merging. Scanned image-only PDFs are not OCR’d —
          paste text instead.
        </p>
        <label className="block-label">
          Report text
          <textarea
            className="input health-report-ta"
            rows={8}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="Paste allergy / intolerance report here…"
          />
        </label>
        <div className="row-actions" style={{ marginTop: 8 }}>
          <button
            type="button"
            className="btn primary"
            disabled={extracting}
            onClick={() => void runExtract(pasteText)}
          >
            {extracting ? 'Extracting…' : 'Find allergens'}
          </button>
        </div>

        {candidates.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div className="panel-header">
              <h2>Candidates to confirm</h2>
              <span className="badge-soft">{candidates.length}</span>
            </div>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th />
                    <th>Label</th>
                    <th>Kind</th>
                    <th>Matched</th>
                    <th>Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c) => {
                    const key = c.presetId || c.label
                    return (
                      <tr key={key}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedCand.has(key)}
                            onChange={() => {
                              setSelectedCand((prev) => {
                                const next = new Set(prev)
                                if (next.has(key)) next.delete(key)
                                else next.add(key)
                                return next
                              })
                            }}
                          />
                        </td>
                        <td>{c.label}</td>
                        <td>{kindLabel(c.kind)}</td>
                        <td className="muted small">{c.matchedTerms.join(', ')}</td>
                        <td>
                          <span
                            className={
                              c.confidence === 'high' ? 'badge-soft health-conf-high' : 'badge-soft'
                            }
                          >
                            {c.confidence}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              className="btn primary"
              style={{ marginTop: 8 }}
              onClick={() => void confirmCandidates()}
            >
              Confirm & merge into profile
            </button>
          </div>
        )}
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2>Notes & extra keywords</h2>
          <button type="button" className="btn primary" onClick={() => void saveNotesAndKeywords()}>
            Save
          </button>
        </div>
        <div className="form-grid">
          <label className="full">
            Notes
            <textarea
              className="input"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional clinical or personal notes"
            />
          </label>
          <label className="full">
            Extra avoid keywords (comma-separated)
            <input
              className="input"
              value={avoidExtra}
              onChange={(e) => setAvoidExtra(e.target.value)}
              placeholder="e.g. MSG, aspartame"
            />
          </label>
          <label className="full">
            Extra prefer keywords (comma-separated)
            <input
              className="input"
              value={preferExtra}
              onChange={(e) => setPreferExtra(e.target.value)}
              placeholder="e.g. olive oil, leafy greens"
            />
          </label>
        </div>
        {profile.reportExcerpt ? (
          <details style={{ marginTop: 12 }}>
            <summary className="muted small">Last report excerpt</summary>
            <pre className="health-excerpt">{profile.reportExcerpt}</pre>
          </details>
        ) : null}
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2>Recommendations</h2>
        </div>
        <p className="health-disclaimer">{HEALTH_DISCLAIMER}</p>
        <div className="health-rec-grid">
          <div>
            <h3 className="health-rec-title prefer">Foods to prefer</h3>
            {recs.prefer.length === 0 ? (
              <p className="muted small">Enable restrictions above to see suggestions.</p>
            ) : (
              recs.prefer.map((block) => (
                <div key={block.from} className="health-rec-block">
                  <div className="muted small">{block.from}</div>
                  <ul>
                    {block.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </div>
          <div>
            <h3 className="health-rec-title avoid">Foods to avoid</h3>
            {recs.avoid.length === 0 ? (
              <p className="muted small">Enable restrictions above to see suggestions.</p>
            ) : (
              recs.avoid.map((block) => (
                <div key={block.from} className="health-rec-block">
                  <div className="muted small">{block.from}</div>
                  <ul>
                    {block.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
