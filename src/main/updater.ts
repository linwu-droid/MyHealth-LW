import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'

export type UpdateCheckResult = {
  ok: boolean
  reason?: string
  version?: string
  updateAvailable?: boolean
  message?: string
}

let checking = false

export function setupAutoUpdater(getWindow: () => BrowserWindow | null): void {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('error', (err) => {
    console.error('[updater]', err?.message || err)
  })

  autoUpdater.on('update-available', (info) => {
    console.log('[updater] update available', info.version)
  })

  autoUpdater.on('update-downloaded', (info) => {
    const win = getWindow()
    const ver = info.version || 'new'
    const opts = {
      type: 'info' as const,
        title: 'MyHealth update ready',
        message: `Version ${ver} has been downloaded.`,
        detail: 'Restart MyHealth to install the update. Your data on this PC is kept.',
        buttons: ['Restart now', 'Later'],
        defaultId: 0,
        cancelId: 1
    }
    const p = win ? dialog.showMessageBox(win, opts) : dialog.showMessageBox(opts)
    void p
      .then((res) => {
        if (res.response === 0) autoUpdater.quitAndInstall()
      })
      .catch(() => {
        /* ignore */
      })
  })

  ipcMain.handle('updater:check', async (): Promise<UpdateCheckResult> => {
    if (!app.isPackaged) {
      return {
        ok: false,
        reason: 'dev',
        message: 'Updates are only available in installed (packaged) builds.'
      }
    }
    if (checking) {
      return { ok: true, message: 'Update check already in progress…' }
    }
    checking = true
    try {
      const result = await autoUpdater.checkForUpdates()
      const updateAvailable = Boolean(result?.updateInfo?.version && result.updateInfo.version !== app.getVersion())
      return {
        ok: true,
        version: result?.updateInfo?.version,
        updateAvailable,
        message: updateAvailable
          ? `Update ${result?.updateInfo?.version} found — downloading…`
          : `You are on the latest version (${app.getVersion()}).`
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return {
        ok: false,
        reason: 'error',
        message: `Update check failed: ${message}. Publish a GitHub Release with the setup artifacts for auto-update.`
      }
    } finally {
      checking = false
    }
  })

  ipcMain.handle('updater:getVersion', () => app.getVersion())

  // Quiet check on launch for packaged builds only
  if (app.isPackaged) {
    setTimeout(() => {
      autoUpdater.checkForUpdatesAndNotify().catch((err) => {
        console.error('[updater] quiet check failed', err?.message || err)
      })
    }, 4000)
  }
}
