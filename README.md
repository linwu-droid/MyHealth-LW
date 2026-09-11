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
- Weight log (kg stored; lb display toggle)
- Exercise log (burns subtract from remaining)
- Settings, export/import, reset
