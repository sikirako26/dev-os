import { create } from 'zustand'
import type { ContractType } from '@/types'
import { MAX_CUSTOM_TERMS } from '@/lib/contracts/standardTerms'

export type WizardStep =
  | 'selecting-type'
  | 'uploading'
  | 'previewing'
  | 'processing'

interface UploadWizardState {
  step: WizardStep
  contractType: ContractType | null
  file: File | null
  contractId: string | null
  customTerms: string[]
  setStep: (step: WizardStep) => void
  setContractType: (type: ContractType) => void
  setFile: (file: File | null) => void
  setContractId: (id: string | null) => void
  addCustomTerm: (term: string) => void
  removeCustomTerm: (term: string) => void
  reset: () => void
}

const initialState = {
  step: 'selecting-type' as WizardStep,
  contractType: null,
  file: null,
  contractId: null,
  customTerms: [] as string[],
}

export const useUploadWizardStore = create<UploadWizardState>((set) => ({
  ...initialState,
  setStep: (step) => set({ step }),
  setContractType: (contractType) => set({ contractType }),
  setFile: (file) => set({ file }),
  setContractId: (contractId) => set({ contractId }),
  addCustomTerm: (term) =>
    set((s) =>
      s.customTerms.length >= MAX_CUSTOM_TERMS || s.customTerms.includes(term)
        ? s
        : { customTerms: [...s.customTerms, term] }
    ),
  removeCustomTerm: (term) =>
    set((s) => ({ customTerms: s.customTerms.filter((t) => t !== term) })),
  reset: () => set(initialState),
}))
