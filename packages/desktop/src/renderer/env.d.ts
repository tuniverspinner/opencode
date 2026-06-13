import type { ElectronAPI } from "../preload/types"

declare global {
  interface Window {
    api: ElectronAPI
    __CYF__?: {
      deepLinks?: string[]
    }
  }
}
