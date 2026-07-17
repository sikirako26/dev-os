'use client'

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createBrowserClient } from '@/lib/supabase/client'
import type { ChatMessage } from '@/types'
import type { ChatMessagesResponse } from '@/hooks/useChatMessages'

export function useChatRealtime(sessionId: string | null, contractId: string) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!sessionId) return
    const supabase = createBrowserClient()

    const channel = supabase
      .channel(`chat_messages:${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          const newMessage = payload.new as ChatMessage
          queryClient.setQueryData<ChatMessagesResponse>(['chatMessages', contractId], (old) => {
            if (!old) return old
            if (old.messages.some((m) => m.id === newMessage.id)) return old
            return { ...old, messages: [...old.messages, newMessage] }
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [sessionId, contractId, queryClient])
}
