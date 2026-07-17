# Spec: Results Display (PDF Viewer + Key Terms Panel)

**Maps to:** PRD US-003, US-006, US-009, FR-06, FR-07 · Engineering doc §4 Flow 3 (steps 4–5), §7, §11
**Primary source files:** `app/(app)/contracts/[id]/page.tsx`, `app/(app)/contracts/[id]/loading.tsx`, `app/api/contracts/[id]/route.ts`, `app/api/key-terms/[id]/route.ts`, `components/contract-viewer/*`, `components/key-terms-panel/KeyTermRow.tsx`, `stores/ui-store.ts`

---

## 1. User Flow

1. User navigates to `/contracts/[id]` (from dashboard row click, or directly after processing).
2. `loading.tsx` renders skeleton loaders (PDF viewer skeleton + key-terms row skeletons) while `GET /api/contracts/:id` resolves.
3. Two-panel layout renders: `<ContractViewer />` (left) + `<KeyTermsPanel />` (right).
4. `<ContractViewer />` dispatches:
   - If `file_path` is non-null → `<PdfViewer />` renders the PDF via a Supabase Storage **signed URL, 1-hour expiry**, using PDF.js.
   - If `file_path` is null (Storage write failed at upload) → `<TextViewerFallback />` parses `[PAGE N]` markers from `contract_text` and renders each page as a labelled, scrollable section.
5. Clicking a term's page number in `<KeyTermRow />` sets `targetPage` (via `ui-store`); both viewer variants respond to the same prop by smooth-scrolling and highlighting that page.
6. User clicks a term's value to enter inline edit mode; on save, `PATCH /api/key-terms/:id` fires as an **optimistic** TanStack Query mutation — the UI updates immediately, showing an "Edited" badge, and rolls back if the request fails.
7. Below 768px viewport width, the two-panel layout collapses into a tabbed view (`PDF` / `Key Terms` tabs).

---

## 2. DB Schema Touched

- `key_terms` — UPDATE on inline edit (`value`, `is_edited = true`; `original_value` is preserved from the original insert, never overwritten).
- `term_corrections` — INSERT on every edit (feedback/eval loop; `key_term_id` or `custom_key_term_id` set depending on which table the edited term belongs to).

## 3. DB Tasks

`term_corrections` table (nullable FKs to both `key_terms` and `custom_key_terms`, since either type can be edited) — created in `supabase-schema.sql`.

## 4. API Routes

### `GET /api/contracts/:id`

**Auth:** required. RLS-scoped.

