'use client'

import { useState, type KeyboardEvent } from 'react'
import { Plus } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

const MAX_TERM_LENGTH = 80

export function CustomTermInput({
  onAdd,
  onCancel,
}: {
  onAdd: (term: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState('')

  function submit() {
    const trimmed = value.trim()
    if (!trimmed) return
    onAdd(trimmed)
    setValue('')
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      submit()
    }
    if (e.key === 'Escape') {
      onCancel()
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        autoFocus
        maxLength={MAX_TERM_LENGTH}
        placeholder="e.g. Non-compete radius"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          if (!value.trim()) onCancel()
        }}
      />
      <Button type="button" size="sm" onClick={submit}>
        <Plus className="h-3 w-3" aria-hidden="true" />
        Add
      </Button>
    </div>
  )
}
