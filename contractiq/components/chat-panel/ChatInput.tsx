'use client'

import { useState, type KeyboardEvent } from 'react'
import { Send } from 'lucide-react'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'

const MAX_MESSAGE_LENGTH = 2000

export function ChatInput({
  onSend,
  disabled,
  sending,
}: {
  onSend: (message: string) => void
  disabled?: boolean
  sending?: boolean
}) {
  const [value, setValue] = useState('')

  function handleSend() {
    const trimmed = value.trim()
    if (!trimmed || sending) return
    onSend(trimmed)
    setValue('')
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex items-end gap-2 border-t border-grey-100 p-3">
      <Textarea
        rows={1}
        maxLength={MAX_MESSAGE_LENGTH}
        placeholder="Ask about this contract…"
        value={value}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        className="flex-1"
      />
      <Button onClick={handleSend} disabled={disabled || !value.trim()} loading={sending} size="sm">
        <Send className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  )
}
