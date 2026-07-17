'use client'

import { useParams } from 'next/navigation'
import { useState } from 'react'
import { ContractViewer } from '@/components/contract-viewer/ContractViewer'
import { KeyTermsPanel } from '@/components/key-terms-panel/KeyTermsPanel'
import { DisclaimerBanner } from '@/components/layout/DisclaimerBanner'
import { ChatPanel } from '@/components/chat-panel/ChatPanel'
import { FeedbackWidget } from '@/components/feedback/FeedbackWidget'
import { Skeleton } from '@/components/ui/Skeleton'
import { InlineError } from '@/components/ui/InlineError'
import { Spinner } from '@/components/ui/Spinner'
import { cn } from '@/lib/utils'
import { useContract } from '@/hooks/useContract'

type Tab = 'pdf' | 'terms' | 'chat'

export default function ContractResultsPage() {
  const params = useParams<{ id: string }>()
  const contractId = params.id
  const { data, isLoading, isError, error } = useContract(contractId)
  const [activeTab, setActiveTab] = useState<Tab>('pdf')

  if (isLoading) {
    return (
      <main className="flex flex-col gap-4 p-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Skeleton className="h-[600px] w-full" />
          <Skeleton className="h-[600px] w-full" />
        </div>
      </main>
    )
  }

  if (isError || !data) {
    return (
      <main className="p-6">
        <InlineError message={error instanceof Error ? error.message : 'Contract not found'} />
      </main>
    )
  }

  const { contract, key_terms, custom_key_terms } = data
  const allTerms = [...key_terms, ...custom_key_terms]

  if (contract.status === 'processing') {
    return (
      <main className="flex flex-col items-center justify-center gap-4 p-24 text-center">
        <Spinner className="h-8 w-8" />
        <p className="text-body-lg font-medium text-grey-900">Processing your contract…</p>
        <p className="text-body-sm text-grey-500">This page will update automatically.</p>
      </main>
    )
  }

  if (contract.status === 'error') {
    return (
      <main className="p-6">
        <InlineError message="Extraction failed for this contract. Retry from the dashboard." />
      </main>
    )
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'pdf', label: 'PDF' },
    { key: 'terms', label: 'Key Terms' },
    { key: 'chat', label: 'Chat' },
  ]

  return (
    <main className="flex flex-col gap-4 p-4 md:p-6">
      <DisclaimerBanner />

      <div className="flex md:hidden">
        <div className="flex gap-1 rounded-md border border-grey-100 p-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'rounded-sm px-3 py-1.5 text-body-sm font-medium transition-colors duration-100 ease-out',
                activeTab === tab.key ? 'bg-blue-500 text-white' : 'text-grey-500 hover:text-grey-900'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-2">
        <div className={cn('h-[70vh] rounded-lg border border-grey-100', activeTab !== 'pdf' && 'hidden md:block')}>
          <ContractViewer contract={contract} />
        </div>

        <div className={cn('flex flex-col gap-6', activeTab !== 'terms' && 'hidden md:flex')}>
          <KeyTermsPanel terms={allTerms} contractId={contractId} />
        </div>
      </div>

      <div className={cn('flex flex-col gap-4', activeTab !== 'chat' && 'hidden md:flex')}>
        <ChatPanel contractId={contractId} contractStatus={contract.status} />
      </div>

      <FeedbackWidget contractId={contractId} />
    </main>
  )
}
