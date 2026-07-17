'use client'

import { cn } from '@/lib/utils'
import type { ContractType } from '@/types'

const OPTIONS: { value: ContractType; label: string; description: string }[] = [
  { value: 'NDA', label: 'NDA', description: 'Non-Disclosure Agreement' },
  { value: 'MSA', label: 'MSA', description: 'Master Service Agreement' },
]

export function ContractTypeSelector({
  value,
  onChange,
  disabled,
}: {
  value: ContractType | null
  onChange: (type: ContractType) => void
  disabled?: boolean
}) {
  return (
    <div role="radiogroup" aria-label="Contract type" className="flex gap-3">
      {OPTIONS.map((option) => {
        const selected = value === option.value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex flex-1 flex-col items-start gap-1 rounded-lg border px-4 py-3 text-left transition-colors duration-100 ease-out focus-ring disabled:cursor-not-allowed disabled:opacity-60',
              selected
                ? 'border-blue-500 bg-blue-50'
                : 'border-grey-100 bg-white hover:border-grey-200'
            )}
          >
            <span className="text-body-lg font-semibold text-grey-900">{option.label}</span>
            <span className="text-body-sm text-grey-500">{option.description}</span>
          </button>
        )
      })}
    </div>
  )
}
