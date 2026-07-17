import { z } from 'zod'

export const feedbackRequestSchema = z.object({
  rating: z.enum(['up', 'down']),
  comment: z.string().trim().max(1000).optional(),
})
