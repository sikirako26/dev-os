import { MAX_FILE_BYTES } from '@/lib/security/tokenLimiter'

export { uploadRequestSchema } from '@/lib/validation/uploadSchema'
export { customTermsRequestSchema } from '@/lib/validation/customTermsSchema'
export { feedbackRequestSchema } from '@/lib/validation/feedbackSchema'

const ALLOWED_EXTENSIONS = ['.pdf']
const BLOCKED_EXTENSIONS = [
  '.exe', '.js', '.mjs', '.cjs', '.php', '.zip', '.sh', '.bat', '.cmd', '.py', '.rb', '.ps1',
]
const ALLOWED_MIME_TYPES = ['application/pdf']

export type FileValidationCode =
  | 'blocked_extension'
  | 'unsupported_extension'
  | 'unsupported_media_type'
  | 'file_too_large'

export interface FileValidationResult {
  valid: boolean
  code?: FileValidationCode
  message?: string
}

/**
 * Validates an upload in order: extension (blocklist, then allowlist), MIME
 * type, then size. Extension/MIME are both attacker-controlled (a spoofed
 * Content-Type is trivial), so this is a defense-in-depth check, not the
 * only line of defense — parseContract() will still reject non-PDF bytes.
 */
export function validateFileUpload(file: File): FileValidationResult {
  const name = file.name.toLowerCase()
  const dot = name.lastIndexOf('.')
  const ext = dot >= 0 ? name.slice(dot) : ''

  if (BLOCKED_EXTENSIONS.includes(ext)) {
    return { valid: false, code: 'blocked_extension', message: 'This file type is not allowed' }
  }

  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return { valid: false, code: 'unsupported_extension', message: 'Only PDF files are supported' }
  }

  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return { valid: false, code: 'unsupported_media_type', message: 'Only PDF files are supported' }
  }

  if (file.size > MAX_FILE_BYTES) {
    return { valid: false, code: 'file_too_large', message: 'File must be 10MB or smaller' }
  }

  return { valid: true }
}
