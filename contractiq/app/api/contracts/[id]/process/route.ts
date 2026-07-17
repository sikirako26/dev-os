import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/security/authGuard'
import { verifyContractOwnership } from '@/lib/security/chatSecurity'
import { checkRateLimit, rateLimitedResponse, RATE_LIMITS } from '@/lib/security/rateLimiter'
import { buildExtractionPrompt } from '@/lib/openai/buildExtractionPrompt'
import { callExtraction } from '@/lib/openai/client'
import type { ContractType } from '@/types'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
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

  const rateLimit = await checkRateLimit(
    user.id,
    RATE_LIMITS.contractProcessing.action,
    RATE_LIMITS.contractProcessing.limit,
    RATE_LIMITS.contractProcessing.windowMs
  )
  if (!rateLimit.allowed) return rateLimitedResponse(rateLimit.retryAfterSeconds)

  if (!['uploaded', 'error'].includes(contract.status)) {
    return NextResponse.json(
      { error: { code: 'invalid_state', message: 'Contract already processed or in progress' } },
      { status: 409 }
    )
  }

  await supabase.from('contracts').update({ status: 'processing' }).eq('id', params.id)

  const { data: customTermRows } = await supabase
    .from('custom_key_terms')
    .select('term_name')
    .eq('contract_id', params.id)

  const customTermNames = (customTermRows ?? []).map((t) => t.term_name as string)

  const { system, user: userPrompt } = buildExtractionPrompt({
    contractType: contract.contract_type as ContractType,
    contractText: contract.contract_text as string,
    customTerms: customTermNames,
  })

  try {
    const extracted = await callExtraction(system, userPrompt)

    const customTermNameSet = new Set(customTermNames)
    const standardExtracted = extracted.filter((t) => !customTermNameSet.has(t.term_name))
    const customExtracted = extracted.filter((t) => customTermNameSet.has(t.term_name))

    // Idempotent: clear any prior terms before inserting (covers retry-after-error)
    await supabase.from('key_terms').delete().eq('contract_id', params.id)

    const { data: insertedKeyTerms, error: keyTermsError } = await supabase
      .from('key_terms')
      .insert(
        standardExtracted.map((t) => ({
          contract_id: params.id,
          term_name: t.term_name,
          value: t.value,
          original_value: t.value,
          page_number: t.page_number,
          confidence_score: t.confidence_score,
          source_sentence: t.source_sentence || null,
        }))
      )
      .select()

    if (keyTermsError) throw keyTermsError

    for (const t of customExtracted) {
      await supabase
        .from('custom_key_terms')
        .update({
          value: t.value,
          original_value: t.value,
          page_number: t.page_number,
          confidence_score: t.confidence_score,
          source_sentence: t.source_sentence || null,
        })
        .eq('contract_id', params.id)
        .eq('term_name', t.term_name)
    }

    await supabase.from('contracts').update({ status: 'complete' }).eq('id', params.id)

    const { data: customKeyTerms } = await supabase
      .from('custom_key_terms')
      .select('*')
      .eq('contract_id', params.id)

    return NextResponse.json({
      status: 'complete',
      key_terms: insertedKeyTerms,
      custom_key_terms: customKeyTerms,
    })
  } catch {
    await supabase.from('contracts').update({ status: 'error' }).eq('id', params.id)
    return NextResponse.json(
      { error: { code: 'extraction_failed', message: 'Extraction failed after retries' } },
      { status: 502 }
    )
  }
}
