import { app, shell, BrowserWindow, ipcMain, Menu } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import {
  addDiary,
  addExercise,
  addWeight,
  createFood,
  deleteDiary,
  deleteExercise,
  deleteFood,
  deleteWeight,
  exportDataToFile,
  getDashboard,
  getSettings,
  importDataFromFile,
  listDiary,
  listExercise,
  listFoods,
  listWeight,
  resetData,
  updateDiary,
  updateFood,
  updateSettings
} from './store'
import type {
  AppSettings,
  DiaryEntry,
  Exercise,
  Food
} from '../shared/types'

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    title: 'MyHealth L.W',
    backgroundColor: '#f5f0e6',
    icon: join(__dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

function registerIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('dashboard:get', (_e, date: string) => getDashboard(date))

  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:update', (_e, patch: Partial<AppSettings>) => updateSettings(patch))

  ipcMain.handle('foods:list', (_e, query?: string) => listFoods(query))
  ipcMain.handle('foods:create', (_e, input: Omit<Food, 'id'>) => createFood(input))
  ipcMain.handle('foods:update', (_e, id: string, patch: Partial<Omit<Food, 'id'>>) =>
    updateFood(id, patch)
  )
  ipcMain.handle('foods:delete', (_e, id: string) => deleteFood(id))

  ipcMain.handle('diary:list', (_e, date?: string) => listDiary(date))
  ipcMain.handle('diary:add', (_e, input: Omit<DiaryEntry, 'id'>) => addDiary(input))
  ipcMain.handle(
    'diary:update',
    (_e, id: string, patch: Partial<Omit<DiaryEntry, 'id'>>) => updateDiary(id, patch)
  )
  ipcMain.handle('diary:delete', (_e, id: string) => deleteDiary(id))

  ipcMain.handle('weight:list', () => listWeight())
  ipcMain.handle('weight:add', (_e, input: { date: string; kg: number }) => addWeight(input))
  ipcMain.handle('weight:delete', (_e, id: string) => deleteWeight(id))

  ipcMain.handle('exercise:list', (_e, date?: string) => listExercise(date))
  ipcMain.handle('exercise:add', (_e, input: Omit<Exercise, 'id'>) => addExercise(input))
  ipcMain.handle('exercise:delete', (_e, id: string) => deleteExercise(id))

  ipcMain.handle('data:export', () => exportDataToFile(getWindow()))
  ipcMain.handle('data:import', () => importDataFromFile(getWindow()))
  ipcMain.handle('data:reset', () => resetData())
}

app.commandLine.appendSwitch('disable-gpu-shader-disk-cache')

const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  console.error(
    'MyHealth L.W is already running. Close the other window and try again.'
  )
  app.quit()
} else {
  app.on('second-instance', () => {
    const wins = BrowserWindow.getAllWindows()
    if (wins.length) {
      const w = wins[0]
      if (w.isMinimized()) w.restore()
      w.focus()
    }
  })

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.myhealthlw.app')

    app.on('browser-window-created', (_event, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    Menu.setApplicationMenu(null)

    let mainWindow: BrowserWindow | null = null
    mainWindow = createWindow()
    registerIpc(() => mainWindow)

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createWindow()
      }
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
