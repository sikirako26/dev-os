import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/security/authGuard'
import { verifyContractOwnership } from '@/lib/security/chatSecurity'
import { checkRateLimit, rateLimitedResponse, RATE_LIMITS } from '@/lib/security/rateLimiter'
import { sanitizeForLLM } from '@/lib/security/promptInjectionGuard'
import { MAX_MESSAGE_LENGTH, MAX_CHAT_HISTORY } from '@/lib/security/tokenLimiter'
import { buildChatPrompt, selectHistoryForContext } from '@/lib/openai/buildChatPrompt'
import { callChat } from '@/lib/openai/client'
import { classifyChatQuery } from '@/lib/openai/classifyChatQuery'

const chatRequestSchema = z.object({ message: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH) })
const HISTORY_LIMIT = MAX_CHAT_HISTORY

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { user, supabase } = auth

  const parsed = chatRequestSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'invalid_request', message: 'message is required' } },
      { status: 422 }
    )
  }

  const sanitizeResult = sanitizeForLLM(parsed.data.message)
  if (!sanitizeResult.safe) {
    return NextResponse.json(
      { error: { code: 'prompt_injection', message: 'This message could not be processed' } },
      { status: 400 }
    )
  }

  const rateLimit = await checkRateLimit(
    user.id,
    RATE_LIMITS.chat.action,
    RATE_LIMITS.chat.limit,
    RATE_LIMITS.chat.windowMs
  )
  if (!rateLimit.allowed) return rateLimitedResponse(rateLimit.retryAfterSeconds)

  const contract = await verifyContractOwnership(supabase, params.id, user.id)

  if (!contract) {
    return NextResponse.json(
      { error: { code: 'not_found', message: 'Contract not found' } },
      { status: 404 }
    )
  }

  if (contract.status !== 'complete') {
    return NextResponse.json(
      { error: { code: 'invalid_state', message: 'Contract has not finished processing' } },
      { status: 409 }
    )
  }

  let { data: session } = await supabase
    .from('chat_sessions')
    .select('id')
    .eq('contract_id', params.id)
    .maybeSingle()

  if (!session) {
    const { data: created, error: createError } = await supabase
      .from('chat_sessions')
      .insert({ contract_id: params.id, user_id: user.id })
      .select('id')
      .single()
    if (createError || !created) {
      return NextResponse.json(
        { error: { code: 'internal_error', message: 'Failed to start chat session' } },
        { status: 500 }
      )
    }
    session = created
  }

  // History must be loaded before the new user message is saved below —
  // otherwise the classifier and the LLM context would see the new message
  // as part of its own history (see contract-chat.md §1.5b-c).
  const { data: history } = await supabase
    .from('chat_messages')
    .select('role, content')
    .eq('session_id', session.id)
    .order('created_at', { ascending: true })
    .limit(HISTORY_LIMIT)

  const contextType = classifyChatQuery(parsed.data.message)

  const { data: userMessage, error: userInsertError } = await supabase
    .from('chat_messages')
    .insert({ session_id: session.id, role: 'user', content: parsed.data.message })
    .select()
    .single()

  if (userInsertError) {
    return NextResponse.json(
      { error: { code: 'internal_error', message: 'Failed to save message' } },
      { status: 500 }
    )
  }

  try {
    const typedHistory = (history ?? []) as { role: 'user' | 'assistant'; content: string }[]
    const historyForContext = selectHistoryForContext(typedHistory, contextType)
    const contractTextForContext = contextType === 'history' ? '' : contract.contract_text
    const systemPrompt = buildChatPrompt({ contextType, contractText: contractTextForContext })
    const { content, pageCitation } = await callChat(
      systemPrompt,
      historyForContext,
      parsed.data.message
    )

    const { data: assistantMessage, error: assistantInsertError } = await supabase
      .from('chat_messages')
      .insert({
        session_id: session.id,
        role: 'assistant',
        content,
        page_citation: pageCitation,
        context_source: contextType,
      })
      .select()
      .single()

    if (assistantInsertError) throw assistantInsertError

    return NextResponse.json({ user_message: userMessage, assistant_message: assistantMessage })
  } catch (err) {
    console.error('[POST /api/contracts/:id/chat] chat_failed:', err)
    return NextResponse.json(
      { error: { code: 'chat_failed', message: 'Chat request failed' } },
      { status: 502 }
    )
  }
}

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

  const { data: session } = await supabase
    .from('chat_sessions')
    .select('id')
    .eq('contract_id', params.id)
    .maybeSingle()

  if (!session) {
    return NextResponse.json({ messages: [], session_id: null })
  }

  const { data: messages } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('session_id', session.id)
    .order('created_at', { ascending: true })
    .limit(HISTORY_LIMIT)

  return NextResponse.json({ messages: messages ?? [], session_id: session.id })
}
