'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowUpDown, RefreshCw } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { StatusBadge } from '@/components/dashboard/StatusBadge'
import { Button } from '@/components/ui/Button'
import { formatDate, cn } from '@/lib/utils'
import { useProcessContract } from '@/hooks/useProcessContract'
import type { Contract } from '@/types'

type SortColumn = 'created_at' | 'contract_type' | 'status'
type SortDirection = 'asc' | 'desc'

export function ContractHistoryTable({ contracts }: { contracts: Contract[] }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [sortColumn, setSortColumn] = useState<SortColumn>('created_at')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  const retryMutation = useProcessContract()

  const sorted = useMemo(() => {
    const copy = [...contracts]
    copy.sort((a, b) => {
      const aVal = a[sortColumn]
      const bVal = b[sortColumn]
      const cmp = String(aVal).localeCompare(String(bVal))
      return sortDirection === 'asc' ? cmp : -cmp
    })
    return copy
  }, [contracts, sortColumn, sortDirection])

  function toggleSort(column: SortColumn) {
    if (sortColumn === column) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortColumn(column)
      setSortDirection('desc')
    }
  }

  const columns: { key: SortColumn; label: string }[] = [
    { key: 'created_at', label: 'Date' },
    { key: 'contract_type', label: 'Type' },
    { key: 'status', label: 'Status' },
  ]

  return (
    <div className="overflow-x-auto rounded-lg border border-grey-100">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-grey-100 bg-grey-25">
            {columns.map((col) => (
              <th key={col.key} className="px-4 py-3">
                <button
                  onClick={() => toggleSort(col.key)}
                  className="flex items-center gap-1 text-body-sm font-medium text-grey-500 hover:text-grey-900"
                >
                  {col.label}
                  <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
                </button>
              </th>
            ))}
            <th className="px-4 py-3 text-body-sm font-medium text-grey-500">Action</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((contract) => {
            const isRecoverable = contract.status === 'error' || contract.status === 'processing'
            return (
              <tr
                key={contract.id}
                onClick={() => router.push(`/contracts/${contract.id}`)}
                className={cn(
                  'cursor-pointer border-b border-grey-50 last:border-0 hover:bg-grey-25'
                )}
              >
                <td className="px-4 py-3 text-body-sm text-grey-900">
                  {formatDate(contract.created_at)}
                </td>
                <td className="px-4 py-3 text-body-sm text-grey-900">{contract.contract_type}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={contract.status} />
                </td>
                <td className="px-4 py-3">
                  {isRecoverable && (
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={retryMutation.isPending && retryMutation.variables === contract.id}
                      onClick={(e) => {
                        e.stopPropagation()
                        retryMutation.mutate(contract.id, {
                          onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
                        })
                      }}
                    >
                      <RefreshCw className="h-3 w-3" aria-hidden="true" />
                      {contract.status === 'error' ? 'Retry' : 'Resume'}
                    </Button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
