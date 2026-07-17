'use client'

import { useMutation } from '@tanstack/react-query'

async function processContract(contractId: string) {
  const res = await fetch(`/api/contracts/${contractId}/process`, { method: 'POST' })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error?.message ?? 'Failed to process contract')
  }
  return res.json()
}

export function useProcessContract() {
  return useMutation({ mutationFn: processContract })
}
