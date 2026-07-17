import { KeyTermRow, type KeyTermRowData } from '@/components/key-terms-panel/KeyTermRow'

export function KeyTermsPanel({
  terms,
  contractId,
}: {
  terms: KeyTermRowData[]
  contractId: string
}) {
  if (terms.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-grey-200 p-12 text-center">
        <p className="text-body-lg font-medium text-grey-900">No key terms yet</p>
        <p className="text-body-sm text-grey-500">Process the contract to extract key terms.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {terms.map((term) => (
        <KeyTermRow key={term.id} term={term} contractId={contractId} />
      ))}
    </div>
  )
}
