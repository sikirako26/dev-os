'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ChatMessage } from '@/types'
import type { ChatMessagesResponse } from '@/hooks/useChatMessages'

interface SendMessageResponse {
  user_message: ChatMessage
  assistant_message: ChatMessage
}

async function sendChatMessage({ contractId, message }: { contractId: string; message: string }) {
  const res = await fetch(`/api/contracts/${contractId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error?.message ?? 'Failed to send message')
  }
  return res.json() as Promise<SendMessageResponse>
}

export function useSendChatMessage(contractId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (message: string) => sendChatMessage({ contractId, message }),
    onSuccess: (data) => {
      queryClient.setQueryData<ChatMessagesResponse>(['chatMessages', contractId], (old) => {
        if (!old) return old
        const withoutDupes = old.messages.filter(
          (m) => m.id !== data.user_message.id && m.id !== data.assistant_message.id
        )
        return { ...old, messages: [...withoutDupes, data.user_message, data.assistant_message] }
      })
    },
  })
}
