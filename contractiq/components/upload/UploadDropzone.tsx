'use client'

import { useCallback, useRef, useState, type DragEvent } from 'react'
import { UploadCloud, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { InlineError } from '@/components/ui/InlineError'
import { MAX_FILE_BYTES } from '@/lib/validation/uploadSchema'

const MAX_FILE_MB = MAX_FILE_BYTES / (1024 * 1024)

function validateFile(file: File): string | null {
  if (file.type !== 'application/pdf') return 'Only PDF files are supported'
  if (file.size > MAX_FILE_BYTES) return `File must be ${MAX_FILE_MB}MB or smaller`
  return null
}

export function UploadDropzone({
  onFileSelected,
  disabled,
  progress,
}: {
  onFileSelected: (file: File) => void
  disabled?: boolean
  progress: number | null
}) {
  const [isDragging, setIsDragging] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(
    (file: File) => {
      const err = validateFile(file)
      if (err) {
        setValidationError(err)
        return
      }
      setValidationError(null)
      onFileSelected(file)
    },
    [onFileSelected]
  )

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragging(false)
    if (disabled) return
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          if (!disabled) setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-disabled={disabled}
        className={cn(
          'flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-12 text-center transition-colors duration-150 ease-out',
          disabled ? 'cursor-not-allowed border-grey-100 bg-grey-25' : 'cursor-pointer',
          isDragging && !disabled ? 'border-blue-500 bg-blue-50' : 'border-grey-200 bg-white'
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          disabled={disabled}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleFile(file)
            e.target.value = ''
          }}
        />
        {progress !== null ? (
          <>
            <FileText className="h-8 w-8 text-blue-500" aria-hidden="true" />
            <p className="text-body-lg font-medium text-grey-900">Uploading… {progress}%</p>
            <div className="h-2 w-full max-w-xs overflow-hidden rounded-full bg-grey-100">
              <div
                className="h-full rounded-full bg-blue-500 transition-all duration-200 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </>
        ) : (
          <>
            <UploadCloud className="h-8 w-8 text-grey-300" aria-hidden="true" />
            <p className="text-body-lg font-medium text-grey-900">
              Drag & drop your PDF, or click to browse
            </p>
            <p className="text-body-sm text-grey-500">PDF only, up to {MAX_FILE_MB}MB, 20 pages</p>
          </>
        )}
      </div>
      {validationError && <InlineError message={validationError} />}
    </div>
  )
}