**Response `200`:**
```json
{
  "contract": { "id": "uuid", "contract_type": "NDA", "status": "complete", "file_path": "contracts/.../file.pdf", "page_count": 12, "created_at": "..." },
  "key_terms": [ { "id": "uuid", "term_name": "...", "value": "...", "page_number": 3, "confidence_score": 92.5, "source_sentence": "...", "is_edited": false } ],
  "custom_key_terms": [ { "id": "uuid", "term_name": "...", "value": "...", "page_number": 5, "confidence_score": 76.0, "source_sentence": "..." } ]
}
```
Note: `contract_text` is intentionally **excluded** from this response when `file_path` is present (the PDF viewer doesn't need it, and it can be large); `<TextViewerFallback />` requests it via a separate lightweight field or the same payload includes it only when `file_path` is null. Simplest correct approach: always include `contract_text` in the response — it's already loaded server-side and keeping the contract simple avoids a second round trip.

**Error:** `404 not_found` if the contract doesn't exist or isn't owned by the caller.

### `PATCH /api/key-terms/:id`

**Auth:** required. RLS-scoped (join through `contract_id` → `contracts.user_id`).

**Request:**
```json
{ "value": "State of California" }
```

**Response `200`:**
```json
{ "id": "uuid", "value": "State of California", "is_edited": true }
```

**Validation:** `value` non-empty string, max 2000 chars.

**Error responses:**
| Status | Code | When |
|---|---|---|
| 400 | `invalid_request` | Empty value |
| 404 | `not_found` | Term not found / not owned (RLS) |

**Route sketch:**
```ts
// app/api/key-terms/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { z } from 'zod'

const patchSchema = z.object({ value: z.string().trim().min(1).max(2000) })

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: { code: 'unauthenticated', message: 'Sign in required' } }, { status: 401 })

  const parsed = patchSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: { code: 'invalid_request', message: 'value is required' } }, { status: 400 })
  }

  const { data: existing } = await supabase.from('key_terms').select('id, value, contract_id').eq('id', params.id).single()
  if (!existing) return NextResponse.json({ error: { code: 'not_found', message: 'Term not found' } }, { status: 404 })

  const { data: updated } = await supabase.from('key_terms').update({ value: parsed.data.value, is_edited: true }).eq('id', params.id).select('id, value, is_edited').single()
  await supabase.from('term_corrections').insert({ key_term_id: params.id, original_value: existing.value, corrected_value: parsed.data.value })

  return NextResponse.json(updated)
}
```
(An analogous branch or a shared handler covers `custom_key_terms` edits — determine which table the `id` belongs to, or split into `/api/key-terms/:id` and `/api/custom-key-terms/:id` if the two ever diverge in shape.)

## 5. State Management

- **TanStack Query** `['contract', contractId]` for the initial `GET /api/contracts/:id` fetch (includes `key_terms` + `custom_key_terms`).
- **Mutation** for `PATCH /api/key-terms/:id` uses `onMutate` to optimistically update the cached term's `value`/`is_edited`, and `onError` to roll back to the previous cache snapshot.
- **Zustand `ui-store`** holds viewer zoom level and `targetPage` — shared between `<ContractViewer />` and `<KeyTermsPanel />` without prop-drilling:
```ts
// stores/ui-store.ts
import { create } from 'zustand'

interface UiState {
  targetPage: number | null
  zoom: number
  setTargetPage: (page: number) => void
  setZoom: (zoom: number) => void
}

export const useUiStore = create<UiState>((set) => ({
  targetPage: null,
  zoom: 1,
  setTargetPage: (targetPage) => set({ targetPage }),
  setZoom: (zoom) => set({ zoom }),
}))
```

## 6. Component Spec

- **`<ContractViewer targetPage={page} />`** — dispatches to `<PdfViewer />` or `<TextViewerFallback />` based on `file_path` presence; both must expose identical page-navigation behavior (smooth scroll + highlight) so `<KeyTermRow>` never needs to know which is active.
- **`<PdfViewer />`** — PDF.js-based, fetches a 1-hour signed URL from Supabase Storage on mount, renders pages, supports zoom (bound to `ui-store`) and programmatic scroll-to-page.
- **`<TextViewerFallback />`** — splits `contract_text` on `[PAGE N]` markers, renders each as a labelled `<section id="page-N">`, scrolls via `element.scrollIntoView()`.
- **`<KeyTermRow />`** — inline edit mode toggled on click (text input replaces the static value), Save/Cancel actions, "Edited" badge shown post-save.

## 7. Design Notes

- Responsive collapse to tabbed view under 768px (per engineering-doc.md §5) — tabs labelled "PDF" and "Key Terms", state held in `ui-store` or local component state (not server state).
- WCAG 2.1 AA: keyboard-navigable PDF viewer controls (zoom in/out, next/prev page reachable via Tab + Enter), focus trap not needed here (no modal) but focus should move to the highlighted page region on term-click for screen reader users.

## 8. Edge Cases

| Case | Behavior |
|---|---|
| PDF.js fails to render a malformed/unusual-font PDF | Show a "Download PDF" link plus automatic fallback to `<TextViewerFallback />` |
| Edit save fails (network error) | Optimistic update rolls back via `onError`, inline error shown near the row, value reverts to pre-edit state |
| Very long `source_sentence` in the "Why?" expandable | Truncate at ~280 chars with "show more" toggle rather than breaking row layout |
| Contract still `status='processing'` when this page loads (e.g. user navigated here directly) | Show a processing state, not an empty/broken key-terms panel; poll or rely on Realtime/refetch to transition once complete |
| Signed URL expires mid-session (viewer open > 1 hour) | `<PdfViewer />` catches the load failure and re-requests a fresh signed URL transparently |

## 9. Acceptance Criteria

- [ ] Results page renders PDF viewer + key terms panel within loading-skeleton → populated transition, no layout shift.
- [ ] Clicking any term's page number scrolls/highlights the correct page in whichever viewer variant is active.
- [ ] Inline edits save within 2s (PRD US-009) and show an "Edited" badge; failures roll back visibly.
- [ ] Layout collapses to tabs below 768px without losing functionality.
- [ ] `original_value` is never overwritten by an edit — always reflects the AI's initial output.
