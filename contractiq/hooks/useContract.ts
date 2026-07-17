'use client'

import { useQuery } from '@tanstack/react-query'
import type { Contract, KeyTerm, CustomKeyTerm } from '@/types'

export interface ContractDetail {
  contract: Contract
  key_terms: KeyTerm[]
  custom_key_terms: CustomKeyTerm[]
}

async function fetchContract(contractId: string): Promise<ContractDetail> {
  const res = await fetch(`/api/contracts/${contractId}`)
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error?.message ?? 'Failed to load contract')
  }
  return res.json()
}

export function useContract(contractId: string) {
  return useQuery({
    queryKey: ['contract', contractId],
    queryFn: () => fetchContract(contractId),
    refetchInterval: (query) =>
      query.state.data?.contract.status === 'processing' ? 3000 : false,
  })
}
