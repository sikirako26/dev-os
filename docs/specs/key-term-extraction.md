# Spec: Key Term Extraction (OpenAI)

**Maps to:** PRD US-002 (extraction portion), US-003, US-004, FR-04, FR-11 · Engineering doc §4 Flow 3 (steps 3–4), §7, §8, §9, §11
**Primary source files:** `app/api/contracts/[id]/process/route.ts`, `lib/openai/client.ts`, `lib/openai/buildExtractionPrompt.ts`, `lib/prompts/nda-v1.0.ts`, `lib/prompts/msa-v1.0.ts`, `components/key-terms-panel/*`

---

## 1. User Flow

1. From the pre-processing preview, user clicks "Process Contract".
2. Frontend shows a 3-step determinate/indeterminate progress indicator: **Extracting → Analysing → Compiling**, and calls `POST /api/contracts/:id/process`.
3. Backend:
   a. Loads `contract_text` + any registered `custom_key_terms` for this contract.
   b. Builds a few-shot prompt via `lib/prompts/{nda|msa}-v1.0.ts` (3 labelled examples per type) + zero-shot custom term instructions.
   c. Calls OpenAI GPT-4o with `response_format: { type: 'json_object' }`, `temperature: 0.1`, `max_tokens: 2000`.
   d. Parses the response as a JSON array of `{ term_name, value, page_number, confidence_score, source_sentence }`.
   e. On parse failure: **one automatic retry** with an appended instruction ("Return only a valid JSON array, no explanation, no markdown fences.").
   f. On OpenAI transport/rate-limit errors: 3-attempt exponential backoff (e.g. 1s, 2s, 4s) before surfacing a failure.
   g. On success: idempotently clears any prior `key_terms` rows for this contract (covers retry-after-error), inserts new rows, sets `contracts.status = 'complete'`.
   h. On unrecoverable failure: sets `contracts.status = 'error'`, no `key_terms` rows written.
4. Frontend renders the Results page: `<KeyTermsPanel />` with one `<KeyTermRow />` per term, color-coded confidence badge.
5. Terms with `confidence_score < 50` render a non-dismissible ⚠️ warning inline — the term is still shown, never hidden.

---

## 2. DB Schema Touched

- `key_terms` — INSERT one row per extracted term (standard terms only; custom terms go to `custom_key_terms`, see `custom-term-addition.md`).
- `contracts` — UPDATE `status`: `'uploaded'` → `'processing'` → `'complete'` | `'error'`.

## 3. DB Tasks

`key_terms` table + index on `(contract_id)` — created in `supabase-schema.sql`.

## 4. API Route

### `POST /api/contracts/:id/process`

**Auth:** required. Ownership enforced via RLS (`contract_id` scoped to `auth.uid()`).

**Preconditions:** `contracts.status` must be `'uploaded'` or `'error'` (allows retry). Any other status (`'processing'`, `'complete'`) returns `409`.

**Request:** `{}` (no body — reads `contract_text` and any pre-registered custom terms server-side).

**Response `200`:**
```json
{
  "status": "complete",
  "key_terms": [
    {
      "id": "uuid",
      "term_name": "Governing Law",
      "value": "State of Delaware",
      "page_number": 3,
      "confidence_score": 92.5,
      "source_sentence": "This Agreement shall be governed by the laws of the State of Delaware.",
      "is_edited": false
    }
  ]
}
```

**Error responses:**
| Status | Code | When |
|---|---|---|
| 404 | `not_found` | Contract doesn't exist or not owned by caller (RLS) |
| 409 | `invalid_state` | Contract not in `'uploaded'`/`'error'` status |
| 502 | `extraction_failed` | OpenAI call failed after 3 retries, or JSON parse failed after 1 retry |

**Extraction prompt contract** (`lib/openai/buildExtractionPrompt.ts`):
```ts
interface ExtractionPromptInput {
  contractType: 'NDA' | 'MSA'
  contractText: string // includes [PAGE N] markers
  customTerms: string[] // up to 5
}

// Output schema enforced via JSON mode + explicit instruction:
type ExtractedTerm = {
  term_name: string
  value: string
  page_number: number
  confidence_score: number // 0-100
  source_sentence: string
}
```

