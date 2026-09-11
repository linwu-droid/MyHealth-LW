# MyHealth

Food, weight and balance tracker for Windows. Local-only JSON storage. No accounts. No paywalls.

**Author:** L.W. / RevoCon™

## Requirements

- Node.js 20+ (or current LTS)
- Windows 10/11

## Install on another PC (recommended)

1. Download `MyHealth-*-setup.exe` from the [GitHub Releases](https://github.com/linwu-droid/MyHealth-LW/releases) page (or copy the file from `release\` after a local build).
2. Run the setup. Shortcuts named **MyHealth** are created on the Desktop and Start Menu.
3. App data stays on that PC under `%APPDATA%\myhealth\`.

### Data policy

| Situation | Data |
|-----------|------|
| First run on a PC | Fresh local data (seed foods / migrations OK) |
| Reinstall / upgrade on the **same** PC | **Kept** (uninstall does not delete AppData) |
| Copy the installer to a **new** PC | **Wiped** — machine fingerprint mismatch resets AppData |

Data never leaves the PC unless you Export JSON yourself.

## Setup (dev)

```bat
cd C:\Users\Lin\Documents\GitHub\MyHealth
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

## Build Windows installer

```bat
npm run build:win
```

Output: `release\MyHealth-<version>-setup.exe`

Or bump the patch version and build in one step:

```bat
npm run dist
npm run release:win
```

(`dist` / `release:win` run `npm version patch --no-git-tag-version` then `build:win`.)

### Ship an update

1. Bump `version` in `package.json` (or use `npm run dist`).
2. Run `npm run build:win`.
3. Create a **GitHub Release** on `linwu-droid/MyHealth-LW` for that version tag and upload the files from `release\` (at least the `-setup.exe` and the `.yml` / blockmap artifacts electron-builder emits).
4. Installed apps check GitHub on launch (quiet) and via **Settings → Check for updates**.

Without a GitHub Release containing those artifacts, auto-update cannot find a newer build.

NSIS upgrades replace app files and **do not** wipe AppData (`deleteAppDataOnUninstall: false`, same `appId`).

## Stack

- electron-vite + React + TypeScript
- electron-updater (GitHub provider)
- Data file: `%APPDATA%\myhealth\myhealth.json` (migrated once from `%APPDATA%\myhealth-lw\` on the same PC)

## Features

- Home dashboard (calories, macros, weight snapshot)
- Diary by meal with food search / quick custom
- Personal food database (seeded on first run)
- **Online nutrition import** (Open Food Facts) — search live or pull a common-foods pack
- **Shopping list** with portion recommendations vs your macro goals
- Weight log (kg stored; lb display toggle)
- Exercise log (burns subtract from remaining)
- Health profile, Settings, export/import, reset, Check for updates

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
