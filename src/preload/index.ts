import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppSettings,
  DashboardSummary,
  DiaryEntry,
  Exercise,
  Food,
  WeightLog
} from '../shared/types'

const api = {
  getDashboard: (date: string): Promise<DashboardSummary> =>
    ipcRenderer.invoke('dashboard:get', date),

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
  resetData: (): Promise<unknown> => ipcRenderer.invoke('data:reset')
}

contextBridge.exposeInMainWorld('api', api)

export type MyHealthApi = typeof api
