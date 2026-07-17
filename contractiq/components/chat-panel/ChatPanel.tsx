'use client'

import { ChatMessageList } from '@/components/chat-panel/ChatMessageList'
import { ChatInput } from '@/components/chat-panel/ChatInput'
import { InlineError } from '@/components/ui/InlineError'
import { Spinner } from '@/components/ui/Spinner'
import { useChatMessages } from '@/hooks/useChatMessages'
import { useSendChatMessage } from '@/hooks/useSendChatMessage'
import { useChatRealtime } from '@/hooks/useChatRealtime'
import type { ContractStatus } from '@/types'

export function ChatPanel({
  contractId,
  contractStatus,
}: {
  contractId: string
  contractStatus: ContractStatus
}) {
  const isReady = contractStatus === 'complete'
  const { data, isLoading, isError, error } = useChatMessages(contractId, isReady)
  const sendMutation = useSendChatMessage(contractId)
  useChatRealtime(data?.session_id ?? null, contractId)

  if (!isReady) {
    return (
      <div className="flex h-[400px] flex-col items-center justify-center rounded-lg border border-grey-100 p-6 text-center">
        <p className="text-body-sm text-grey-500">
          Chat will be available once this contract finishes processing.
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-[400px] flex-col rounded-lg border border-grey-100 bg-white">
      <div className="border-b border-grey-100 px-4 py-2">
        <h2 className="text-body-lg font-semibold text-grey-900">Chat with Contract</h2>
      </div>

      {isLoading && (
        <div className="flex flex-1 items-center justify-center">
          <Spinner className="h-5 w-5" />
        </div>
      )}

      {isError && (
        <div className="p-4">
          <InlineError message={error instanceof Error ? error.message : 'Failed to load chat'} />
        </div>
      )}

      {!isLoading && !isError && <ChatMessageList messages={data?.messages ?? []} />}

      {sendMutation.isError && (
        <div className="px-4">
          <InlineError
            message={
              sendMutation.error instanceof Error ? sendMutation.error.message : 'Failed to send message'
            }
          />
        </div>
      )}

      <ChatInput
        onSend={(message) => sendMutation.mutate(message)}
        disabled={isLoading}
        sending={sendMutation.isPending}
      />
    </div>
  )
}
