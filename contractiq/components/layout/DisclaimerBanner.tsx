import { Info } from 'lucide-react'

export function DisclaimerBanner() {
  return (
    <div className="flex items-center gap-2 rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-body-sm text-yellow-800">
      <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>
        ContractIQ provides AI-assisted analysis for informational purposes only. It is not legal
        advice.
      </span>
    </div>
  )
}
