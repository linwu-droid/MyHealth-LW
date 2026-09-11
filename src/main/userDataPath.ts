import { app } from 'electron'
import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, statSync } from 'fs'
import { join } from 'path'

const NEW_FOLDER = 'myhealth'
const OLD_FOLDER = 'myhealth-lw'
const NEW_STORE = 'myhealth.json'
const OLD_STORE = 'myhealth-lw.json'

/**
 * Prefer %APPDATA%\myhealth. On same PC, copy JSON from myhealth-lw once so data survives rename.
 * Must run before any app.getPath('userData') consumers / before ready is fine as long as before store load.
 */
export function migrateAndSetUserDataPath(): void {
  const appData = app.getPath('appData')
  const newDir = join(appData, NEW_FOLDER)
  const oldDir = join(appData, OLD_FOLDER)

  if (!existsSync(newDir)) mkdirSync(newDir, { recursive: true })

  if (existsSync(oldDir)) {
    try {
      for (const name of readdirSync(oldDir)) {
        const src = join(oldDir, name)
        const dest = join(newDir, name === OLD_STORE ? NEW_STORE : name)
        try {
          if (!statSync(src).isFile()) continue
          if (!name.endsWith('.json')) continue
          if (existsSync(dest)) continue
          copyFileSync(src, dest)
          console.log(`[userData] migrated ${name} -> ${dest}`)
        } catch (err) {
          console.error('[userData] migrate file failed', name, err)
        }
      }
    } catch (err) {
      console.error('[userData] migrate folder failed', err)
    }
  }

  // If new dir only has old filename, rename in place
  const newStorePath = join(newDir, NEW_STORE)
  const legacyInNew = join(newDir, OLD_STORE)
  if (!existsSync(newStorePath) && existsSync(legacyInNew)) {
    try {
      renameSync(legacyInNew, newStorePath)
    } catch {
      try {
        copyFileSync(legacyInNew, newStorePath)
      } catch {
        /* ignore */
      }
    }
  }

  app.setPath('userData', newDir)
}

export { NEW_STORE, OLD_STORE }
