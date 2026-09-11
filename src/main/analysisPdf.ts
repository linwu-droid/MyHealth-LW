import { BrowserWindow, dialog } from 'electron'
import { writeFileSync } from 'fs'
import { getNutritionAnalysis, getSettings, getWaterGoalMl, listWater } from './store'
import { MINERAL_KEYS, MINERAL_META } from '../shared/minerals'
import { formatMlExact } from '../shared/water'
import type { NutritionAnalysis } from '../shared/types'

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function fmt(n: number, unit = ''): string {
  const v =
    Math.abs(n) < 10 && unit !== 'kcal'
      ? Math.round(n * 10) / 10
      : Math.round(n)
  return unit ? `${v} ${unit}` : String(v)
}

function vsLine(label: string, actual: number, goal: number, unit: string, pct: number): string {
  return `<tr><td>${esc(label)}</td><td>${fmt(actual, unit)}</td><td>${fmt(goal, unit)}</td><td>${Math.round(pct)}%</td></tr>`
}

function buildAnalysisHtml(
  a: NutritionAnalysis,
  displayName: string,
  water?: { actualMl: number; goalMl: number; daysLogged: number }
): string {
  const range =
    a.days === 1
      ? a.date
      : `${a.rangeStart} → ${a.rangeEnd} (${a.days} days, ${a.daysWithEntries} logged)`
  const who = displayName.trim() ? esc(displayName.trim()) : 'MyHealth L.W user'
  const mealRows = a.mealBreakdown
    ? (['breakfast', 'lunch', 'dinner', 'snacks'] as const)
        .map((k) => {
          const m = a.mealBreakdown![k]
          const label = k.charAt(0).toUpperCase() + k.slice(1)
          return `<tr><td>${label}</td><td>${fmt(m.kcal, 'kcal')}</td><td>${fmt(m.protein, 'g')}</td><td>${fmt(m.carbs, 'g')}</td><td>${fmt(m.fat, 'g')}</td></tr>`
        })
        .join('')
    : ''

  const mineralRows = MINERAL_KEYS.map((key) => {
    const vs = a.vsMineralGoals[key]
    if (!vs) return ''
    const meta = MINERAL_META[key]
    return vsLine(`${meta.label} (${meta.short})`, vs.actual, vs.goal, meta.unit, vs.pctOfGoal)
  }).join('')

  const tipItems = a.insights.map((t) => `<li><strong>${esc(t.severity)}</strong> — ${esc(t.message)}</li>`).join('')
  const notes = a.notes.map((n) => `<p class="note">${esc(n)}</p>`).join('')
  const topFoods = a.topFoods
    .map(
      (f) =>
        `<tr><td>${esc(f.name)}</td><td>${fmt(f.kcal, 'kcal')}</td><td>${f.pctOfTotal}%</td><td>${f.entries}</td></tr>`
    )
    .join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>MyHealth L.W Analysis</title>
<style>
  @page { margin: 18mm 16mm; }
  body {
    font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
    color: #2c3228;
    background: #f5f0e6;
    font-size: 11pt;
    line-height: 1.45;
    margin: 0;
    padding: 12px 8px;
  }
  h1 { font-size: 20pt; color: #2f6f4e; margin: 0 0 4px; }
  h2 { font-size: 13pt; color: #3d5a45; margin: 18px 0 8px; border-bottom: 1px solid #c9d4c4; padding-bottom: 4px; }
  .sub { color: #5f6b5a; font-size: 10pt; margin: 0 0 12px; }
  .brand { color: #6b7a62; font-size: 9pt; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; margin: 6px 0 10px; }
  th, td { text-align: left; padding: 5px 8px; border-bottom: 1px solid #ddd8cc; }
  th { background: #e8efe4; color: #2f6f4e; font-weight: 600; font-size: 10pt; }
  ul { margin: 6px 0 10px 18px; padding: 0; }
  li { margin-bottom: 4px; }
  .note { color: #5f6b5a; font-size: 9.5pt; margin: 4px 0; }
  .cards { display: flex; gap: 10px; flex-wrap: wrap; margin: 8px 0 12px; }
  .card {
    background: #fffdf8;
    border: 1px solid #d8d2c4;
    border-radius: 8px;
    padding: 10px 14px;
    min-width: 110px;
  }
  .card .label { font-size: 9pt; color: #6b7a62; }
  .card .value { font-size: 16pt; font-weight: 650; color: #2f6f4e; }
  .footer { margin-top: 24px; font-size: 8.5pt; color: #7a8674; }
</style>
</head>
<body>
  <h1>MyHealth L.W</h1>
  <div class="brand">RevoCon · L.W. · Nutrition analysis report</div>
  <p class="sub">Prepared for ${who} · Range: ${esc(range)} · Generated ${esc(new Date().toISOString().slice(0, 10))}</p>

  <h2>Summary</h2>
  <div class="cards">
    <div class="card"><div class="label">Calories${a.days > 1 ? ' (avg/day)' : ''}</div><div class="value">${fmt(a.vsGoals.kcal.actual)}</div></div>
    <div class="card"><div class="label">Protein</div><div class="value">${fmt(a.vsGoals.protein.actual, 'g')}</div></div>
    <div class="card"><div class="label">Carbohydrate</div><div class="value">${fmt(a.vsGoals.carbs.actual, 'g')}</div></div>
    <div class="card"><div class="label">Fat</div><div class="value">${fmt(a.vsGoals.fat.actual, 'g')}</div></div>
  </div>
  <p class="sub">Period totals: ${fmt(a.totals.kcal, 'kcal')} · Protein ${fmt(a.totals.protein, 'g')} · Carbohydrate ${fmt(a.totals.carbs, 'g')} · Fat ${fmt(a.totals.fat, 'g')} · ${a.entryCount} entries</p>

  <h2>Vs goals</h2>
  <table>
    <thead><tr><th>Nutrient</th><th>Actual</th><th>Goal</th><th>% of goal</th></tr></thead>
    <tbody>
      ${vsLine('Calories', a.vsGoals.kcal.actual, a.vsGoals.kcal.goal, 'kcal', a.vsGoals.kcal.pctOfGoal)}
      ${vsLine('Protein', a.vsGoals.protein.actual, a.vsGoals.protein.goal, 'g', a.vsGoals.protein.pctOfGoal)}
      ${vsLine('Carbohydrate', a.vsGoals.carbs.actual, a.vsGoals.carbs.goal, 'g', a.vsGoals.carbs.pctOfGoal)}
      ${vsLine('Fat', a.vsGoals.fat.actual, a.vsGoals.fat.goal, 'g', a.vsGoals.fat.pctOfGoal)}
    </tbody>
  </table>

  <h2>Macro balance</h2>
  <p>Protein ${a.macroBalance.proteinPct}% · Carbohydrate ${a.macroBalance.carbsPct}% · Fat ${a.macroBalance.fatPct}% of kcal</p>

  ${
    water
      ? `<h2>Water</h2>
  <p>${formatMlExact(water.actualMl)} ${a.days > 1 ? 'avg/day' : 'today'} · Goal ${formatMlExact(water.goalMl)} · ${water.daysLogged}/${a.days} days logged · ${water.goalMl > 0 ? Math.round((water.actualMl / water.goalMl) * 100) : 0}% of goal</p>`
      : ''
  }

  <h2>Minerals</h2>
  <p class="sub">Coverage ${a.mineralCoverage.entriesWithData}/${a.mineralCoverage.entryCount} (${Math.round(a.mineralCoverage.pct)}%)</p>
  <table>
    <thead><tr><th>Mineral</th><th>Actual</th><th>Goal</th><th>% of goal</th></tr></thead>
    <tbody>${mineralRows}</tbody>
  </table>

  ${
    mealRows
      ? `<h2>Meal breakdown</h2>
  <table>
    <thead><tr><th>Meal</th><th>kcal</th><th>Protein</th><th>Carbohydrate</th><th>Fat</th></tr></thead>
    <tbody>${mealRows}</tbody>
  </table>`
      : ''
  }

  <h2>Tips</h2>
  <ul>${tipItems || '<li>No insights for this range.</li>'}</ul>
  ${notes}

  ${
    topFoods
      ? `<h2>Top foods by calories</h2>
  <table>
    <thead><tr><th>Food</th><th>kcal</th><th>% of total</th><th>Entries</th></tr></thead>
    <tbody>${topFoods}</tbody>
  </table>`
      : ''
  }

  <div class="footer">MyHealth L.W · RevoCon · L.W. · Local report — not medical advice.</div>
</body>
</html>`
}

/**
 * Build an analysis PDF for the selected day window via Electron printToPDF.
 * Opens a save dialog; default name MyHealth-Analysis-YYYY-MM-DD.pdf.
 */
export async function exportAnalysisPdf(
  win: BrowserWindow | null,
  days: number
): Promise<{ cancelled?: boolean; path?: string; error?: string }> {
  try {
    const safeDays = [1, 7, 14, 30].includes(days) ? days : 1
    const date = new Date().toISOString().slice(0, 10)
    const analysis = getNutritionAnalysis(date, safeDays)
    const settings = getSettings()
    const end = date
    const endDate = new Date(end + 'T12:00:00')
    const startDate = new Date(endDate)
    startDate.setDate(startDate.getDate() - (safeDays - 1))
    const start = startDate.toISOString().slice(0, 10)
    const logs = listWater().filter((w) => w.date >= start && w.date <= end)
    const byDay = new Map<string, number>()
    for (const w of logs) byDay.set(w.date, (byDay.get(w.date) ?? 0) + w.ml)
    const sum = [...byDay.values()].reduce((a, b) => a + b, 0)
    const waterActual = safeDays === 1 ? sum : Math.round(sum / safeDays)
    const water = {
      actualMl: waterActual,
      goalMl: getWaterGoalMl(),
      daysLogged: byDay.size
    }
    const html = buildAnalysisHtml(analysis, settings.displayName ?? '', water)

    const res = await dialog.showSaveDialog(win ?? undefined!, {
      title: 'Export nutrition analysis PDF',
      defaultPath: `MyHealth-Analysis-${date}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (res.canceled || !res.filePath) return { cancelled: true }

    const pdfWin = new BrowserWindow({
      show: false,
      width: 800,
      height: 1100,
      webPreferences: {
        sandbox: true,
        contextIsolation: true
      }
    })

    try {
      await pdfWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
      // Brief settle so layout paints before print
      await new Promise((r) => setTimeout(r, 250))
      const pdf = await pdfWin.webContents.printToPDF({
        printBackground: true,
        pageSize: 'A4',
        margins: { marginType: 'default' }
      })
      writeFileSync(res.filePath, pdf)
      return { path: res.filePath }
    } finally {
      if (!pdfWin.isDestroyed()) pdfWin.destroy()
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'PDF export failed' }
  }
}
