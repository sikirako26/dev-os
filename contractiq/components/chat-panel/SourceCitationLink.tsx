'use client'

import { useUiStore } from '@/stores/ui-store'

export function SourceCitationLink({ page }: { page: number }) {
  const setTargetPage = useUiStore((s) => s.setTargetPage)

  return (
    <button
      type="button"
      onClick={() => setTargetPage(page)}
      className="font-medium text-blue-500 underline decoration-blue-200 underline-offset-2 hover:text-blue-600"
    >
      [Page {page}]
    </button>
  )
}
