'use client'

import { useQuery } from '@tanstack/react-query'
import type { ChatMessage } from '@/types'

export interface ChatMessagesResponse {
  messages: ChatMessage[]
  session_id: string | null
}

async function fetchChatMessages(contractId: string): Promise<ChatMessagesResponse> {
  const res = await fetch(`/api/contracts/${contractId}/chat`)
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error?.message ?? 'Failed to load chat history')
  }
  return res.json()
}

export function useChatMessages(contractId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['chatMessages', contractId],
    queryFn: () => fetchChatMessages(contractId),
    enabled,
  })
}
