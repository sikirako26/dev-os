'use client'

import { useEffect, useMemo, useRef } from 'react'
import { cn } from '@/lib/utils'

interface PageSection {
  pageNumber: number
  text: string
}

function splitIntoPages(contractText: string): PageSection[] {
  const parts = contractText.split(/\[PAGE (\d+)\]/)
  const pages: PageSection[] = []
  // parts alternates: [preamble, pageNum, pageText, pageNum, pageText, ...]
  for (let i = 1; i < parts.length; i += 2) {
    pages.push({ pageNumber: Number(parts[i]), text: parts[i + 1]?.trim() ?? '' })
  }
  return pages
}

export function TextViewerFallback({
  contractText,
  targetPage,
}: {
  contractText: string
  targetPage: number | null
}) {
  const pages = useMemo(() => splitIntoPages(contractText), [contractText])
  const pageRefs = useRef<Record<number, HTMLElement | null>>({})

  useEffect(() => {
    if (targetPage === null) return
    const el = pageRefs.current[targetPage]
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [targetPage])

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-6">
      {pages.map((page) => (
        <section
          key={page.pageNumber}
          id={`page-${page.pageNumber}`}
          ref={(el) => {
            pageRefs.current[page.pageNumber] = el
          }}
          className={cn(
            'flex flex-col gap-2 rounded-lg border p-4 transition-colors duration-300 ease-in-out',
            targetPage === page.pageNumber
              ? 'border-blue-500 bg-blue-50'
              : 'border-grey-100 bg-white'
          )}
        >
          <span className="text-body-sm font-medium text-grey-500">Page {page.pageNumber}</span>
          <p className="whitespace-pre-wrap text-body-sm text-grey-900">{page.text}</p>
        </section>
      ))}
    </div>
  )
}
