# MyHealth L.W

Food, weight and balance tracker for Windows. Local-only JSON storage. No accounts. No paywalls.

**Author:** L.W. / RevoCon™

## Requirements

- Node.js 20+ (or current LTS)
- Windows 10/11

## Setup

```bat
cd C:\Users\Lin\Documents\GitHub\MyHealth-LW
npm install
```

## Run (dev)

Double-click `run-dev.cmd`, or:

```bat
npm run dev
```

## Typecheck

```bat
npm run typecheck
```

## Build installer

```bat
npm run build:win
```

Output goes to `release\`. Window/installer icons use `build\icon.png` (ICO optional; PNG works with electron-builder).

## Stack

- electron-vite + React + TypeScript
- Data file: `%APPDATA%\myhealth-lw\myhealth-lw.json` (Electron `userData`)

## Features

- Home dashboard (calories, macros, weight snapshot)
- Diary by meal with food search / quick custom
- Personal food database (seeded on first run)
- **Online nutrition import** (Open Food Facts) — search live or pull a common-foods pack
- **Shopping list** with portion recommendations vs your macro goals
- Weight log (kg stored; lb display toggle)
- Exercise log (burns subtract from remaining)
- Settings, export/import, reset

## Online nutrition import

On the **Foods** page, open the **Import online** tab:

1. **Search** — type a food name and click Search. Results come from [Open Food Facts](https://world.openfoodfacts.org) via the main process (no renderer CORS, no API key). Pick rows with checkboxes, then **Import selected** or **Import all results**.
2. **Import common foods pack** — fetches roughly 200–350 everyday items through many small OFF searches, then inserts them into your local Foods database. Duplicates (same name + brand, case-insensitive) are skipped.

Nutrition prefers per-serving values when present; otherwise per 100 g (serving label set to `100 g`). Products without usable kcal are omitted.

Data courtesy of Open Food Facts contributors — free collaborative database under ODbL. This app does not dump the full OFF corpus; only search results and the curated common pack are imported on demand.

## Shopping list & portion recommendations

Sidebar **Shopping**:

- Add items (name, optional qty/unit) and optionally link to a Food from your database
- Paste multi-add (one item per line), check off, delete, clear checked
- **Recommend portions** — pick days (default 7). Matches list items to Foods (fuzzy / foodId); unmatched items get a best-effort Open Food Facts lookup. A simple kcal split (biased toward higher protein density) suggests servings/day so macros approach your Settings goals
- Panel shows item → recommended portion, daily/period totals vs goals
- **Copy portions** or **Add today's recommended portions to Diary** (matched + linked Foods only)