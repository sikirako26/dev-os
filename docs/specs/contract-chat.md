# Spec: Contract Chat (Q&A)

**Maps to:** PRD US-007, US-012, FR-08, FR-09 · Engineering doc §4 Flow 4, §7, §8, §9, §11
**Primary source files:** `app/api/contracts/[id]/chat/route.ts`, `lib/openai/buildChatPrompt.ts`, `lib/openai/classifyChatQuery.ts`, `lib/prompts/chat-v1.0.ts`, `components/chat-panel/*`, `hooks/useChatRealtime.ts`

---

## 1. User Flow

1. User opens the "Chat with Contract" tab/floating panel on the Results page.
2. On first open, frontend fetches history: `GET /api/contracts/:id/chat` → seeds `['chatMessages', contractId]`.
3. User types a question (e.g. "Is there an auto-renewal clause?") in `<ChatInput />` and submits.
4. Frontend optimistically renders the user's message bubble, then `POST /api/contracts/:id/chat`.
5. Backend (the **Conversation Memory Layer** — `classifyChatQuery.ts` + `buildChatPrompt.ts`):
   a. Ensures a `chat_sessions` row exists for this contract (creates one on first message).
   b. Fetches up to 200 prior `chat_messages` (ascending) — **this fetch must happen before the new user message is inserted**, otherwise the classifier and the LLM context would see the new message as part of its own history.
   c. Classifies the question into `contract` / `history` / `both` via a cheap regex/keyword heuristic (`classifyChatQuery`) — no separate API call.
   d. Retrieves context per classification:
      - `contract` → contract text + last 10 turns (20 messages)
      - `history` → conversation history only (no contract text), up to 20 turns (40 messages)
      - `both` → contract text + last 10 turns (20 messages)
   e. Selects the system prompt matched to the classification (`buildChatPrompt`):
      - `contract` → "Answer only from the contract. Cite [Page X]."
      - `history` → "Answer only from the conversation. End with [From conversation]."
      - `both` → "Answer from both. Attribute each fact to its source."
   f. Calls GPT-4o, `temperature: 0.4`, `max_tokens: 1000` with the selected system prompt and context.
   g. Inserts the user message (immediately after the history fetch, per (b)) and the assistant response — tagged with `context_source` (`contract`/`history`/`both`) — into `chat_messages`.
6. Response renders with source attribution: contract-derived answers include a mandatory `[Page X]` citation, prefixed "Based on the document…"; clicking the citation scrolls the `<ContractViewer />` to that page (via `ui-store.setTargetPage`). Every assistant bubble also shows a `<ContextSourceBadge />` reflecting `context_source` ("Contract" / "Conversation" / "Contract + Conversation").
7. Any other open tab/device viewing the same contract receives the new messages live via a Supabase Realtime subscription on `chat_messages` filtered by `session_id` — no manual refresh needed.
8. Reopening the contract later reloads the full prior session via `GET /api/contracts/:id/chat`.

---

## 2. DB Schema Touched

- `chat_sessions` — INSERT one row per contract, created lazily on first message (unique on `contract_id`).
- `chat_messages` — INSERT one row for the user message, one for the assistant response, per turn. Assistant rows carry `context_source` (`contract`/`history`/`both`) for UI attribution.

## 3. DB Tasks

- `chat_sessions` + `chat_messages` tables, index `(session_id, created_at)` — created in `supabase-schema.sql`.
- Enable Supabase Realtime (`postgres_changes`) on `chat_messages` — this is a project-config step (Dashboard: Database → Replication, or `ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;` — included in `supabase-schema.sql`).

## 4. API Routes

### `POST /api/contracts/:id/chat`

**Auth:** required. RLS-scoped via `chat_sessions.user_id`.

**Request:**
```json
{ "message": "Is there an auto-renewal clause?" }
```

**Response `200`:**
```json
{
  "user_message": { "id": "uuid", "role": "user", "content": "Is there an auto-renewal clause?", "created_at": "..." },
  "assistant_message": { "id": "uuid", "role": "assistant", "content": "Based on the document, yes — Section 4.2 includes an automatic 12-month renewal unless either party provides 30 days' notice. [Page 4]", "page_citation": 4, "created_at": "..." }
}
```

**Validation:** `message` non-empty, max ~2000 chars.

**Error responses:**
| Status | Code | When |
|---|---|---|
| 400 | `invalid_request` | Empty or over-length message |
| 404 | `not_found` | Contract not found / not owned |
| 429 | `rate_limited` | Per-user rate limit exceeded (enforced in `lib/security`, Stage 3) |
| 502 | `chat_failed` | OpenAI call failed after retries |

