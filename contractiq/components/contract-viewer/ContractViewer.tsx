'use client'

import { PdfViewer } from '@/components/contract-viewer/PdfViewer'
import { TextViewerFallback } from '@/components/contract-viewer/TextViewerFallback'
import { useUiStore } from '@/stores/ui-store'
import type { Contract } from '@/types'

export function ContractViewer({ contract }: { contract: Contract }) {
  const targetPage = useUiStore((s) => s.targetPage)

  if (contract.file_path) {
    return <PdfViewer filePath={contract.file_path} targetPage={targetPage} />
  }

  return <TextViewerFallback contractText={contract.contract_text} targetPage={targetPage} />
}
