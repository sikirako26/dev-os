'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { KeyTerm } from '@/types'

interface UpdateKeyTermArgs {
  id: string
  value: string
}

async function updateKeyTerm({ id, value }: UpdateKeyTermArgs) {
  const res = await fetch(`/api/key-terms/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error?.message ?? 'Failed to save edit')
  }
  return res.json()
}

export function useUpdateKeyTerm(contractId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: updateKeyTerm,
    onMutate: async ({ id, value }) => {
      await queryClient.cancelQueries({ queryKey: ['contract', contractId] })
      const previous = queryClient.getQueryData(['contract', contractId])

      queryClient.setQueryData(['contract', contractId], (old: unknown) => {
        if (!old || typeof old !== 'object') return old
        const data = old as { key_terms: KeyTerm[] }
        return {
          ...data,
          key_terms: data.key_terms.map((t) => (t.id === id ? { ...t, value, is_edited: true } : t)),
        }
      })

      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['contract', contractId], context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['contract', contractId] })
    },
  })
}
