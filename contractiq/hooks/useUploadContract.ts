'use client'

import { useMutation } from '@tanstack/react-query'
import type { ContractType } from '@/types'

export interface UploadResponse {
  contract_id: string
  status: string
  page_count: number
  token_count: number
}

interface UploadArgs {
  file: File
  contractType: ContractType
  onProgress?: (percent: number) => void
}

function uploadWithProgress({ file, contractType, onProgress }: UploadArgs): Promise<UploadResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const formData = new FormData()
    formData.append('file', file)
    formData.append('contract_type', contractType)

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100))
      }
    })

    xhr.addEventListener('load', () => {
      let body: unknown = null
      try {
        body = JSON.parse(xhr.responseText)
      } catch {
        // fall through to generic error below
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body as UploadResponse)
      } else {
        const message =
          (body as { error?: { message?: string } })?.error?.message ?? 'Upload failed'
        reject(new Error(message))
      }
    })

    xhr.addEventListener('error', () => reject(new Error('Network error during upload')))
    xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')))

    xhr.open('POST', '/api/contracts/upload')
    xhr.send(formData)
  })
}

export function useUploadContract() {
  return useMutation({
    mutationFn: uploadWithProgress,
  })
}
