# ContractIQ — Implementation Specs (Per-Feature)

**Source:** `docs/ContractIQ_PRD.md`, `docs/engineering/engineering-doc.md`
**Status:** Draft — pending approval (Stage 1 of build workflow)

Companion to `engineering-doc.md`. Each block below covers one MVP component (A–H per PRD §3): user flow, DB schema touched, DB tasks, API routes, state management, component spec, design notes, and edge cases. Granular runnable specs (`docs/specs/*`, `supabase-schema.sql`, `.env.example`) are produced in Stage 2.

---

## A — Authentication & Session Management

**Maps to:** US-001, FR-01

**User flow:**
1. Visitor clicks "Get Started Free" / "Sign In" on the landing page.
2. Supabase Auth modal collects email + password.
3. On success, Supabase issues a session; `middleware.ts` guards all `(app)` and `/api/**` routes, redirecting unauthenticated requests to `/sign-in`.
4. On sign-out, session is cleared and user is redirected to the landing page.

**DB schema touched:** `auth.users` (managed entirely by Supabase Auth — no custom `profiles` table needed at MVP since no additional user attributes are required).

**DB tasks:** None beyond enabling email/password provider in the Supabase project; RLS policies on every app table reference `auth.uid()`.

**API routes:** None — handled directly via the Supabase JS client (`supabase.auth.signUp`, `signInWithPassword`, `signOut`) from the frontend. `middleware.ts` reads the session cookie server-side to protect routes.

**State management:** Supabase session is the source of truth; a thin `useSession()` hook wraps `supabase.auth.onAuthStateChange` and exposes the user to components. No Zustand/TanStack Query needed for auth state itself.

**Component spec:**
- `<SignUpForm />` / `<SignInForm />` — email/password fields, inline validation, submit disables button + shows spinner, surfaces Supabase error messages verbatim (e.g. "Invalid login credentials").
- `<AuthGuardLayout />` — server component wrapping `(app)` routes; redirects if no session.

**Design notes:** Auth forms follow `docs/design.md` form component styles; error state uses the design system's error color token, not raw red.

**Edge cases:**
- Invalid credentials → clear inline error, no generic "something went wrong".
- Auth flow must complete ≤ 10s — show spinner past 3s, timeout error past 10s with retry.
- Expired session mid-session (e.g. long-idle tab) → API routes return 401 → frontend redirects to `/sign-in` preserving intended destination.

---

## B — PDF Upload & Text Extraction

**Maps to:** US-002 (upload portion), FR-02, FR-03, FR-14 (Storage bucket/RLS)

**User flow:**
1. User selects contract type (NDA/MSA) from a dropdown on `/contracts/upload`.
2. User drags/drops or file-picks a PDF.
3. Client validates size (≤10MB) and mime type before submitting.
4. Frontend POSTs to `/api/contracts/upload`; backend writes to Supabase Storage (non-blocking) and runs `pdf-parse`, inserting `[PAGE N]` markers.
5. If extracted text < 100 words → reject with "Scanned PDFs are not supported yet". If > 20 pages or > 15,000 tokens → reject with a clear message.
6. On success, a `contracts` row is created (`status='uploaded'`) and the pre-processing preview (standard term list for the selected type) renders.

**DB schema touched:** `contracts` (insert: `user_id`, `contract_type`, `file_path`, `contract_text`, `status`, `page_count`, `token_count`).

