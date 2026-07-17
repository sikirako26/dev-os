import { z } from 'zod'
import { MAX_FILE_BYTES, MAX_PAGES, MAX_TOKENS, MIN_WORDS } from '@/lib/security/tokenLimiter'

export const uploadRequestSchema = z.object({
  contract_type: z.enum(['NDA', 'MSA']),
})

export { MAX_FILE_BYTES, MAX_PAGES, MAX_TOKENS, MIN_WORDS }
