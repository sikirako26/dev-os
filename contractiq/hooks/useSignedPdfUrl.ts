'use client'

import { useQuery } from '@tanstack/react-query'
import { createBrowserClient } from '@/lib/supabase/client'

const SIGNED_URL_TTL_SECONDS = 60 * 60 // 1 hour, per pdf-upload-extraction.md / results-display.md

async function fetchSignedUrl(filePath: string): Promise<string> {
  const supabase = createBrowserClient()
  const { data, error } = await supabase.storage
    .from('contracts')
    .createSignedUrl(filePath, SIGNED_URL_TTL_SECONDS)

  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? 'Failed to generate a signed URL for this PDF')
  }
  return data.signedUrl
}

export function useSignedPdfUrl(filePath: string | null) {
  return useQuery({
    queryKey: ['signedPdfUrl', filePath],
    queryFn: () => fetchSignedUrl(filePath!),
    enabled: !!filePath,
    staleTime: 50 * 60 * 1000, // refresh well before the 1-hour expiry
  })
}
