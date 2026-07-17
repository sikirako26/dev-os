import { createClient } from '@supabase/supabase-js'

/**
 * Service-role client — bypasses RLS. Only use for operations that must run
 * outside the requesting user's row-level permissions (e.g. rate-limit bookkeeping).
 * Never expose this client or its key to the browser.
 */
export function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
