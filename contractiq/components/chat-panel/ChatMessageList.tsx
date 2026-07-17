'use client'

import { Fragment, useEffect, useRef } from 'react'
import { SourceCitationLink } from '@/components/chat-panel/SourceCitationLink'
import { ContextSourceBadge } from '@/components/chat-panel/ContextSourceBadge'
import { cn } from '@/lib/utils'
import type { ChatMessage } from '@/types'

const CITATION_PATTERN = /\[Page (\d+)\]/gi

function renderContentWithCitations(content: string) {
  const parts: (string | { page: number })[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  CITATION_PATTERN.lastIndex = 0
  while ((match = CITATION_PATTERN.exec(content)) !== null) {
    if (match.index > lastIndex) parts.push(content.slice(lastIndex, match.index))
    parts.push({ page: Number(match[1]) })
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < content.length) parts.push(content.slice(lastIndex))

  return parts.map((part, i) =>
    typeof part === 'string' ? (
      <Fragment key={i}>{part}</Fragment>
    ) : (
      <SourceCitationLink key={i} page={part.page} />
    )
  )
}

export function ChatMessageList({ messages }: { messages: ChatMessage[] }) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center">
        <p className="text-body-sm text-grey-500">
          Ask a question about this contract — answers are grounded in the document text.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
      {messages.map((message) => (
        <div
          key={message.id}
          className={cn(
            'flex flex-col gap-1',
            message.role === 'user' ? 'items-end' : 'items-start'
          )}
        >
          <div
            className={cn(
              'max-w-[80%] rounded-lg px-3 py-2 text-body-sm',
              message.role === 'user'
                ? 'bg-blue-500 text-white'
                : 'border border-grey-100 bg-white text-grey-900'
            )}
          >
            {renderContentWithCitations(message.content)}
          </div>
          {message.role === 'assistant' && message.context_source && (
            <ContextSourceBadge source={message.context_source} />
          )}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
