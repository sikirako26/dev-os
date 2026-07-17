'use client'

import Link from 'next/link'
import { FileText, Plus } from 'lucide-react'
import { useSession } from '@/hooks/useSession'
import { useDashboard } from '@/hooks/useDashboard'
import { DashboardSummaryCard } from '@/components/dashboard/DashboardSummaryCard'
import { ContractHistoryTable } from '@/components/dashboard/ContractHistoryTable'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { InlineError } from '@/components/ui/InlineError'

export default function DashboardPage() {
  const { user } = useSession()
  const { data, isLoading, isError, error } = useDashboard(user?.id ?? null)

  return (
    <main className="flex flex-col gap-10 px-6 py-24 md:px-28">
      <div className="flex items-center justify-between">
        <h1 className="text-h3 text-grey-900">Dashboard</h1>
        <Link href="/contracts/upload">
          <Button>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Review a contract
          </Button>
        </Link>
      </div>

      {isLoading && (
        <div className="flex flex-col gap-6">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}

      {isError && (
        <InlineError message={error instanceof Error ? error.message : 'Failed to load dashboard'} />
      )}

      {!isLoading && !isError && data && data.total === 0 && (
        <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-grey-200 py-24 text-center">
          <FileText className="h-10 w-10 text-grey-300" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <p className="text-body-lg font-medium text-grey-900">No contracts reviewed yet</p>
            <p className="text-body-sm text-grey-500">
              Upload your first contract to begin.
            </p>
          </div>
          <Link href="/contracts/upload">
            <Button>Review a contract</Button>
          </Link>
        </div>
      )}

      {!isLoading && !isError && data && data.total > 0 && (
        <div className="flex flex-col gap-6">
          <DashboardSummaryCard total={data.total} byType={data.byType} />
          <ContractHistoryTable contracts={data.contracts} />
        </div>
      )}
    </main>
  )
}
