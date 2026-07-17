import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/security/authGuard'
import { verifyContractOwnership } from '@/lib/security/chatSecurity'
import { feedbackRequestSchema } from '@/lib/security/inputValidator'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { user, supabase } = auth

  const parsed = feedbackRequestSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'invalid_request', message: 'rating must be "up" or "down"' } },
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

  const { data: inserted, error: insertError } = await supabase
    .from('user_feedback')
    .insert({
      user_id: user.id,
      contract_id: params.id,
      rating: parsed.data.rating,
      comment: parsed.data.comment ?? null,
    })
    .select('id')
    .single()

  if (insertError) {
    return NextResponse.json(
      { error: { code: 'internal_error', message: 'Failed to submit feedback' } },
      { status: 500 }
    )
  }

  return NextResponse.json(inserted)
}
