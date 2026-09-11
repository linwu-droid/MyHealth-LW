import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppSettings,
  DashboardSummary,
  DiaryEntry,
  Exercise,
  Food,
  MealType,
  OnlineFoodCandidate,
  PortionPlan,
  ShoppingListItem,
  WeightLog,
  WaterLog,
  NutritionAnalysis,
  HealthProfile
} from '../shared/types'
import type { ExtractCandidate } from '../shared/health'

export type BulkImportResult = {
  created: number
  skipped: number
  foods: Food[]
}

export type CommonPackImportResult = BulkImportResult & {
  fetched: number
}

const api = {
  getDashboard: (date: string): Promise<DashboardSummary> =>
    ipcRenderer.invoke('dashboard:get', date),

  analyzeNutrition: (opts: { date?: string; days?: number }): Promise<NutritionAnalysis> =>
    ipcRenderer.invoke('nutrition:analyze', opts),

  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
  updateSettings: (patch: Partial<AppSettings>): Promise<AppSettings> =>
    ipcRenderer.invoke('settings:update', patch),

  listFoods: (query?: string): Promise<Food[]> => ipcRenderer.invoke('foods:list', query),
  createFood: (input: Omit<Food, 'id'>): Promise<Food> =>
    ipcRenderer.invoke('foods:create', input),
  updateFood: (id: string, patch: Partial<Omit<Food, 'id'>>): Promise<Food | null> =>
    ipcRenderer.invoke('foods:update', id, patch),
  deleteFood: (id: string): Promise<{ deleted: boolean }> =>
    ipcRenderer.invoke('foods:delete', id),

  searchNutrition: (query: string): Promise<OnlineFoodCandidate[]> =>
    ipcRenderer.invoke('nutrition:search', query),
  foodImage: (name: string): Promise<string | null> =>
    ipcRenderer.invoke('nutrition:foodImage', name),
  importFoodsMany: (foods: Omit<Food, 'id'>[]): Promise<BulkImportResult> =>
    ipcRenderer.invoke('nutrition:importMany', foods),
  importCommonFoodsPack: (): Promise<CommonPackImportResult> =>
    ipcRenderer.invoke('nutrition:importCommonPack'),
  importDrinksPack: (): Promise<CommonPackImportResult> =>
    ipcRenderer.invoke('nutrition:importDrinksPack'),
  importHomemadeFoodsPack: (): Promise<CommonPackImportResult> =>
    ipcRenderer.invoke('nutrition:importHomemadePack'),
  importSupermarketFoodsPack: (): Promise<CommonPackImportResult> =>
    ipcRenderer.invoke('nutrition:importSupermarketPack'),

  listShopping: (): Promise<ShoppingListItem[]> => ipcRenderer.invoke('shopping:list'),
  addShopping: (input: {
    name: string
    quantity?: number
    unit?: string
    notes?: string
    foodId?: string
  }): Promise<ShoppingListItem> => ipcRenderer.invoke('shopping:add', input),
  addShoppingMany: (lines: string[]): Promise<{ created: number; items: ShoppingListItem[] }> =>
    ipcRenderer.invoke('shopping:addMany', lines),
  updateShopping: (
    id: string,
    patch: Partial<Omit<ShoppingListItem, 'id' | 'createdAt'>>
  ): Promise<ShoppingListItem | null> => ipcRenderer.invoke('shopping:update', id, patch),
  deleteShopping: (id: string): Promise<{ deleted: boolean }> =>
    ipcRenderer.invoke('shopping:delete', id),
  clearCheckedShopping: (): Promise<{ removed: number }> =>
    ipcRenderer.invoke('shopping:clearChecked'),
  recommendPortions: (days: number): Promise<PortionPlan> =>
    ipcRenderer.invoke('shopping:recommend', days),
  applyPortionsToDiary: (
    date: string,
    plan: PortionPlan,
    meal?: MealType
  ): Promise<{ added: number }> => ipcRenderer.invoke('shopping:applyPortions', date, plan, meal),

  listDiary: (date?: string): Promise<DiaryEntry[]> => ipcRenderer.invoke('diary:list', date),
  addDiary: (input: Omit<DiaryEntry, 'id'>): Promise<DiaryEntry> =>
    ipcRenderer.invoke('diary:add', input),
  updateDiary: (
    id: string,
    patch: Partial<Omit<DiaryEntry, 'id'>>
  ): Promise<DiaryEntry | null> => ipcRenderer.invoke('diary:update', id, patch),
  deleteDiary: (id: string): Promise<{ deleted: boolean }> =>
    ipcRenderer.invoke('diary:delete', id),

  listWeight: (): Promise<WeightLog[]> => ipcRenderer.invoke('weight:list'),
  addWeight: (input: { date: string; kg: number }): Promise<WeightLog> =>
    ipcRenderer.invoke('weight:add', input),
  deleteWeight: (id: string): Promise<{ deleted: boolean }> =>
    ipcRenderer.invoke('weight:delete', id),

  listWater: (date?: string): Promise<WaterLog[]> => ipcRenderer.invoke('water:list', date),
  addWater: (input: { date: string; ml: number }): Promise<WaterLog> =>
    ipcRenderer.invoke('water:add', input),
  deleteWater: (id: string): Promise<{ deleted: boolean }> =>
    ipcRenderer.invoke('water:delete', id),
  getWaterTotal: (date: string): Promise<number> => ipcRenderer.invoke('water:total', date),
  getWaterGoalMl: (): Promise<number> => ipcRenderer.invoke('water:goal'),
  getRecommendedWaterMl: (): Promise<number> => ipcRenderer.invoke('water:recommended'),

  listExercise: (date?: string): Promise<Exercise[]> =>
    ipcRenderer.invoke('exercise:list', date),
  addExercise: (input: Omit<Exercise, 'id'>): Promise<Exercise> =>
    ipcRenderer.invoke('exercise:add', input),
  deleteExercise: (id: string): Promise<{ deleted: boolean }> =>
    ipcRenderer.invoke('exercise:delete', id),

  exportData: (): Promise<{ cancelled: boolean; path?: string }> =>
    ipcRenderer.invoke('data:export'),
  importData: (): Promise<{ cancelled: boolean; error?: string }> =>
    ipcRenderer.invoke('data:import'),
  resetData: (): Promise<unknown> => ipcRenderer.invoke('data:reset'),

  exportAnalysisPdf: (
    days: number
  ): Promise<{ cancelled?: boolean; path?: string; error?: string }> =>
    ipcRenderer.invoke('analysis:exportPdf', days),

  savePngDataUrl: (
    dataUrl: string,
    defaultName?: string
  ): Promise<{ cancelled?: boolean; path?: string; error?: string }> =>
    ipcRenderer.invoke('data:savePng', dataUrl, defaultName),

  getHealthProfile: (): Promise<HealthProfile> => ipcRenderer.invoke('health:get'),
  updateHealthProfile: (patch: Partial<HealthProfile>): Promise<HealthProfile> =>
    ipcRenderer.invoke('health:update', patch),
  extractHealthFromText: (text: string): Promise<ExtractCandidate[]> =>
    ipcRenderer.invoke('health:extractFromText', text),
  importHealthReportFile: (): Promise<{
    cancelled: boolean
    text?: string
    error?: string
    note?: string
    fileName?: string
  }> => ipcRenderer.invoke('health:importFile'),

  checkForUpdates: (): Promise<{
    ok: boolean
    reason?: string
    version?: string
    updateAvailable?: boolean
    message?: string
  }> => ipcRenderer.invoke('updater:check'),
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('updater:getVersion')
}

contextBridge.exposeInMainWorld('api', api)

export type MyHealthApi = typeof api

