'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { CustomTermInput } from '@/components/upload/CustomTermInput'
import { MAX_CUSTOM_TERMS } from '@/lib/contracts/standardTerms'

export function AddCustomTermButton({
  count,
  onAdd,
}: {
  count: number
  onAdd: (term: string) => void
}) {
  const [isAdding, setIsAdding] = useState(false)
  const atLimit = count >= MAX_CUSTOM_TERMS

  if (isAdding) {
    return (
      <CustomTermInput
        onAdd={(term) => {
          onAdd(term)
          setIsAdding(false)
        }}
        onCancel={() => setIsAdding(false)}
      />
    )
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      disabled={atLimit}
      title={atLimit ? 'Up to 5 custom terms per analysis' : undefined}
      onClick={() => setIsAdding(true)}
    >
      <Plus className="h-3 w-3" aria-hidden="true" />
      {atLimit ? 'Up to 5 custom terms per analysis' : 'Add key term'}
    </Button>
  )
}
