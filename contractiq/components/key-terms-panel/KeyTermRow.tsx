'use client'

import { useState } from 'react'
import { Check, X, Pencil, ChevronDown, ChevronUp } from 'lucide-react'
import { ConfidenceBadge } from '@/components/key-terms-panel/ConfidenceBadge'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { InlineError } from '@/components/ui/InlineError'
import { useUiStore } from '@/stores/ui-store'
import { useUpdateKeyTerm } from '@/hooks/useUpdateKeyTerm'

const SOURCE_SENTENCE_TRUNCATE = 280

export interface KeyTermRowData {
  id: string
  term_name: string
  value: string | null
  page_number: number | null
  confidence_score: number | null
  source_sentence: string | null
  is_edited: boolean
  is_manual: boolean
}

export function KeyTermRow({ term, contractId }: { term: KeyTermRowData; contractId: string }) {
  const [isEditing, setIsEditing] = useState(false)
  const [draftValue, setDraftValue] = useState(term.value ?? '')
  const [isExpanded, setIsExpanded] = useState(false)
  const setTargetPage = useUiStore((s) => s.setTargetPage)
  const updateMutation = useUpdateKeyTerm(contractId)

  const lowConfidence = (term.confidence_score ?? 0) < 50
  const sourceSentence = term.source_sentence ?? ''
  const isLong = sourceSentence.length > SOURCE_SENTENCE_TRUNCATE
  const displaySentence =
    isLong && !isExpanded ? sourceSentence.slice(0, SOURCE_SENTENCE_TRUNCATE) + '…' : sourceSentence

  function handleSave() {
    if (!draftValue.trim()) return
    updateMutation.mutate(
      { id: term.id, value: draftValue.trim() },
      { onSuccess: () => setIsEditing(false) }
    )
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-grey-100 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-body-sm font-medium text-grey-500">{term.term_name}</span>
            {term.is_manual && <Badge tone="violet">Custom</Badge>}
            {term.is_edited && <Badge tone="blue">Edited</Badge>}
          </div>

          {isEditing ? (
            <div className="flex items-center gap-2">
              <Input
                autoFocus
                value={draftValue}
                onChange={(e) => setDraftValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave()
                  if (e.key === 'Escape') setIsEditing(false)
                }}
              />
              <Button
                size="sm"
                variant="ghost"
                loading={updateMutation.isPending}
                onClick={handleSave}
                aria-label="Save"
              >
                <Check className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setIsEditing(false)
                  setDraftValue(term.value ?? '')
                }}
                aria-label="Cancel"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="group flex items-center gap-2 text-left"
            >
              <span className="text-body-lg text-grey-900">{term.value || 'Not specified'}</span>
              <Pencil className="h-3 w-3 text-grey-300 opacity-0 group-hover:opacity-100" />
            </button>
          )}
        </div>

        <div className="flex flex-col items-end gap-2">
          {term.page_number !== null && (
            <button
              type="button"
              onClick={() => setTargetPage(term.page_number!)}
              className="text-body-sm font-medium text-blue-500 hover:text-blue-600"
            >
              Page {term.page_number}
            </button>
          )}
          {term.confidence_score !== null && <ConfidenceBadge score={term.confidence_score} />}
        </div>
      </div>

      {lowConfidence && (
        <InlineError message="Low confidence — verify this term against the source document." />
      )}

      {updateMutation.isError && (
        <InlineError
          message={
            updateMutation.error instanceof Error ? updateMutation.error.message : 'Failed to save'
          }
        />
      )}

      {sourceSentence && (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => setIsExpanded((e) => !e)}
            className="flex items-center gap-1 text-body-sm font-medium text-grey-500 hover:text-grey-900"
          >
            Why?
            {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {isExpanded && (
            <p className="text-body-sm italic text-grey-500">&ldquo;{displaySentence}&rdquo;</p>
          )}
        </div>
      )}
    </div>
  )
}
