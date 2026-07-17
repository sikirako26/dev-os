'use client'

import { X } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { AddCustomTermButton } from '@/components/upload/AddCustomTermButton'
import { STANDARD_TERMS } from '@/lib/contracts/standardTerms'
import type { ContractType } from '@/types'

export function PreProcessingPreview({
  contractType,
  customTerms,
  onAddCustomTerm,
  onRemoveCustomTerm,
}: {
  contractType: ContractType
  customTerms: string[]
  onAddCustomTerm: (term: string) => void
  onRemoveCustomTerm: (term: string) => void
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h2 className="text-body-lg font-semibold text-grey-900">
          We&apos;ll extract these key terms
        </h2>
        <ul className="flex flex-col gap-2">
          {STANDARD_TERMS[contractType].map((term) => (
            <li
              key={term}
              className="flex items-center justify-between rounded-md border border-grey-50 bg-grey-25 px-3 py-2 text-body-sm text-grey-900"
            >
              {term}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-body-lg font-semibold text-grey-900">Custom terms (optional)</h2>
        {customTerms.length > 0 && (
          <ul className="flex flex-col gap-2">
            {customTerms.map((term) => (
              <li
                key={term}
                className="flex items-center justify-between rounded-md border border-violet-100 bg-violet-50 px-3 py-2 text-body-sm text-grey-900"
              >
                <span className="flex items-center gap-2">
                  <Badge tone="violet">Custom</Badge>
                  {term}
                </span>
                <button
                  type="button"
                  onClick={() => onRemoveCustomTerm(term)}
                  aria-label={`Remove ${term}`}
                  className="text-grey-400 hover:text-grey-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <AddCustomTermButton count={customTerms.length} onAdd={onAddCustomTerm} />
      </div>
    </div>
  )
}
