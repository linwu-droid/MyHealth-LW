import type { MyHealthApi } from './index'

declare global {
  interface Window {
    api: MyHealthApi
  }
}

export {}