**Route sketch:**
```ts
// app/api/contracts/[id]/process/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { buildExtractionPrompt } from '@/lib/openai/buildExtractionPrompt'
import { callExtraction } from '@/lib/openai/client'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: { code: 'unauthenticated', message: 'Sign in required' } }, { status: 401 })

  const { data: contract } = await supabase.from('contracts').select('*').eq('id', params.id).single()
  if (!contract) return NextResponse.json({ error: { code: 'not_found', message: 'Contract not found' } }, { status: 404 })
  if (!['uploaded', 'error'].includes(contract.status)) {
    return NextResponse.json({ error: { code: 'invalid_state', message: 'Contract already processed or in progress' } }, { status: 409 })
  }

  await supabase.from('contracts').update({ status: 'processing' }).eq('id', params.id)

  const { data: customTerms } = await supabase.from('custom_key_terms').select('term_name').eq('contract_id', params.id)
  const prompt = buildExtractionPrompt({
    contractType: contract.contract_type,
    contractText: contract.contract_text,
    customTerms: (customTerms ?? []).map((t) => t.term_name),
  })

  try {
    const terms = await callExtraction(prompt) // handles retry-on-parse-failure + 3x backoff internally
    await supabase.from('key_terms').delete().eq('contract_id', params.id) // idempotent retry
    const { data: inserted } = await supabase.from('key_terms').insert(
      terms.map((t) => ({ contract_id: params.id, term_name: t.term_name, value: t.value, original_value: t.value, page_number: t.page_number, confidence_score: t.confidence_score, source_sentence: t.source_sentence }))
    ).select()
    await supabase.from('contracts').update({ status: 'complete' }).eq('id', params.id)
    return NextResponse.json({ status: 'complete', key_terms: inserted })
  } catch (err) {
    await supabase.from('contracts').update({ status: 'error' }).eq('id', params.id)
    return NextResponse.json({ error: { code: 'extraction_failed', message: 'Extraction failed after retries' } }, { status: 502 })
  }
}
```

## 5. State Management

- TanStack Query mutation (`useProcessContractMutation`) for the call.
- On success, its response seeds `['keyTerms', contractId]` directly via `queryClient.setQueryData` — avoids an extra round-trip fetch immediately after processing.
- `['contract', contractId]` query is invalidated to pick up the new `status`.

## 6. Component Spec

- **`<KeyTermsPanel />`** — maps `key_terms` (+ `custom_key_terms`) to `<KeyTermRow />`.
- **`<KeyTermRow />`** — columns: Term Name | Value | Page Number (clickable, scrolls viewer) | `<ConfidenceBadge />` | expandable "Why?" (shows `source_sentence`).
- **`<ConfidenceBadge />`** — green ≥ 80%, amber 50–79%, red < 50%; always paired with a text label ("High" / "Medium" / "Low confidence") per WCAG — never color alone.

## 7. Design Notes

- Low-confidence warning is **non-dismissible** (PRD §9) — no "x" to close it; it persists as long as the term is visible.
- 3-step progress indicator (Extracting → Analysing → Compiling) uses the design system's stepped progress component; each step transitions on the corresponding backend phase, not on a fixed timer.

## 8. Edge Cases

| Case | Behavior |
|---|---|
| OpenAI call fails/times out after 3 retries | `contracts.status = 'error'`, `502` returned, Results page shows "Extraction failed" + "Try again" CTA (re-invokes this same endpoint) |
| JSON parse failure on first attempt | One automatic retry with a stricter instruction; only fails the request if the retry also fails to parse |
| Retry after a prior error | Idempotent — existing `key_terms` for the contract are deleted before re-insert; no duplicate rows |
| Model returns a term with an empty/missing `source_sentence` | Term is still inserted and shown, but flagged as unreliable (treated equivalently to low confidence in the UI) |
| Contract type mismatch (e.g. user uploads an MSA but selected NDA) | No hard block — extraction still runs against the selected type's prompt; expect a higher rate of low-confidence terms as a natural signal, no special-cased detection required at MVP |
| Concurrent process requests for the same contract (double-click) | Second request sees `status='processing'` (not `'uploaded'`/`'error'`) → `409`; frontend disables the "Process Contract" button on click to make this rare in practice |

## 9. Acceptance Criteria

- [ ] Successful extraction inserts one `key_terms` row per standard term with `page_number`, `confidence_score`, `source_sentence` populated.
- [ ] Terms with `confidence_score < 50` render a non-dismissible warning and are never hidden.
- [ ] A failed extraction sets `contracts.status = 'error'` and never leaves partial/duplicate `key_terms` rows.
- [ ] Retrying a failed contract re-runs cleanly (old terms cleared, new terms inserted, no duplicates).
- [ ] P95 time-to-first-extracted-term ≤ 30s for contracts ≤ 20 pages (PRD success metric).
