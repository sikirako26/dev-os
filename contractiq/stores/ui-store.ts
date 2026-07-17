import { create } from 'zustand'

interface UiState {
  targetPage: number | null
  zoom: number
  setTargetPage: (page: number) => void
  setZoom: (zoom: number) => void
}

export const useUiStore = create<UiState>((set) => ({
  targetPage: null,
  zoom: 1,
  setTargetPage: (targetPage) => set({ targetPage }),
  setZoom: (zoom) => set({ zoom }),
}))
