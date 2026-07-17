import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/security/authGuard'
import { verifyContractOwnership } from '@/lib/security/chatSecurity'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { user, supabase } = auth

  const contract = await verifyContractOwnership(supabase, params.id, user.id)

  if (!contract) {
    return NextResponse.json(
      { error: { code: 'not_found', message: 'Contract not found' } },
      { status: 404 }
    )
  }

  await supabase.from('contracts').update({ last_accessed_at: new Date().toISOString() }).eq('id', params.id)

  const { data: keyTerms } = await supabase
    .from('key_terms')
    .select('*')
    .eq('contract_id', params.id)
    .order('created_at', { ascending: true })

  const { data: customKeyTerms } = await supabase
    .from('custom_key_terms')
    .select('*')
    .eq('contract_id', params.id)
    .order('created_at', { ascending: true })

  return NextResponse.json({
    contract,
    key_terms: keyTerms ?? [],
    custom_key_terms: customKeyTerms ?? [],
  })
}
