import { z } from 'zod'
import { MAX_CUSTOM_TERMS } from '@/lib/contracts/standardTerms'

export const customTermsRequestSchema = z.object({
  terms: z.array(z.string().trim().min(1).max(80)).max(MAX_CUSTOM_TERMS),
})
