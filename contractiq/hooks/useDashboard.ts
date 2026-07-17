'use client'

import { useQuery } from '@tanstack/react-query'
import { createBrowserClient } from '@/lib/supabase/client'
import type { Contract } from '@/types'

export interface DashboardData {
  total: number
  byType: Record<string, number>
  contracts: Contract[]
}

async function fetchDashboard(): Promise<DashboardData> {
  const supabase = createBrowserClient()
  const { data, error } = await supabase
    .from('contracts')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error

  const contracts = (data ?? []) as Contract[]
  const byType = contracts.reduce<Record<string, number>>((acc, c) => {
    acc[c.contract_type] = (acc[c.contract_type] ?? 0) + 1
    return acc
  }, {})

  return { total: contracts.length, byType, contracts }
}

export function useDashboard(userId: string | null) {
  return useQuery({
    queryKey: ['dashboard', userId],
    queryFn: fetchDashboard,
    enabled: !!userId,
    staleTime: 30_000,
  })
}
