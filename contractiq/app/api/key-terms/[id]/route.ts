import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/security/authGuard'
import { verifyKeyTermOwnership } from '@/lib/security/chatSecurity'

const patchSchema = z.object({ value: z.string().trim().min(1).max(2000) })

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { user, supabase } = auth

  const body = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'invalid_request', message: 'value is required' } },
      { status: 422 }
    )
  }

  const ownedTerm = await verifyKeyTermOwnership(supabase, params.id, user.id)
  if (!ownedTerm) {
    return NextResponse.json(
      { error: { code: 'not_found', message: 'Term not found' } },
      { status: 404 }
    )
  }

  // Try key_terms first, then custom_key_terms — a term id belongs to exactly one table.
  const existingKeyTerm = ownedTerm.table === 'key_terms' ? { id: params.id, value: ownedTerm.value } : null

  if (existingKeyTerm) {
    const { data: updated, error: updateError } = await supabase
      .from('key_terms')
      .update({ value: parsed.data.value, is_edited: true })
      .eq('id', params.id)
      .select('id, value, is_edited')
      .single()

    if (updateError) {
      return NextResponse.json(
        { error: { code: 'internal_error', message: 'Failed to save edit' } },
        { status: 500 }
      )
    }

    await supabase.from('term_corrections').insert({
      key_term_id: params.id,
      original_value: existingKeyTerm.value,
      corrected_value: parsed.data.value,
    })

    return NextResponse.json(updated)
  }

  const { data: updated, error: updateError } = await supabase
    .from('custom_key_terms')
    .update({ value: parsed.data.value, is_edited: true })
    .eq('id', params.id)
    .select('id, value, is_edited')
    .single()

  if (updateError) {
    return NextResponse.json(
      { error: { code: 'internal_error', message: 'Failed to save edit' } },
      { status: 500 }
    )
  }

  await supabase.from('term_corrections').insert({
    custom_key_term_id: params.id,
    original_value: ownedTerm.value ?? '',
    corrected_value: parsed.data.value,
  })

  return NextResponse.json(updated)
}
