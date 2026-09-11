import { BrowserWindow, dialog } from 'electron'
import { writeFileSync } from 'fs'

/** Save a PNG data URL from the renderer via a save dialog. */
export async function savePngDataUrl(
  win: BrowserWindow | null,
  dataUrl: string,
  defaultName = 'MyHealth-Plate.png'
): Promise<{ cancelled?: boolean; path?: string; error?: string }> {
  try {
    const m = /^data:image\/png;base64,(.+)$/i.exec(dataUrl)
    if (!m) return { error: 'Invalid PNG data URL' }
    const res = await dialog.showSaveDialog(win ?? undefined!, {
      title: 'Save plate image',
      defaultPath: defaultName,
      filters: [{ name: 'PNG image', extensions: ['png'] }]
    })
    if (res.canceled || !res.filePath) return { cancelled: true }
    writeFileSync(res.filePath, Buffer.from(m[1], 'base64'))
    return { path: res.filePath }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Save failed' }
  }
}