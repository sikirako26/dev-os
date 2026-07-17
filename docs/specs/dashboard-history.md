# Spec: Dashboard & History

**Maps to:** PRD US-008, FR-10 · Engineering doc §4 Flow 1/2, §7, §11
**Primary source files:** `app/(app)/dashboard/page.tsx`, `components/dashboard/DashboardSummaryCard.tsx`, `components/dashboard/ContractHistoryTable.tsx`

---

## 1. User Flow

1. On sign-in (or any visit to `/dashboard`), the page loads a summary card (total contracts, breakdown by type) and a sortable history table (date, name, type, status).
2. Clicking any row navigates to `/contracts/[id]` (Results page — see `results-display.md`).
3. New users with zero contracts see an empty state: "No contracts reviewed yet — upload your first contract to begin" with a CTA to `/contracts/upload`.
4. Contracts stuck in `status='processing'` (e.g. tab closed mid-process) render with a "Resume/Retry" affordance rather than appearing broken or stuck silently.

---

## 2. DB Schema Touched

Read-only queries against `contracts`. No new tables, no writes from this feature.

## 3. DB Tasks

Ensure the `(user_id, created_at desc)` index (created in `pdf-upload-extraction.md` / `supabase-schema.sql`) supports the sortable list efficiently — no additional index needed for MVP sort/filter columns (`created_at`, `contract_type`, `status` are all low-cardinality or already covered).

## 4. API Routes

No dedicated API route required at MVP — direct Supabase client read from the frontend (RLS-scoped), per engineering-doc.md §6/§9. If aggregate counts become expensive as data grows, promote to `GET /api/dashboard`.

**Direct read pattern (client-side, RLS-protected):**
```ts
// Summary
const { data: contracts } = await supabase
  .from('contracts')
  .select('id, contract_type, status, created_at')
  .order('created_at', { ascending: false })

const total = contracts.length
const byType = contracts.reduce((acc, c) => {
  acc[c.contract_type] = (acc[c.contract_type] ?? 0) + 1
  return acc
}, {} as Record<string, number>)
```

**If promoted to an API route**, the contract would be:

### `GET /api/dashboard`
**Response `200`:**
```json
{ "total": 12, "by_type": { "NDA": 7, "MSA": 5 }, "recent": [ { "id": "uuid", "contract_type": "NDA", "status": "complete", "created_at": "..." } ] }
```

## 5. State Management

- **TanStack Query** `['dashboard', userId]` with `staleTime: 30_000` (30s) — dashboard data is not real-time-critical, avoids refetching on every focus/mount.
- No Zustand needed — this view has no ephemeral UI state beyond table sort column/direction, which can live in local component state (`useState`) since it doesn't need to persist or be shared.

## 6. Component Spec

- **`<DashboardSummaryCard />`** — total contract count + type breakdown (NDA/MSA), rendered as stat tiles.
- **`<ContractHistoryTable />`** — sortable columns (date, name/filename, type, status); row click navigates to `/contracts/[id]`; status column renders a badge.

## 7. Design Notes

- Table follows `docs/design.md` data-table conventions (row hover state, alternating/consistent row backgrounds per the design system's data-dense philosophy).
- Status column badge reuses the same badge component family as `<ConfidenceBadge />` (from `key-term-extraction.md`) for visual consistency — e.g. `complete` = green, `processing` = amber/neutral, `error` = red, `uploaded` = neutral grey.

## 8. Edge Cases

| Case | Behavior |
|---|---|
| Zero contracts | Empty state copy + CTA, **not** an empty table with headers only |
| Contract stuck in `status='processing'` | Rendered with a "Resume/Retry" affordance that re-invokes `POST /api/contracts/:id/process` (idempotent per `key-term-extraction.md`) rather than appearing broken |
| Contract in `status='error'` | Shown with a clear error indicator + "Retry" affordance, same underlying re-process call |
| Large contract count (100s of rows) | Table paginates or virtualizes — not a hard MVP requirement per PRD, but avoid unbounded DOM rendering; a simple `LIMIT`/offset or client-side pagination is sufficient at MVP scale |

## 9. Acceptance Criteria

- [ ] Dashboard loads summary + recent list within the standard loading-skeleton pattern (see `results-display.md` UX states).
- [ ] Empty state renders correctly for zero-contract users.
- [ ] Sorting by date/type/status works without a full page reload.
- [ ] Clicking a row navigates to the correct contract's Results page.
- [ ] Contracts in `processing`/`error` states offer a clear recovery action instead of looking broken.
