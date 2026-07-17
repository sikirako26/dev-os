'use client'

import { useMutation } from '@tanstack/react-query'

async function registerCustomTerms({ contractId, terms }: { contractId: string; terms: string[] }) {
  const res = await fetch(`/api/contracts/${contractId}/custom-terms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ terms }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error?.message ?? 'Failed to register custom terms')
  }
  return res.json()
}

export function useRegisterCustomTerms() {
  return useMutation({ mutationFn: registerCustomTerms })
}
