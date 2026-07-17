import { Card } from '@/components/ui/Card'

export function DashboardSummaryCard({
  total,
  byType,
}: {
  total: number
  byType: Record<string, number>
}) {
  return (
    <Card className="flex flex-wrap gap-8">
      <div className="flex flex-col gap-1">
        <span className="text-body-sm text-grey-500">Total contracts</span>
        <span className="text-h3 text-grey-900">{total}</span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-body-sm text-grey-500">NDA</span>
        <span className="text-h3 text-grey-900">{byType.NDA ?? 0}</span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-body-sm text-grey-500">MSA</span>
        <span className="text-h3 text-grey-900">{byType.MSA ?? 0}</span>
      </div>
    </Card>
  )
}
