'use client'

import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { ZoomIn, ZoomOut, Download } from 'lucide-react'
import { useSignedPdfUrl } from '@/hooks/useSignedPdfUrl'
import { useUiStore } from '@/stores/ui-store'
import { Spinner } from '@/components/ui/Spinner'
import { InlineError } from '@/components/ui/InlineError'
import { Button } from '@/components/ui/Button'

function PdfPage({
  pdfDoc,
  pageNumber,
  zoom,
  registerRef,
}: {
  pdfDoc: PDFDocumentProxy
  pageNumber: number
  zoom: number
  registerRef: (pageNumber: number, el: HTMLDivElement | null) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    let cancelled = false

    async function render() {
      const page = await pdfDoc.getPage(pageNumber)
      if (cancelled) return
      const viewport = page.getViewport({ scale: zoom * 1.5 })
      const canvas = canvasRef.current
      if (!canvas) return
      canvas.width = viewport.width
      canvas.height = viewport.height
      const context = canvas.getContext('2d')
      if (!context) return
      await page.render({ canvasContext: context, viewport }).promise
    }

    render()
    return () => {
      cancelled = true
    }
  }, [pdfDoc, pageNumber, zoom])

  return (
    <div
      id={`pdf-page-${pageNumber}`}
      ref={(el) => registerRef(pageNumber, el)}
      className="mb-4 border border-grey-100 shadow-sm"
    >
      <canvas ref={canvasRef} />
    </div>
  )
}

export function PdfViewer({
  filePath,
  targetPage,
}: {
  filePath: string
  targetPage: number | null
}) {
  const { data: signedUrl, isLoading: isLoadingUrl, isError: isUrlError } = useSignedPdfUrl(filePath)
  const zoom = useUiStore((s) => s.zoom)
  const setZoom = useUiStore((s) => s.setZoom)
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({})

  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null)
  const [numPages, setNumPages] = useState(0)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    if (!signedUrl) return
    let cancelled = false
    setLoadError(false)

    async function load() {
      try {
        const pdfjsLib = await import('pdfjs-dist')
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`
        const doc = await pdfjsLib.getDocument(signedUrl as string).promise
        if (cancelled) return
        setPdfDoc(doc)
        setNumPages(doc.numPages)
      } catch {
        if (!cancelled) setLoadError(true)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [signedUrl])

  useEffect(() => {
    if (targetPage === null) return
    pageRefs.current[targetPage]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [targetPage, numPages])

  if (isLoadingUrl || (!pdfDoc && !loadError)) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }

  if (isUrlError || loadError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <InlineError message="This PDF couldn't be rendered." />
        {signedUrl && (
          <a
            href={signedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-body-sm font-medium text-blue-500 hover:text-blue-600"
          >
            Download PDF
          </a>
        )}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-end gap-2 border-b border-grey-100 p-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}
          aria-label="Zoom out"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <span className="text-body-sm text-grey-500">{Math.round(zoom * 100)}%</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setZoom(Math.min(2, zoom + 0.25))}
          aria-label="Zoom in"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        {signedUrl && (
          <a
            href={signedUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Download PDF"
            className="ml-2 text-grey-500 hover:text-grey-900"
          >
            <Download className="h-4 w-4" />
          </a>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {pdfDoc &&
          Array.from({ length: numPages }, (_, i) => i + 1).map((pageNumber) => (
            <PdfPage
              key={pageNumber}
              pdfDoc={pdfDoc}
              pageNumber={pageNumber}
              zoom={zoom}
              registerRef={(p, el) => {
                pageRefs.current[p] = el
              }}
            />
          ))}
      </div>
    </div>
  )
}
