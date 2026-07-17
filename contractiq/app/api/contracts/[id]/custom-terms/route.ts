import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/security/authGuard'
import { verifyContractOwnership } from '@/lib/security/chatSecurity'
import { customTermsRequestSchema } from '@/lib/security/inputValidator'
import { MAX_CUSTOM_TERMS } from '@/lib/contracts/standardTerms'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { user, supabase } = auth

  const body = await req.json().catch(() => null)
  const parsed = customTermsRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'invalid_request', message: 'Invalid term list' } },
      { status: 422 }
    )
  }

  const contract = await verifyContractOwnership(supabase, params.id, user.id)

  if (!contract) {
    return NextResponse.json(
      { error: { code: 'not_found', message: 'Contract not found' } },
      { status: 404 }
    )
  }

  if (contract.status !== 'uploaded') {
    return NextResponse.json(
      { error: { code: 'invalid_state', message: 'Contract already processed' } },
      { status: 409 }
    )
  }

  const { count } = await supabase
    .from('custom_key_terms')
    .select('id', { count: 'exact', head: true })
    .eq('contract_id', params.id)

  if ((count ?? 0) + parsed.data.terms.length > MAX_CUSTOM_TERMS) {
    return NextResponse.json(
      { error: { code: 'limit_exceeded', message: 'Up to 5 custom terms per analysis' } },
      { status: 400 }
    )
  }

  const { data: inserted, error: insertError } = await supabase
    .from('custom_key_terms')
    .insert(
      parsed.data.terms.map((term_name) => ({
        contract_id: params.id,
        term_name,
        is_manual: true,
      }))
    )
    .select('id, term_name')

  if (insertError) {
    return NextResponse.json(
      { error: { code: 'internal_error', message: 'Failed to register custom terms' } },
      { status: 500 }
    )
  }

  return NextResponse.json({ terms: inserted })
}
