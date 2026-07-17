import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Explicit ownership check, in addition to RLS, so a misconfigured policy or
 * an admin-client code path can never silently leak another user's contract.
 * Returns the contract row on success, `null` on any mismatch — callers
 * should map `null` to 404 (never reveal whether the id exists for someone else).
 */
export async function verifyContractOwnership(
  supabase: SupabaseClient,
  contractId: string,
  userId: string
) {
  const { data } = await supabase
    .from('contracts')
    .select('*')
    .eq('id', contractId)
    .eq('user_id', userId)
    .single()

  return data
}

export async function verifySessionOwnership(
  supabase: SupabaseClient,
  sessionId: string,
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('chat_sessions')
    .select('id')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .maybeSingle()

  return !!data
}

/**
 * Ownership check for key_terms / custom_key_terms rows, which don't carry
 * user_id directly — ownership is derived through the parent contract.
 */
export async function verifyKeyTermOwnership(
  supabase: SupabaseClient,
  termId: string,
  userId: string
): Promise<{ table: 'key_terms' | 'custom_key_terms'; value: string | null } | null> {
  const { data: keyTerm } = await supabase
    .from('key_terms')
    .select('id, value, contracts!inner(user_id)')
    .eq('id', termId)
    .eq('contracts.user_id', userId)
    .maybeSingle()

  if (keyTerm) return { table: 'key_terms', value: keyTerm.value as string }

  const { data: customTerm } = await supabase
    .from('custom_key_terms')
    .select('id, value, contracts!inner(user_id)')
    .eq('id', termId)
    .eq('contracts.user_id', userId)
    .maybeSingle()

  if (customTerm) return { table: 'custom_key_terms', value: (customTerm.value as string) ?? null }

  return null
}
