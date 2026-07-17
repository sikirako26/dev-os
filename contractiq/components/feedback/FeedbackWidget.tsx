'use client'

import { useState } from 'react'
import { ThumbsUp, ThumbsDown, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { InlineError } from '@/components/ui/InlineError'
import { cn } from '@/lib/utils'
import { useSubmitFeedback } from '@/hooks/useSubmitFeedback'
import type { FeedbackRating } from '@/types'

export function FeedbackWidget({ contractId }: { contractId: string }) {
  const [rating, setRating] = useState<FeedbackRating | null>(null)
  const [comment, setComment] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const mutation = useSubmitFeedback()

  function handleSubmit() {
    if (!rating) return
    mutation.mutate(
      { contractId, rating, comment: comment.trim() || undefined },
      { onSuccess: () => setSubmitted(true) }
    )
  }

  if (submitted) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-body-sm text-green-700">
        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
        Thanks for the feedback.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-grey-100 p-4">
      <div className="flex items-center gap-3">
        <span className="text-body-sm text-grey-500">Was this analysis helpful?</span>
        <button
          type="button"
          aria-label="Thumbs up"
          onClick={() => setRating('up')}
          className={cn(
            'rounded-md border p-1.5 transition-colors duration-100 ease-out',
            rating === 'up'
              ? 'border-green-500 bg-green-50 text-green-700'
              : 'border-grey-100 text-grey-500 hover:border-grey-200'
          )}
        >
          <ThumbsUp className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Thumbs down"
          onClick={() => setRating('down')}
          className={cn(
            'rounded-md border p-1.5 transition-colors duration-100 ease-out',
            rating === 'down'
              ? 'border-red-500 bg-red-50 text-red-700'
              : 'border-grey-100 text-grey-500 hover:border-grey-200'
          )}
        >
          <ThumbsDown className="h-4 w-4" />
        </button>
      </div>

      {rating && (
        <div className="flex flex-col gap-2">
          <Textarea
            rows={2}
            maxLength={1000}
            placeholder="Anything specific? (optional)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          {mutation.isError && (
            <InlineError
              message={mutation.error instanceof Error ? mutation.error.message : 'Submission failed'}
            />
          )}
          <Button size="sm" onClick={handleSubmit} loading={mutation.isPending} className="self-start">
            Submit feedback
          </Button>
        </div>
      )}
    </div>
  )
}
