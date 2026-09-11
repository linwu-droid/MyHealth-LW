import { app, shell, BrowserWindow, ipcMain, Menu } from 'electron'
import { migrateAndSetUserDataPath } from './userDataPath'
import { setupAutoUpdater } from './updater'

// Bind AppData folder before anything reads userData (same-PC migrate myhealth-lw -> myhealth).
migrateAndSetUserDataPath()
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import {
  addDiary,
  addExercise,
  addShopping,
  addShoppingMany,
  addWeight,
  applyPortionsToDiary,
  clearCheckedShopping,
  createFood,
  createFoodsBulk,
  deleteDiary,
  deleteExercise,
  deleteFood,
  deleteShopping,
  deleteWeight,
  exportDataToFile,
  getDashboard,
  getNutritionAnalysis,
  getPortionPlan,
  getSettings,
  importDataFromFile,
  listDiary,
  listExercise,
  listFoods,
  listShopping,
  listWeight,
  listWater,
  addWater,
  deleteWater,
  getWaterTotal,
  getWaterGoalMl,
  getRecommendedWaterMl,
  resetData,
  updateDiary,
  updateFood,
  updateSettings,
  updateShopping,
  getHealthProfile,
  updateHealthProfile,
  extractHealthFromText,
  importHealthReportFile
} from './store'
import {
  fetchCommonFoodsPack,
  fetchDrinksPack,
  fetchFoodImageUrl,
  fetchHomemadeFoodsPack,
  fetchSupermarketFoodsPack,
  searchOpenFoodFacts,
  toFoodInput
} from './nutritionOnline'
import { exportAnalysisPdf } from './analysisPdf'
import { savePngDataUrl } from './savePng'
import type { NutritionRef } from './portions'
import type {
  AppSettings,
  DiaryEntry,
  Exercise,
  Food,
  MealType,
  PortionPlan,
  ShoppingListItem,
  HealthProfile
} from '../shared/types'

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    title: 'MyHealth',
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

  ipcMain.handle(
    'nutrition:analyze',
    (_e, opts: { date?: string; days?: number } = {}) =>
      getNutritionAnalysis(opts?.date ?? new Date().toISOString().slice(0, 10), opts?.days ?? 1)
  )

  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:update', (_e, patch: Partial<AppSettings>) => updateSettings(patch))

  ipcMain.handle('foods:list', (_e, query?: string) => listFoods(query))
  ipcMain.handle('foods:create', (_e, input: Omit<Food, 'id'>) => createFood(input))
  ipcMain.handle('foods:update', (_e, id: string, patch: Partial<Omit<Food, 'id'>>) =>
    updateFood(id, patch)
  )
  ipcMain.handle('foods:delete', (_e, id: string) => deleteFood(id))

  ipcMain.handle('nutrition:search', async (_e, query: string) => searchOpenFoodFacts(query))
  ipcMain.handle('nutrition:foodImage', async (_e, name: string) => {
    try {
      return await fetchFoodImageUrl(typeof name === 'string' ? name : '')
    } catch {
      return null
    }
  })
  ipcMain.handle('nutrition:importMany', (_e, foods: Omit<Food, 'id'>[]) =>
    createFoodsBulk(Array.isArray(foods) ? foods : [])
  )
  ipcMain.handle('nutrition:importCommonPack', async () => {
    const pack = await fetchCommonFoodsPack()
    const result = createFoodsBulk(pack.map(toFoodInput))
    return { ...result, fetched: pack.length }
  })

  ipcMain.handle('nutrition:importDrinksPack', async () => {
    const pack = await fetchDrinksPack()
    const result = createFoodsBulk(pack.map(toFoodInput))
    return { ...result, fetched: pack.length }
  })

  ipcMain.handle('nutrition:importHomemadePack', async () => {
    const pack = await fetchHomemadeFoodsPack()
    const result = createFoodsBulk(pack.map(toFoodInput))
    return { ...result, fetched: pack.length }
  })

  ipcMain.handle('nutrition:importSupermarketPack', async () => {
    const pack = await fetchSupermarketFoodsPack()
    const result = createFoodsBulk(pack.map(toFoodInput))
    return { ...result, fetched: pack.length }
  })

  ipcMain.handle('shopping:list', () => listShopping())
  ipcMain.handle(
    'shopping:add',
    (
      _e,
      input: { name: string; quantity?: number; unit?: string; notes?: string; foodId?: string }
    ) => addShopping(input)
  )
  ipcMain.handle('shopping:addMany', (_e, lines: string[]) =>
    addShoppingMany(Array.isArray(lines) ? lines : [])
  )
  ipcMain.handle(
    'shopping:update',
    (_e, id: string, patch: Partial<Omit<ShoppingListItem, 'id' | 'createdAt'>>) =>
      updateShopping(id, patch)
  )
  ipcMain.handle('shopping:delete', (_e, id: string) => deleteShopping(id))
  ipcMain.handle('shopping:clearChecked', () => clearCheckedShopping())

  ipcMain.handle('shopping:recommend', async (_e, days: number) => {
    const items = listShopping().filter((i) => !i.checked)
    const foods = listFoods()
    const offline = new Map<string, NutritionRef>()
    // Quick OFF lookup for unmatched names (best-effort; ignore failures)
    for (const item of items) {
      const hasLocal =
        (item.foodId && foods.some((f) => f.id === item.foodId)) ||
        foods.some(
          (f) =>
            f.name.toLowerCase().includes(item.name.toLowerCase()) ||
            item.name.toLowerCase().includes(f.name.toLowerCase())
        )
      if (hasLocal) continue
      try {
        const hits = await searchOpenFoodFacts(item.name, 5)
        const hit = hits[0]
        if (!hit) continue
        offline.set(item.id, {
          name: hit.name,
          servingLabel: hit.servingLabel,
          kcal: hit.kcal,
          protein: hit.protein,
          carbs: hit.carbs,
          fat: hit.fat
        })
      } catch {
        // offline / OFF down — leave unmatched
      }
    }
    return getPortionPlan(days, offline)
  })

  ipcMain.handle(
    'shopping:applyPortions',
    (_e, date: string, plan: PortionPlan, meal?: MealType) =>
      applyPortionsToDiary(date, plan, meal ?? 'lunch')
  )

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

  ipcMain.handle('water:list', (_e, date?: string) => listWater(date))
  ipcMain.handle('water:add', (_e, input: { date: string; ml: number }) => addWater(input))
  ipcMain.handle('water:delete', (_e, id: string) => deleteWater(id))
  ipcMain.handle('water:total', (_e, date: string) => getWaterTotal(date))
  ipcMain.handle('water:goal', () => getWaterGoalMl())
  ipcMain.handle('water:recommended', () => getRecommendedWaterMl())

  ipcMain.handle('exercise:list', (_e, date?: string) => listExercise(date))
  ipcMain.handle('exercise:add', (_e, input: Omit<Exercise, 'id'>) => addExercise(input))
  ipcMain.handle('exercise:delete', (_e, id: string) => deleteExercise(id))

  ipcMain.handle('data:export', () => exportDataToFile(getWindow()))
  ipcMain.handle('data:import', () => importDataFromFile(getWindow()))
  ipcMain.handle('data:reset', () => resetData())

  ipcMain.handle('health:get', () => getHealthProfile())
  ipcMain.handle('health:update', (_e, patch: Partial<HealthProfile>) => updateHealthProfile(patch ?? {}))
  ipcMain.handle('health:extractFromText', (_e, text: string) => extractHealthFromText(text))
  ipcMain.handle('health:importFile', () => importHealthReportFile(getWindow()))

  ipcMain.handle('analysis:exportPdf', (_e, days: number) =>
    exportAnalysisPdf(getWindow(), typeof days === 'number' ? days : 1)
  )

  ipcMain.handle(
    'data:savePng',
    (_e, dataUrl: string, defaultName?: string) =>
      savePngDataUrl(getWindow(), dataUrl, defaultName || 'MyHealth-Plate.png')
  )
}

app.commandLine.appendSwitch('disable-gpu-shader-disk-cache')

const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  console.error(
    'MyHealth is already running. Close the other window and try again.'
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
    setupAutoUpdater(() => mainWindow)

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

