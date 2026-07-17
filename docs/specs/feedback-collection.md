# Spec: Feedback Collection

**Maps to:** PRD US-010, FR-12 · Engineering doc §4, §7, §11
**Primary source files:** `app/api/contracts/[id]/feedback/route.ts`, `components/feedback/FeedbackWidget.tsx`

---

## 1. User Flow

1. On the Results page footer (near the disclaimer area), user clicks thumbs-up or thumbs-down.
2. An optional text `<textarea>` comment field appears.
3. Submission writes to `user_feedback` via `POST /api/contracts/:id/feedback`; a fire-and-forget confirmation toast shows ("Thanks for the feedback") — no further UI action required.

---

## 2. DB Schema Touched

`user_feedback` — INSERT `user_id`, `contract_id`, `rating`, `comment` (nullable), `created_at`.

## 3. DB Tasks

`user_feedback` table — created in `supabase-schema.sql`.

## 4. API Route

### `POST /api/contracts/:id/feedback`

**Auth:** required. RLS-scoped.

**Request:**
```json
{ "rating": "up", "comment": "Missed the indemnification clause on page 6" }
```

**Response `200`:**
```json
{ "id": "uuid" }
```

**Validation (Zod):**
```ts
import { z } from 'zod'

export const feedbackRequestSchema = z.object({
  rating: z.enum(['up', 'down']),
  comment: z.string().trim().max(1000).optional(),
})
```

**Error responses:**
| Status | Code | When |
|---|---|---|
| 400 | `invalid_request` | Missing/invalid `rating` |
| 404 | `not_found` | Contract not found / not owned |

**Route sketch:**
```ts
// app/api/contracts/[id]/feedback/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { feedbackRequestSchema } from '@/lib/validation/feedbackSchema'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: { code: 'unauthenticated', message: 'Sign in required' } }, { status: 401 })

  const parsed = feedbackRequestSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: { code: 'invalid_request', message: 'rating must be "up" or "down"' } }, { status: 400 })
  }

  const { data: contract } = await supabase.from('contracts').select('id').eq('id', params.id).single()
  if (!contract) return NextResponse.json({ error: { code: 'not_found', message: 'Contract not found' } }, { status: 404 })

  const { data: inserted } = await supabase.from('user_feedback').insert({
    user_id: user.id,
    contract_id: params.id,
    rating: parsed.data.rating,
    comment: parsed.data.comment ?? null,
  }).select('id').single()

  return NextResponse.json(inserted)
}
```

## 5. State Management

Simple TanStack Query mutation; no caching needed since this is a write-only feature (no subsequent read of the user's own feedback is required by the PRD at MVP).

## 6. Component Spec

- **`<FeedbackWidget />`** — thumbs up/down toggle (single active selection), optional `<textarea>` revealed after a rating is chosen, submit button, success toast on completion.

## 7. Design Notes

- Non-intrusive placement (footer of Results page), visually grouped with `<DisclaimerBanner />` ("Not legal advice") per engineering-doc.md §5 component hierarchy.

## 8. Edge Cases

| Case | Behavior |
|---|---|
| Duplicate feedback on the same contract (user clicks thumbs-up twice, or up then down) | Allowed as a new row each time — no PRD requirement to enforce one-per-contract; flagged as a product decision to revisit post-MVP if it skews analytics |
| Submission fails (network/server error) | Must surface an inline error, not swallow the failure — consistent with the "no silent failures" reliability constraint (engineering-doc.md §5 UX states) |
| User submits a comment with no rating selected | Submit button disabled until a rating (up/down) is chosen — comment is optional but only meaningful attached to a rating |

## 9. Acceptance Criteria

- [ ] Thumbs up/down + optional comment writes a `user_feedback` row scoped to the correct `user_id`/`contract_id`.
- [ ] Submission failure shows a visible inline error, never fails silently.
- [ ] Widget placement doesn't interfere with the primary PDF viewer / key terms panel layout.
