'use client'

import { useMutation } from '@tanstack/react-query'
import type { FeedbackRating } from '@/types'

async function submitFeedback({
  contractId,
  rating,
  comment,
}: {
  contractId: string
  rating: FeedbackRating
  comment?: string
}) {
  const res = await fetch(`/api/contracts/${contractId}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rating, comment }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error?.message ?? 'Failed to submit feedback')
  }
  return res.json()
}

export function useSubmitFeedback() {
  return useMutation({ mutationFn: submitFeedback })
}
