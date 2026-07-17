import { CheckCircle2, Loader2, AlertTriangle, FileUp } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import type { ContractStatus } from '@/types'

const STATUS_CONFIG: Record<
  ContractStatus,
  { label: string; tone: 'grey' | 'green' | 'yellow' | 'red'; icon: React.ElementType }
> = {
  uploaded: { label: 'Uploaded', tone: 'grey', icon: FileUp },
  processing: { label: 'Processing', tone: 'yellow', icon: Loader2 },
  complete: { label: 'Complete', tone: 'green', icon: CheckCircle2 },
  error: { label: 'Error', tone: 'red', icon: AlertTriangle },
}

export function StatusBadge({ status }: { status: ContractStatus }) {
  const config = STATUS_CONFIG[status]
  const Icon = config.icon
  return (
    <Badge tone={config.tone} icon={<Icon className="h-3 w-3" aria-hidden="true" />}>
      {config.label}
    </Badge>
  )
}
