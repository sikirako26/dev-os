import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const RATE_LIMITS = {
  chat: { action: 'chat', limit: 30, windowMs: 60_000 },
  contractProcessing: { action: 'contract_processing', limit: 5, windowMs: 60 * 60_000 },
  contractUpload: { action: 'contract_upload', limit: 20, windowMs: 24 * 60 * 60_000 },
} as const

export interface RateLimitResult {
  allowed: boolean
  retryAfterSeconds: number
}

/**
 * Sliding-window rate limit backed by rate_limit_events. Uses the admin
 * (service-role) client so a user can never inflate or clear their own
 * counters — the table has no user-facing RLS policies.
 */
export async function checkRateLimit(
  userId: string,
  action: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  const admin = createAdminClient()
  const windowStart = new Date(Date.now() - windowMs).toISOString()

  const { count } = await admin
    .from('rate_limit_events')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('action', action)
    .gte('created_at', windowStart)

  if ((count ?? 0) >= limit) {
    return { allowed: false, retryAfterSeconds: Math.ceil(windowMs / 1000) }
  }

  await admin.from('rate_limit_events').insert({ user_id: userId, action })
  return { allowed: true, retryAfterSeconds: 0 }
}

export function rateLimitedResponse(retryAfterSeconds: number) {
  return NextResponse.json(
    { error: { code: 'rate_limited', message: 'Too many requests. Please try again later.' } },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } }
  )
}
