import { ShieldCheck, ShieldAlert, ShieldX } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'

export function ConfidenceBadge({ score }: { score: number }) {
  if (score >= 80) {
    return (
      <Badge tone="green" icon={<ShieldCheck className="h-3 w-3" aria-hidden="true" />}>
        High confidence · {Math.round(score)}%
      </Badge>
    )
  }
  if (score >= 50) {
    return (
      <Badge tone="yellow" icon={<ShieldAlert className="h-3 w-3" aria-hidden="true" />}>
        Medium confidence · {Math.round(score)}%
      </Badge>
    )
  }
  return (
    <Badge tone="red" icon={<ShieldX className="h-3 w-3" aria-hidden="true" />}>
      Low confidence · {Math.round(score)}%
    </Badge>
  )
}
