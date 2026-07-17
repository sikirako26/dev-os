import { NextRequest, NextResponse } from 'next/server'
import { encode } from 'gpt-tokenizer'
import { requireAuth } from '@/lib/security/authGuard'
import { checkRateLimit, rateLimitedResponse, RATE_LIMITS } from '@/lib/security/rateLimiter'
import { uploadRequestSchema, validateFileUpload } from '@/lib/security/inputValidator'
import { MAX_PAGES, MAX_TOKENS, MIN_WORDS } from '@/lib/security/tokenLimiter'
import { parseContract } from '@/lib/pdf/parseContract'

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { user, supabase } = auth

  const rateLimit = await checkRateLimit(
    user.id,
    RATE_LIMITS.contractUpload.action,
    RATE_LIMITS.contractUpload.limit,
    RATE_LIMITS.contractUpload.windowMs
  )
  if (!rateLimit.allowed) return rateLimitedResponse(rateLimit.retryAfterSeconds)

  const formData = await req.formData()
  const file = formData.get('file')
  const parsed = uploadRequestSchema.safeParse({ contract_type: formData.get('contract_type') })

  if (!(file instanceof File) || !parsed.success) {
    return NextResponse.json(
      { error: { code: 'invalid_request', message: 'file and contract_type are required' } },
      { status: 422 }
    )
  }

  const fileCheck = validateFileUpload(file)
  if (!fileCheck.valid) {
    const status = fileCheck.code === 'file_too_large' ? 413 : fileCheck.code === 'blocked_extension' ? 400 : 415
    return NextResponse.json({ error: { code: fileCheck.code, message: fileCheck.message } }, { status })
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  let parsedPdf
  try {
    parsedPdf = await parseContract(buffer)
  } catch {
    return NextResponse.json(
      { error: { code: 'internal_error', message: 'Failed to read the PDF file' } },
      { status: 500 }
    )
  }

  const { text, pageCount } = parsedPdf
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length

  if (wordCount < MIN_WORDS) {
    return NextResponse.json(
      {
        error: {
          code: 'unsupported_scanned_pdf',
          message: 'Scanned PDFs are not supported yet',
        },
      },
      { status: 422 }
    )
  }

  const tokenCount = encode(text).length

  if (pageCount > MAX_PAGES || tokenCount > MAX_TOKENS) {
    return NextResponse.json(
      {
        error: {
          code: 'contract_too_long',
          message: 'Contract exceeds the 20-page / 15,000-token limit',
        },
      },
      { status: 422 }
    )
  }

  const contractId = crypto.randomUUID()
  const safeFileName = file.name.replace(/[/\\]/g, '_')
  // Object key inside the 'contracts' bucket — must start with {user_id} to match
  // the storage.foldername(name)[1] = auth.uid() RLS policy in database.sql.
  const filePath = `${user.id}/${contractId}/${safeFileName}`

  let storedPath: string | null = filePath
  const { error: storageError } = await supabase.storage
    .from('contracts')
    .upload(filePath, buffer, { contentType: 'application/pdf' })

  if (storageError) {
    storedPath = null
  }

  const { error: insertError } = await supabase.from('contracts').insert({
    id: contractId,
    user_id: user.id,
    contract_type: parsed.data.contract_type,
    file_path: storedPath,
    contract_text: text,
    status: 'uploaded',
    page_count: pageCount,
    token_count: tokenCount,
  })

  if (insertError) {
    return NextResponse.json(
      { error: { code: 'internal_error', message: 'Failed to save contract' } },
      { status: 500 }
    )
  }

  return NextResponse.json({
    contract_id: contractId,
    status: 'uploaded',
    page_count: pageCount,
    token_count: tokenCount,
  })
}
