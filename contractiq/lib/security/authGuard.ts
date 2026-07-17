import { NextResponse } from 'next/server'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase/server'

export interface AuthContext {
  user: User
  supabase: SupabaseClient
}

const UNAUTHENTICATED = NextResponse.json(
  { error: { code: 'unauthenticated', message: 'Sign in required' } },
  { status: 401 }
)

/**
 * Verifies the request carries a valid Supabase session. Returns the caller's
 * response directly on failure so route handlers can `return` it unchanged:
 *
 *   const auth = await requireAuth()
 *   if (auth instanceof NextResponse) return auth
 *   const { user, supabase } = auth
 */
export async function requireAuth(): Promise<AuthContext | NextResponse> {
  const supabase = createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return UNAUTHENTICATED

  return { user, supabase }
}
