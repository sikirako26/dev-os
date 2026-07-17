import pdfParse from 'pdf-parse'

interface PdfPageData {
  getTextContent: () => Promise<{ items: Array<{ str: string }> }>
}

export interface ParsedContract {
  /** Full extracted text with 1-indexed [PAGE N] markers inserted at each page boundary. */
  text: string
  pageCount: number
}

/**
 * Parses a PDF buffer into text with [PAGE N] markers. Markers are inserted during
 * pdf-parse's per-page render callback (not by post-processing flattened text) —
 * that's the only point at which real page boundaries are known.
 */
export async function parseContract(buffer: Buffer): Promise<ParsedContract> {
  let pageCount = 0
  const pageTexts: string[] = []

  await pdfParse(buffer, {
    pagerender: async (pageData: PdfPageData) => {
      const textContent = await pageData.getTextContent()
      const pageText = textContent.items.map((item) => item.str).join(' ')
      pageCount += 1
      pageTexts.push(`[PAGE ${pageCount}]\n${pageText}`)
      return pageText
    },
  })

  return { text: pageTexts.join('\n\n'), pageCount }
}