**DB tasks:**
- Create `contracts` table + indexes (`user_id`, `user_id, created_at desc`).
- Create Storage bucket `contracts` + RLS policies (INSERT/SELECT/DELETE scoped to `auth.uid()::text = (storage.foldername(name))[1]`) via SQL, not the dashboard (PRD assumption #13 — omitting this silently breaks uploads).

**API routes:** `POST /api/contracts/upload` (see engineering-doc.md §9 for full contract).

**State management:** TanStack Query mutation for the upload call; Zustand `upload-wizard-store` holds the in-progress step (`selecting-type` → `uploading` → `previewing` → `adding-custom-terms` → `processing`) and the selected file metadata client-side before submission.

**Component spec:**
- `<ContractTypeSelector />` — dropdown, NDA/MSA.
- `<UploadDropzone />` — drag-drop + file-pick, client-side validation, progress bar.
- `<PreProcessingPreview />` — lists standard terms for the selected type (10 for NDA, 12 for MSA per PRD §4) while extraction/preview loads.

**Design notes:** Upload progress uses the design system's progress-indicator component (3 steps: extracting text → analysing with AI → compiling results, per PRD flow step 4 — steps 2–3 apply once "Process Contract" is clicked, not at upload).

**Edge cases:**
- File > 10MB or non-PDF → rejected client-side before any network call, with inline error.
- Scanned/image PDF (< 100 words extracted) → graceful error, no partial `contracts` row left in a usable state (`status` reflects the failure; PDF viewer never attempts to render an incomplete record).
- Storage write fails (non-blocking) → `file_path` stays null; AI pipeline unaffected since it reads from `contract_text`; results page falls back to the text viewer.
- Contract exceeds 15,000 tokens even within the 20-page limit (dense text) → reject with a clear "contract too long" message before attempting extraction.

---

## C — Key Term Extraction (OpenAI)

**Maps to:** US-002 (extraction portion), US-003, US-004, FR-04, FR-11

**User flow:**
1. User clicks "Process Contract" after the pre-processing preview.
2. Backend builds a few-shot prompt (contract type + any custom terms) from `contract_text`, calls GPT-4o in JSON mode at temperature 0.1.
3. Response is parsed into per-term objects; on JSON parse failure, one automatic retry is sent ("return only the JSON array, no explanation").
4. Extracted terms are persisted and the results page renders the key terms panel with page number + confidence per term.
5. Terms with confidence < 50% render a ⚠️ warning; they are never hidden.

**DB schema touched:** `key_terms` (insert per term), `contracts` (`status` → `'processing'` → `'complete'`/`'error'`).

**DB tasks:** Create `key_terms` table + index on `contract_id`.

**API routes:** `POST /api/contracts/:id/process` (see engineering-doc.md §9).

**State management:** TanStack Query for the process mutation + `['keyTerms', contractId]` query populated from the mutation response (avoids an extra round-trip fetch immediately after processing).

**Component spec:**
- `<KeyTermsPanel />` — renders `<KeyTermRow />` per term.
- `<KeyTermRow />` — Term Name | Value | Page Number (clickable) | `<ConfidenceBadge />` (green ≥80%, amber 50–79%, red <50%) | expandable "Why?" showing `source_sentence`.

**Design notes:** Confidence color-coding always paired with a text label/icon (WCAG — never color-only signal). Low-confidence tooltip is non-dismissible per PRD §9.

**Edge cases:**
- OpenAI call fails/times out → 3-attempt exponential backoff, then `contracts.status = 'error'` with a "Try again" CTA; no partial/duplicate `key_terms` rows on retry (process route is idempotent per contract — clears prior terms for that contract before re-inserting on retry).
- Non-NDA/MSA document uploaded under the wrong type → soft warning if detected type mismatches selection; extraction still runs, likely with more low-confidence terms.
- Model returns a term with no `source_sentence` → treated as unreliable, still shown but flagged (guardrail per PRD §9).

---

## D — Custom Term Addition

**Maps to:** US-005, FR-05

**User flow:**
1. On the pre-processing preview, user clicks "+ Add Key Term" and types a custom term name (e.g. "Non-compete radius").
2. Term appears in the preview list with a "Custom" badge; user can add up to 5 total.
3. On "Process Contract", custom terms are injected zero-shot into the same extraction prompt/schema as standard terms.
4. Results include custom terms with the identical structure (value, page, confidence, source sentence).

**DB schema touched:** `custom_key_terms` (insert per custom term, `is_manual = true`).

**DB tasks:** Create `custom_key_terms` table + index on `contract_id`.

**API routes:** `POST /api/contracts/:id/custom-terms` (registers terms before processing); consumed by `POST /api/contracts/:id/process`.

**State management:** Zustand `upload-wizard-store` holds draft custom terms client-side until submission; no server round-trip per keystroke.

**Component spec:**
- `<AddCustomTermButton />` + `<CustomTermInput />` — inline text input, submit-on-enter, badge display.

**Design notes:** "Custom" badge uses a distinct but consistent design-system tag style from the standard-term list.

**Edge cases:**
- 6th term attempted → input disabled/blocked with inline message ("Up to 5 custom terms per analysis").
- Empty/whitespace-only term name → rejected client-side.
- Duplicate custom term name → allowed (no dedup requirement in PRD) but flagged as a UX nicety for later — not a hard MVP requirement.

---

## E — Results Display (PDF Viewer + Key Terms Panel)

**Maps to:** US-003, US-006, US-009, FR-06, FR-07

**User flow:**
1. Results page loads in a two-panel layout: PDF viewer (left) + key terms panel (right).
2. If Storage is available, PDF.js renders the actual PDF via a 1-hour signed URL; otherwise, a text-viewer fallback parses `[PAGE N]` markers from `contract_text` and renders each page as a labelled section.
3. Clicking a term's page number scrolls/highlights the corresponding page in whichever viewer is active (both respond to the same `targetPage` prop).
4. User can click any term to edit its value inline; save persists within 2 seconds and shows an "Edited" badge.

**DB schema touched:** `key_terms` (update on inline edit: `value`, `is_edited=true`, `original_value` preserved), `term_corrections` (insert on edit).

**DB tasks:** Create `term_corrections` table (nullable FKs to `key_terms` and `custom_key_terms`).

**API routes:** `GET /api/contracts/:id` (initial load), `PATCH /api/key-terms/:id` (inline edit).

**State management:** TanStack Query for contract/key-terms fetch; mutation with optimistic update on edit (rollback on failure); Zustand `ui-store` holds viewer zoom level and current page (shared between viewer and panel without prop-drilling).

**Component spec:**
- `<ContractViewer targetPage={page} />` — dispatches to `<PdfViewer />` or `<TextViewerFallback />` based on `file_path` presence.
- `<KeyTermRow />` — inline edit mode toggled on click, saves via mutation, shows "Edited" badge post-save.

**Design notes:** Both viewer variants must expose identical page-navigation behavior so `<KeyTermRow>` never needs to know which one is active. Responsive layout collapses to tabs under 768px (per engineering-doc.md §5).

**Edge cases:**
- PDF.js fails to render a malformed/unusual-font PDF → fallback link "Download PDF" plus automatic fallback to text viewer.
- Edit save fails (network) → optimistic update rolls back, inline error shown, value reverts.
- Very long `source_sentence` in the "Why?" expandable → truncate with "show more" rather than breaking layout.

---

## F — Contract Chat (Q&A)

**Maps to:** US-007, US-012, FR-08, FR-09

**User flow:**
1. User opens the "Chat with Contract" tab/floating button on the results page.
2. Types a question (e.g. "Is there an auto-renewal clause?").
3. Backend fetches `contract_text` + up to 200 prior messages (ascending), classifies the query (`contract` / `history` / `both`), calls GPT-4o (temp 0.4) with a system prompt enforcing document-only answers.
4. Response renders with a mandatory `[Page X]` citation, prefixed "Based on the document…"; clicking the citation scrolls the viewer to that page.
5. Reopening the contract later reloads the full prior chat session.

**DB schema touched:** `chat_sessions` (one per contract, created on first message), `chat_messages` (insert user + assistant messages per turn).

**DB tasks:** Create `chat_sessions` + `chat_messages` tables, index `(session_id, created_at)`; enable Realtime on `chat_messages`.

**API routes:** `POST /api/contracts/:id/chat` (send), `GET /api/contracts/:id/chat` (history).

**State management:** TanStack Query `['chatMessages', contractId]` seeded from initial history fetch; Supabase Realtime subscription on `chat_messages` (filtered by `session_id`) pushes new rows into the same query cache via `setQueryData`, so multiple open tabs/devices stay in sync without polling.

**Component spec:**
- `<ChatPanel />` → `<ChatMessageList />` (user right-aligned, assistant left-aligned) + `<ChatInput />` + `<SourceCitationLink page={n} />`.

**Design notes:** "Based on the document…" prefix and page citation styled per `docs/design.md` chat bubble spec; disclaimer banner ("Not legal advice") persistent on the results page, not just the chat tab.

**Edge cases:**
- Question about something absent from the document → expected, correct response is "I cannot find this in the document" (not a failure — automated regression test asserts this).
- Chat response exceeds 15s → loading indicator persists, but a hard timeout still surfaces a retry option past ~20s.
- 200-message history ceiling reached → oldest messages still stored in DB but only the most recent 200 are sent as context (per PRD assumption #14); UI still displays full scrollback via pagination.

---

## G — Dashboard & History

**Maps to:** US-008, FR-10

**User flow:**
1. On sign-in, user lands on `/dashboard` showing total contracts processed, breakdown by type (NDA/MSA), and a sortable list (date, name, type, status) of prior contracts.
2. Clicking any row opens that contract's results page (`/contracts/[id]`).
3. Empty state ("No contracts reviewed yet") shown for new users.

**DB schema touched:** Read-only queries against `contracts` (no new tables).

**DB tasks:** Ensure `(user_id, created_at desc)` index supports the sortable list efficiently.

**API routes:** No dedicated API route required — direct Supabase client read from the frontend (RLS-scoped), per engineering-doc.md §6/§9 note. If aggregate counts become expensive, promote to `GET /api/dashboard`.

**State management:** TanStack Query `['dashboard', userId]` with a reasonable `staleTime` (e.g. 30s) since this is not real-time-critical data.

**Component spec:**
- `<DashboardSummaryCard />` — totals + type breakdown.
- `<ContractHistoryTable />` — sortable columns, row click → navigation.

**Design notes:** Table follows `docs/design.md` data-table conventions; status column uses the same badge component family as confidence badges for visual consistency.

**Edge cases:**
- Zero contracts → empty state, not an empty table with headers only.
- Contract stuck in `status='processing'` (e.g. tab closed mid-process) → shown with a "Resume/Retry" affordance rather than appearing broken.

---

## H — Feedback Collection

**Maps to:** US-010, FR-12

**User flow:**
1. On the results page, user clicks thumbs-up or thumbs-down.
2. An optional text comment field appears.
3. Submission writes to `user_feedback`; no further UI action required (fire-and-forget confirmation toast).

**DB schema touched:** `user_feedback` (insert `user_id`, `contract_id`, `rating`, `comment`, `created_at`).

**DB tasks:** Create `user_feedback` table.

**API routes:** `POST /api/contracts/:id/feedback`.

**State management:** Simple TanStack Query mutation; no caching needed (write-only feature).

**Component spec:**
- `<FeedbackWidget />` — thumbs up/down toggle + optional `<textarea>`, submit button.

**Design notes:** Non-intrusive placement (footer of results page), consistent with the "Not legal advice" disclaimer area.

**Edge cases:**
- Duplicate feedback on the same contract → allowed as a new row (no PRD requirement to enforce one-per-contract) but flagged as a product decision to revisit post-MVP.
- Submission fails silently → must surface an inline error, not swallow the failure (consistent with the "no silent failures" reliability constraint).

---

*End of implementation-specs.md.*