**Route sketch:**
```ts
// app/api/contracts/[id]/chat/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { buildChatPrompt } from '@/lib/openai/buildChatPrompt'
import { callChat } from '@/lib/openai/client'
import { z } from 'zod'

const chatRequestSchema = z.object({ message: z.string().trim().min(1).max(2000) })

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: { code: 'unauthenticated', message: 'Sign in required' } }, { status: 401 })

  const parsed = chatRequestSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: { code: 'invalid_request', message: 'message is required' } }, { status: 400 })
  }

  const { data: contract } = await supabase.from('contracts').select('contract_text').eq('id', params.id).single()
  if (!contract) return NextResponse.json({ error: { code: 'not_found', message: 'Contract not found' } }, { status: 404 })

  let { data: session } = await supabase.from('chat_sessions').select('id').eq('contract_id', params.id).single()
  if (!session) {
    const { data: created } = await supabase.from('chat_sessions').insert({ contract_id: params.id, user_id: user.id }).select('id').single()
    session = created
  }

  const { data: history } = await supabase.from('chat_messages').select('role, content').eq('session_id', session.id).order('created_at', { ascending: true }).limit(200)

  const { data: userMessage } = await supabase.from('chat_messages').insert({ session_id: session.id, role: 'user', content: parsed.data.message }).select().single()

  try {
    const prompt = buildChatPrompt({ contractText: contract.contract_text, history: history ?? [], question: parsed.data.message })
    const { content, pageCitation } = await callChat(prompt)
    const { data: assistantMessage } = await supabase.from('chat_messages').insert({ session_id: session.id, role: 'assistant', content, page_citation: pageCitation }).select().single()
    return NextResponse.json({ user_message: userMessage, assistant_message: assistantMessage })
  } catch (err) {
    return NextResponse.json({ error: { code: 'chat_failed', message: 'Chat request failed' } }, { status: 502 })
  }
}
```

### `GET /api/contracts/:id/chat`

**Auth:** required.

**Response `200`:**
```json
{ "messages": [ { "id": "uuid", "role": "user", "content": "...", "page_citation": null, "created_at": "..." } ] }
```
Returns up to 200 most recent messages, ascending order. If more than 200 exist, older ones remain in DB but are not sent as LLM context on subsequent turns — UI may paginate for full scrollback (see Edge Cases).

## 5. State Management

- **TanStack Query** `['chatMessages', contractId]` seeded from the initial `GET` fetch.
- **Mutation** for sending a message: optimistically appends the user bubble immediately, then merges the real `user_message`/`assistant_message` from the response (replacing the optimistic placeholder by a temp-id match).
- **Supabase Realtime** subscription (`hooks/useChatRealtime.ts`) on `chat_messages` filtered by `session_id`; pushes new rows into the same query cache via `queryClient.setQueryData` rather than a separate store — keeps multiple open tabs/devices in sync without polling.

```ts
// hooks/useChatRealtime.ts
'use client'
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createBrowserClient } from '@/lib/supabase/client'

export function useChatRealtime(sessionId: string, contractId: string) {
  const queryClient = useQueryClient()
  useEffect(() => {
    if (!sessionId) return
    const supabase = createBrowserClient()
    const channel = supabase
      .channel(`chat_messages:${sessionId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `session_id=eq.${sessionId}` }, (payload) => {
        queryClient.setQueryData(['chatMessages', contractId], (old: any) => {
          if (!old) return old
          if (old.messages.some((m: any) => m.id === payload.new.id)) return old
          return { messages: [...old.messages, payload.new] }
        })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [sessionId, contractId, queryClient])
}
```

## 6. Component Spec

- **`<ChatPanel />`** → `<ChatMessageList />` (user right-aligned, assistant left-aligned) + `<ChatInput />` + `<SourceCitationLink page={n} />` + `<ContextSourceBadge source={...} />`.
- **`<SourceCitationLink page={n} />`** — renders "[Page n]" as a clickable link; click sets `ui-store.targetPage = n`, scrolling `<ContractViewer />`.
- **`<ContextSourceBadge source={contract|history|both} />`** — renders under each assistant bubble: "Source: Contract" / "Source: Conversation" / "Source: Contract + Conversation".

## 7. Design Notes

- "Based on the document…" prefix and page citation styled per `docs/design.md` chat bubble spec.
- `<DisclaimerBanner />` ("Not legal advice") is persistent on the Results page generally, not just within the chat tab.

## 8. Edge Cases

| Case | Behavior |
|---|---|
| Question about something absent from the document | Expected, correct response: "I cannot find this in the document" — **not** a failure; an automated regression test asserts this for out-of-scope questions |
| Chat response exceeds 15s | Loading indicator persists past 15s; a hard timeout still surfaces a retry option past ~20s |
| 200-message history ceiling reached | Oldest messages remain in DB but are excluded from LLM context on new turns (only most recent 200 sent); UI still displays full scrollback via pagination on `GET` |
| Rate limit hit (per-user token bucket on chat endpoint) | `429 rate_limited`, frontend shows "You're sending messages too quickly — try again in a moment" |
| Two tabs open, one sends a message | Realtime pushes the new message to the other tab without a refresh; sending tab does not double-render its own optimistic message when the Realtime event arrives (dedup by `id`) |
| Contract not yet processed (`status != 'complete'`) | Chat is disabled/hidden until processing completes — no chat endpoint calls possible against an unprocessed contract |

## 9. Acceptance Criteria

- [ ] Every assistant response includes a `[Page X]` citation, or explicitly states the answer isn't in the document.
- [ ] P95 response time ≤ 15s.
- [ ] Chat history persists and reloads correctly across sessions (US-012).
- [ ] Multiple open tabs for the same contract stay in sync via Realtime, no polling.
- [ ] Automated hallucination-regression test passes: out-of-scope question → "I cannot find this in the document".
