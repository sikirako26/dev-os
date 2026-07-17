# Spec: Custom Term Addition

**Maps to:** PRD US-005, FR-05 · Engineering doc §4 Flow 3 (step 2), §7, §9, §11
**Primary source files:** `app/api/contracts/[id]/custom-terms/route.ts`, `stores/upload-wizard-store.ts`, `components/key-terms-panel/AddCustomTermButton.tsx`

---

## 1. User Flow

1. On `<PreProcessingPreview />` (post-upload, pre-processing), user clicks "+ Add Key Term".
2. `<CustomTermInput />` renders inline; user types a term name (e.g. "Non-compete radius") and submits (Enter or button).
3. Term appears in the preview list with a "Custom" badge. User may repeat up to a total of 5 custom terms.
4. Terms are held client-side in `upload-wizard-store` until the user clicks "Process Contract".
5. On "Process Contract", the frontend first calls `POST /api/contracts/:id/custom-terms` to persist the registered term names, then calls `POST /api/contracts/:id/process` (see `key-term-extraction.md`), which reads the persisted custom terms and injects them zero-shot into the same extraction prompt/schema as standard terms.
6. Results include custom terms with the identical row structure (value, page, confidence, source sentence) as standard terms, visually distinguished only by the "Custom" badge.

---

## 2. DB Schema Touched

`custom_key_terms` — INSERT one row per custom term at registration time (`term_name` only; `value`/`page_number`/`confidence_score`/`source_sentence` are populated later by the process step in `key-term-extraction.md`, or in the same insert if you choose to upsert post-extraction — see Route sketch).

## 3. DB Tasks

`custom_key_terms` table + index on `(contract_id)` — created in `supabase-schema.sql`.

## 4. API Route

### `POST /api/contracts/:id/custom-terms`

**Auth:** required. Ownership enforced via RLS.

**Preconditions:** `contracts.status = 'uploaded'` (custom terms can only be registered before processing).

**Request:**
```json
{ "terms": ["Non-compete radius", "Data retention period"] }
```

**Response `200`:**
```json
{ "terms": [{ "id": "uuid", "term_name": "Non-compete radius" }, { "id": "uuid", "term_name": "Data retention period" }] }
```

**Validation (Zod):**
```ts
import { z } from 'zod'

export const customTermsRequestSchema = z.object({
  terms: z.array(z.string().trim().min(1).max(80)).max(5),
})
```

**Error responses:**
| Status | Code | When |
|---|---|---|
| 400 | `limit_exceeded` | More than 5 terms submitted (cumulative across calls for this contract) |
| 400 | `invalid_request` | Empty/whitespace-only term name |
| 404 | `not_found` | Contract not found / not owned |
| 409 | `invalid_state` | Contract already processed |

**Route sketch:**
```ts
// app/api/contracts/[id]/custom-terms/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { customTermsRequestSchema } from '@/lib/validation/customTermsSchema'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: { code: 'unauthenticated', message: 'Sign in required' } }, { status: 401 })

  const body = await req.json()
  const parsed = customTermsRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: { code: 'invalid_request', message: 'Invalid term list' } }, { status: 400 })
  }

  const { data: contract } = await supabase.from('contracts').select('status').eq('id', params.id).single()
  if (!contract) return NextResponse.json({ error: { code: 'not_found', message: 'Contract not found' } }, { status: 404 })
  if (contract.status !== 'uploaded') {
    return NextResponse.json({ error: { code: 'invalid_state', message: 'Contract already processed' } }, { status: 409 })
  }

  const { count } = await supabase.from('custom_key_terms').select('id', { count: 'exact', head: true }).eq('contract_id', params.id)
  if ((count ?? 0) + parsed.data.terms.length > 5) {
    return NextResponse.json({ error: { code: 'limit_exceeded', message: 'Up to 5 custom terms per analysis' } }, { status: 400 })
  }

  const { data: inserted } = await supabase.from('custom_key_terms').insert(
    parsed.data.terms.map((term_name) => ({ contract_id: params.id, term_name, is_manual: true }))
  ).select('id, term_name')

  return NextResponse.json({ terms: inserted })
}
```

## 5. State Management

- Zustand `upload-wizard-store` (see `pdf-upload-extraction.md`) holds draft custom terms client-side (`customTerms: string[]`) — no server round-trip per keystroke, only on final "Process Contract" click.
- No TanStack Query cache needed for this write-once-before-processing step; the process mutation's response is what populates `['keyTerms', contractId]` for both standard and custom terms combined (frontend merges `key_terms` + `custom_key_terms` for rendering).

## 6. Component Spec

- **`<AddCustomTermButton />`** — "+ Add Key Term" trigger, disabled once 5 terms are added, shows a tooltip explaining the limit when disabled.
- **`<CustomTermInput />`** — inline text input, submit-on-enter, max 80 chars, trims whitespace before adding.

## 7. Design Notes

- "Custom" badge uses a distinct but consistent design-system tag style (e.g. Violet token family) versus the standard-term list's neutral styling, so users can visually separate AI-standard terms from their own additions.

## 8. Edge Cases

| Case | Behavior |
|---|---|
| 6th term attempted | Input disabled/blocked client-side with inline message "Up to 5 custom terms per analysis"; server also enforces the cap (400 `limit_exceeded`) as defense in depth |
| Empty/whitespace-only term name | Rejected client-side before it's added to the store |
| Duplicate custom term name (e.g. "Payment Terms" added twice) | Allowed — no dedup requirement in PRD; flagged as a post-MVP UX nicety, not a hard requirement |
| User removes a custom term before processing | Client-side only (`removeCustomTerm` in the store); no DB row exists yet since registration only happens on "Process Contract" |
| Custom term registration succeeds but the subsequent `process` call fails | Custom term rows remain in `custom_key_terms` with no `value`/`confidence_score` populated; retrying `process` re-uses the same registered terms (no re-registration needed — the process route only reads, it doesn't re-insert `custom_key_terms`) |

## 9. Acceptance Criteria

- [ ] Up to 5 custom terms can be added per contract; the 6th is blocked both client- and server-side.
- [ ] Custom terms appear in extraction results with the same structure as standard terms (value, page, confidence, source sentence).
- [ ] Custom terms are visually tagged "Custom" and distinguishable from standard terms.
- [ ] Registering custom terms after a contract has already been processed is rejected (`409`).
