import { Badge } from '@/components/ui/Badge'
import type { ChatContextSource } from '@/types'

const LABELS: Record<ChatContextSource, string> = {
  contract: 'Contract',
  history: 'Conversation',
  both: 'Contract + Conversation',
}

export function ContextSourceBadge({ source }: { source: ChatContextSource }) {
  return (
    <Badge tone="grey" className="w-fit text-caption">
      Source: {LABELS[source]}
    </Badge>
  )
}
