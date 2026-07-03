# ContractIQ — Engineering Document

**Version:** 1.0  
**Date:** 2026-06-24  
**Status:** Approved for implementation  
**Source PRD:** `docs/ContractIQ_PRD.md`

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Product Scope](#2-product-scope)
3. [User Personas](#3-user-personas)
4. [User Flows](#4-user-flows)
5. [Frontend Architecture](#5-frontend-architecture)
6. [Backend Architecture](#6-backend-architecture)
7. [Database Design](#7-database-design)
8. [AI Architecture](#8-ai-architecture)
9. [API Specification](#9-api-specification)
10. [Feature Breakdown](#10-feature-breakdown)
11. [Folder Structure](#11-folder-structure)
12. [Naming Conventions](#12-naming-conventions)
13. [Testing Strategy](#13-testing-strategy)
14. [Specs to Implementation Mapping](#14-specs-to-implementation-mapping)

---

## 1. Executive Summary

**Product:** ContractIQ  
**Business Goal:** Reduce the time a non-lawyer needs to understand a standard NDA or MSA from 90 minutes (manual review or expensive ad-hoc legal consultation) to ≤ 15 minutes end-to-end inside the product.

**Problem Statement:** Business professionals at SMBs (5–250 employees) routinely sign NDAs and MSAs without fully understanding what they are agreeing to. Without in-house legal teams, reviewing a single contract takes 90–120 minutes, requires legal expertise most SMBs don't have, and frequently results in missed obligations, unfavourable terms, or costly disputes. Existing enterprise CLM tools (DocuSign, Ironclad, Kira) cost $50k–$500k/year. Generic AI tools (ChatGPT) produce unstructured summaries with no page attribution, no confidence scoring, and no contract-type-specific term libraries.

**Target Users:**
- Primary: Founders, COOs, Procurement Managers at companies with 5–250 employees signing 5–15 NDAs or MSAs per month
- Secondary: Freelancers and independent consultants signing 1–4 MSAs per month from larger clients

**Success Criteria:**

| Metric | Target |
|---|---|
| End-to-end review time | ≤ 15 minutes |
| Key term extraction accuracy (F1) | ≥ 88% NDA / ≥ 85% MSA |
| Time to first extracted term (P95) | ≤ 30 seconds for ≤ 20 pages |
| Confidence score calibration error | ≤ 0.10 per 10% bucket |
| 30-day user retention | ≥ 45% |
| AI extraction correction rate | ≤ 12% of terms |
| Cost per contract analysis | ≤ $0.25 (GPT-4o) |

---

## 2. Product Scope

### In Scope (MVP — v1.0)

- Email/password authentication via Supabase Auth
- PDF upload (text-layer PDFs only, ≤ 10 MB, ≤ 20 pages)
- Contract type selection: NDA or MSA
- Server-side PDF text extraction with `[PAGE N]` markers (runs once at upload; stored in DB)
- Standard key term extraction via OpenAI GPT-4o (NDA: 10 terms; MSA: 12 terms)
- Custom key term addition (up to 5 terms per contract before processing)
- Per-term: extracted value, page number, confidence score (0–100%), source sentence
- Visual confidence indicators: green ≥ 80%, amber 50–79%, red < 50% with ⚠️ warning
- Inline PDF viewer (PDF.js using Supabase Storage signed URLs)
- Text viewer fallback (parses `[PAGE N]` markers from DB when Storage unavailable)
- Click-to-navigate from key term to PDF page
- Inline key term editing with "Edited" badge and correction audit log
- Contract Q&A chat (grounded in document text; mandatory `[Page X]` citation)
- Persistent chat session per contract (one session; messages saved and reloaded)
- Dashboard: contract list (sortable), summary cards, status chips
- Per-contract feedback: thumbs up/down + optional comment
- "Not legal advice" disclaimer on every results page
- Supabase RLS on all tables; Storage RLS via SQL policies
- Desktop-only UI (min-width: 1024px)
- OpenAI retry logic (3 attempts with exponential backoff)
- Status polling on results page (`pending → processing → completed → error`)

### Out of Scope (MVP)

- Scanned PDFs / OCR
- Non-English contracts
- Mobile-responsive layouts
- Payment / subscription billing (Stripe deferred)
- Multi-user workspaces / team plans
- CSV or PDF report export
- Batch contract upload
- Contract comparison view
- Email notifications
- Admin dashboard
- API access for third-party integrations

### Future Enhancements

| Version | Feature |
|---|---|
| v1.1 | Export key terms to CSV; export results summary to PDF; dashboard analytics charts |
| v1.2 | Scanned PDF support via OCR; contract comparison; email notifications; multi-user workspace (team plans) |
| v2.0 | Fine-tuned extraction model; non-English contract support; mobile app |

---

## 3. User Personas

### Persona 1 — The Time-Pressed Founder / Ops Lead

| Attribute | Detail |
|---|---|
| Role | Founder, COO, Procurement Manager, Legal Operations Manager |
| Company | SaaS, agency, professional services, fintech, e-commerce; 5–250 employees |
| Legal coverage | No in-house legal counsel |
| Contract volume | 5–15 NDAs or MSAs per month |
| Current behaviour | Relies on Google searches or $250–$500/hr ad-hoc legal consultations |
| Primary pain | 90–120 min per review; misses auto-renewal clauses, indemnification limits, IP assignment |
| App permissions | Full access: upload, review, chat, dashboard, edit terms, feedback |
| Primary workflow | Upload contract → process → review key terms panel → verify low-confidence items → chat with contract |

### Persona 2 — The Freelancer / Consultant

| Attribute | Detail |
|---|---|
| Role | Designer, marketer, software developer, consultant |
| Contract volume | 1–4 MSAs per month from larger clients |
| Current behaviour | Often signs without reading carefully; power imbalance discourages pushback |
| Primary pain | Cannot afford legal review; unsure which clauses are non-standard or risky |
| App permissions | Same as Persona 1 (no role differentiation in MVP) |
| Primary workflow | Upload MSA → review extracted terms with confidence scores → identify high-risk clauses → ask specific chat questions |

### User Roles (MVP)

One role: **authenticated user**. All data scoped to `auth.uid()` via Supabase RLS. No admin role in MVP.

---

## 4. User Flows

### Flow 1 — New Visitor → Sign Up → Dashboard

```
User clicks "Get Started Free" on Landing Page
  → Frontend renders Supabase Auth sign-up modal (email + password)
  → Supabase Auth creates user and sends verification email
  → User verifies email and is redirected to /dashboard
  → Backend: No custom API call needed — Supabase handles auth
  → DB: auth.users record created; no application tables written yet
  → System Response: Dashboard renders empty state ("No contracts reviewed yet")
```

**States:** Loading (spinner on submit) → Success (redirect) → Error (invalid email / password too short — displayed inline below input)

### Flow 2 — Returning User → Sign In → Dashboard

```
User navigates to /sign-in
  → Enters email + password, clicks "Sign In"
  → Supabase Auth validates credentials and returns session token
  → Frontend stores session in browser (Supabase SDK manages this)
  → Redirect to /dashboard
  → Frontend queries contracts table (filtered by auth.uid()) for summary cards and list
  → DB: SELECT from contracts WHERE user_id = auth.uid() ORDER BY created_at DESC
  → System Response: Dashboard renders summary cards + paginated contract list
```

### Flow 3 — Core Review Flow: Upload → Process → Results

```
Step 1 — Upload Screen
  User selects contract type (NDA / MSA) from dropdown
  User drags-and-drops or file-picks a PDF
  Frontend validates: file type = application/pdf, size ≤ 10 MB
  → POST /api/upload (multipart form data: file, contract_type)
  → Backend: pdf-parse extracts text with [PAGE N] markers
  → Backend: Creates contracts row (status: 'pending', contract_text set, file_path null initially)
  → Backend: Attempts Supabase Storage upload (non-blocking — fire and forget)
      If Storage upload succeeds: UPDATE contracts SET file_path = '...' WHERE id = contract_id
      If Storage upload fails: log error, leave file_path = null, pipeline unaffected
  → API Response: { contract_id, status: 'pending' }
  → Frontend: Redirects to /contracts/[contract_id] (results page in loading state)

Step 2 — Pre-Processing Preview
  Results page renders key term preview (static list based on contract_type)
    NDA: Parties, Effective Date, Confidentiality Obligations, Permitted Disclosures,
         Term & Duration, Governing Law, Jurisdiction, IP Ownership, Non-Solicitation, Breach & Remedy
    MSA: Parties, Service Scope, Payment Terms, Invoice Schedule, Late Payment Penalty,
         Liability Cap, Indemnification, IP Ownership, Termination Clause, Governing Law,
         Dispute Resolution, Notice Period
  User can add up to 5 custom terms via "+ Add Key Term" input
  Custom terms appear in preview list with "Custom" badge

Step 3 — Process Contract
  User clicks "Process Contract"
  → POST /api/process { contract_id }
  → Backend: Reads contract_text from DB (never re-downloads PDF)
  → Backend: Builds extraction prompt (standard terms + custom terms + few-shot examples)
  → Backend: Calls OpenAI GPT-4o with JSON mode enabled
  → Backend: Parses response into key_terms rows; writes to DB
  → Backend: Updates contracts.status = 'completed'
  → If OpenAI error: retry up to 3 times with exponential backoff; on final failure: status = 'error', error_message set
  → Frontend: Polls contracts.status every 2 seconds during processing
  → On status = 'completed': Fetches key_terms and renders results panels
  → On status = 'error': Shows error message + "Retry" button

Step 4 — Results Page
  Two-panel layout renders:
  Left panel (55% width): PDF viewer (PDF.js) OR text viewer fallback
    PDF viewer: requests signed URL from GET /api/contracts/[id]/signed-url
    If signed URL unavailable (file_path null): text viewer parses [PAGE N] markers from contract_text
  Right panel (45% width): Key terms list
    Each term row: Term Name | Extracted Value | Page Number | Confidence badge
    Confidence ≥ 80%: green badge
    Confidence 50–79%: amber badge
    Confidence < 50%: red badge + ⚠️ icon + tooltip "Low confidence — verify in document directly"
    Expandable "Why?" section: verbatim source_sentence
  Clicking page number in key term panel: scrolls PDF viewer / text viewer to that page
```

### Flow 4 — Chat with Contract

```
User clicks "Chat" tab on Results page
  → Chat panel renders within right panel (replaces key terms list; tab navigation to switch)
  → Previous messages loaded from chat_messages (via chat_sessions linked to contract_id)
  → User types question and submits
  → POST /api/chat { contract_id, message }
  → Backend: Fetches chat_sessions WHERE contract_id (or creates one if first message)
  → Backend: Fetches all chat_messages for session (ascending order)
  → Backend: Builds OpenAI messages array: system prompt + [PAGE N]-tagged contract_text + conversation history + new user message
  → Backend: Calls OpenAI (temperature 0.4, max 1000 tokens)
  → Backend: Saves user message and assistant response to chat_messages
  → API Response: { message: { content, page_citation } }
  → Frontend: Appends both messages to chat UI
  → [Page X] citation in response is rendered as a clickable link that scrolls left panel to that page
```

### Flow 5 — Dashboard / Contract History

```
User on /dashboard
  → Frontend: Fetches contracts WHERE user_id (sorted by created_at DESC)
  → DB: SELECT id, title, contract_type, status, created_at FROM contracts WHERE user_id = auth.uid()
  → Renders summary cards: total count, NDA count, MSA count
  → Renders sortable table: contract name, type, date, status chip
  → User clicks a contract row → navigate to /contracts/[id] (results page, loads saved data)
```

### Flow 6 — Inline Term Editing

```
User clicks on an extracted term value in key terms panel
  → Input field replaces the value display (pre-filled with current value)
  → User edits and presses Enter or clicks "Save"
  → PATCH /api/terms/[id] { value: newValue }
  → Backend: Reads existing key_terms row; saves old value; updates value, sets is_edited = true
  → Backend: Inserts row into term_corrections (old_value, new_value, user_id, key_term_id)
  → DB Response: updated key_terms row
  → Frontend: Shows "Edited" badge next to the term; input reverts to display mode
```

---

## 5. Frontend Architecture

### Stack

| Layer | Choice | Rationale |
|---|---|---|
| Framework | Next.js 14 (App Router) | Server Components reduce client bundle; nested layouts match the auth-gate + dashboard + results page hierarchy |
| Language | TypeScript | Type safety on DB row shapes, API responses, and OpenAI JSON output |
| Styling | Tailwind CSS | Utility-first; consistent spacing/colour tokens; integrates with shadcn/ui |
| Component library | shadcn/ui | Accessible, unstyled-by-default components built on Radix UI; matches Tailwind workflow |
| Data fetching | TanStack Query (React Query) | Caching, polling support (used for contract status polling), mutation states |
| PDF rendering | react-pdf (PDF.js wrapper) | Client-side rendering from signed URL; page navigation; no server load |
| Auth | Supabase JS SDK v2 | Handles session storage, token refresh, and `onAuthStateChange` |
| Forms | React Hook Form + Zod | Lightweight; Zod schemas shared between frontend validation and API route validation |

### Routing Strategy (App Router)

```
app/
├── layout.tsx                     # Root layout — font, global styles, QueryClientProvider
├── page.tsx                       # Landing page (public)
├── (auth)/
│   ├── layout.tsx                 # Auth layout (redirect to dashboard if already signed in)
│   ├── sign-up/page.tsx
│   └── sign-in/page.tsx
├── (protected)/
│   ├── layout.tsx                 # Protected layout — checks session via Supabase middleware; redirects to /sign-in if unauthenticated
│   ├── dashboard/page.tsx
│   └── contracts/
│       ├── new/page.tsx           # Upload screen
│       └── [id]/page.tsx          # Results page (PDF viewer + key terms + chat)
```

Middleware (`middleware.ts` at root): reads Supabase session cookie; redirects unauthenticated users away from `(protected)` routes.

### UX States

Every async operation must render one of these states:

| State | When | Implementation |
|---|---|---|
| Loading | API call in-flight | Skeleton loaders (not spinners) for content areas; spinner on buttons |
| Empty | No data exists yet | Illustrated empty state with a clear CTA (e.g., "Upload your first contract") |
| Error | API or OpenAI error | Error card with human-readable message + retry button; never a raw error object |
| Success | Operation complete | Inline confirmation (badge, toast, or updated UI) — no full-page success screens |

### Accessibility

- WCAG 2.1 AA compliance
- All interactive elements keyboard-navigable
- Confidence badges use both colour AND icon (not colour alone) — critical for colour-blind users
- ⚠️ warning has `aria-label="Low confidence — verify this term"`
- PDF viewer has `aria-label="Contract PDF viewer"` and page navigation buttons are keyboard-accessible

### Page & Component Hierarchy

```
/dashboard
  └── DashboardPage
       ├── SummaryCards (total, NDA count, MSA count)
       └── ContractTable (sortable; row click → /contracts/[id])

/contracts/new
  └── UploadPage
       ├── ContractTypeSelector (NDA / MSA dropdown)
       ├── DropzoneUploader (drag-and-drop + file picker)
       └── UploadStatus (success → redirect; error → inline message)

/contracts/[id]
  └── ResultsPage
       ├── ResultsHeader (contract title, type, date, status, "Not legal advice" disclaimer)
       ├── LeftPanel (55% width)
       │    ├── PdfViewer (react-pdf; visible when file_path set and signed URL available)
       │    └── TextViewer (fallback; parses [PAGE N] markers; visible when no signed URL)
       └── RightPanel (45% width)
            ├── TabNavigation ("Key Terms" | "Chat")
            ├── [Tab: Key Terms]
            │    ├── PreProcessingPreview (before processing; shows terms list + custom term input)
            │    ├── ProcessButton (triggers POST /api/process)
            │    ├── ProcessingIndicator (3-step progress: Extracting → Analysing → Compiling)
            │    └── KeyTermsPanel (after processing)
            │         ├── KeyTermRow (name, value, page badge, confidence badge, source sentence expander, edit button)
            │         └── EditTermModal (inline input; save/cancel)
            └── [Tab: Chat]
                 ├── ChatMessageList (user messages right; assistant messages left)
                 ├── ChatInputBar (textarea + send button)
                 └── PageCitationLink (scrolls left panel to cited page)
```

---

## 6. Backend Architecture

### Stack

| Layer | Choice | Notes |
|---|---|---|
| API routes | Next.js App Router Route Handlers (`app/api/`) | Runs on Node.js runtime (not Edge) for pdf-parse compatibility |
| PDF extraction | `pdf-parse` (npm) | Synchronous text extraction; single call per upload |
| AI orchestration | OpenAI Node.js SDK | Structured JSON output; called only from API routes |
| Auth validation | Supabase SSR helpers | `createServerClient()` in every API route to validate session cookie |
| DB access | Supabase JS SDK (service role) | Service role key used server-side for writes; anon key used client-side for reads gated by RLS |
| File storage | Supabase Storage | Non-blocking upload; signed URL generation only when `file_path` is set |

### Core Systems

**Authentication & Authorization**
- All API routes call `createServerClient()` and read the session. Unauthenticated requests return `401`.
- All DB writes include `user_id = session.user.id` — RLS provides the second layer of protection.
- `middleware.ts` protects all `(protected)` routes at the Next.js edge before any page renders.

**PDF Processing Pipeline**
```
POST /api/upload
  ↓
1. Validate: file type = PDF, size ≤ 10 MB
2. Read file buffer
3. pdf-parse(buffer) → raw text
4. Inject [PAGE N] markers based on pdf-parse page metadata
5. Validate: extracted text length ≥ 100 words (if < 100 → reject as scanned PDF)
6. INSERT INTO contracts (user_id, title, contract_type, contract_text, status='pending')
7. ASYNC (non-blocking): upload buffer to Supabase Storage at path contracts/{user_id}/{id}/{filename}.pdf
   - On success: UPDATE contracts SET file_path = '...' WHERE id = ...
   - On failure: log error; leave file_path = null
8. Return { contract_id }
```

**Key Term Extraction Pipeline**
```
POST /api/process { contract_id }
  ↓
1. Fetch contracts row (verify user_id matches session)
2. Validate status = 'pending' (prevent double-processing)
3. UPDATE contracts SET status = 'processing'
4. Fetch custom_key_terms for this contract (if any)
5. Build extraction prompt (see AI Architecture section)
6. Call OpenAI GPT-4o (JSON mode, temperature 0.1, max 2000 tokens)
7. Parse JSON response → array of term objects
   - If JSON parse fails: send retry prompt; if second parse fails → mark error
8. Validate each term object has required fields; discard malformed terms
9. INSERT INTO key_terms (all terms, linked to contract_id)
10. UPDATE contracts SET status = 'completed'
   - On any OpenAI error after 3 retries: status = 'error', error_message = ...
```

**Chat Pipeline**
```
POST /api/chat { contract_id, message }
  ↓
1. Fetch contracts row (verify ownership + status = 'completed')
2. Upsert chat_sessions (get or create for this contract_id)
3. Fetch all chat_messages for session (ORDER BY created_at ASC)
4. INSERT user message into chat_messages
5. Build OpenAI messages array:
   - System: "Answer only from the document text. Include [Page X] citation."
   - User message: full contract_text as first human turn context
   - Conversation history: last 10 turns from chat_messages
   - New user message
6. Call OpenAI GPT-4o (temperature 0.4, max 1000 tokens)
7. Extract page_citation from [Page X] pattern in response
8. INSERT assistant message into chat_messages (content, page_citation)
9. UPDATE chat_sessions.updated_at
10. Return { content, page_citation }
```

### Service Interaction Diagram

```
Browser (Next.js Client Components)
    │
    ├─── Supabase JS SDK ────────────────→ Supabase Auth
    │    (session management,             Supabase DB (reads via RLS)
    │     realtime subscriptions)
    │
    └─── fetch() ────────────────────────→ Next.js API Routes (Node.js)
                                               │
                                               ├─── pdf-parse (in-process)
                                               │
                                               ├─── Supabase Admin Client ─→ DB writes, Storage
                                               │    (service role)
                                               │
                                               └─── OpenAI SDK ────────────→ OpenAI API (GPT-4o)
```

---

## 7. Database Design

### Shared Trigger Function

```sql
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;
```

Applied to: `contracts`, `chat_sessions`.

---

### Table: `contracts`

**Purpose:** One row per uploaded contract. Central record linking all other tables.

| Column | Type | Nullable | Default | Constraint |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `user_id` | `uuid` | NO | — | FK → `auth.users(id)` ON DELETE CASCADE |
| `title` | `text` | NO | — | Original filename (sanitised) |
| `contract_type` | `text` | NO | — | CHECK IN ('NDA', 'MSA') |
| `contract_text` | `text` | NO | — | Full extracted text with `[PAGE N]` markers |
| `status` | `text` | NO | `'pending'` | CHECK IN ('pending', 'processing', 'completed', 'error') |
| `file_path` | `text` | YES | `null` | Supabase Storage path; null if Storage upload failed |
| `error_message` | `text` | YES | `null` | Populated when status = 'error' |
| `page_count` | `integer` | YES | `null` | Total pages extracted by pdf-parse |
| `created_at` | `timestamptz` | NO | `now()` | |
| `updated_at` | `timestamptz` | NO | `now()` | Updated by trigger |

**Indexes:** `idx_contracts_user_id ON contracts(user_id)`, `idx_contracts_created_at ON contracts(created_at DESC)`

**RLS:** `ENABLE ROW LEVEL SECURITY`; policy per action: SELECT/INSERT/UPDATE/DELETE all use `USING (auth.uid() = user_id)`

---

### Table: `key_terms`

**Purpose:** Stores every extracted term (standard and custom) for a contract, with provenance data.

| Column | Type | Nullable | Default | Constraint |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `contract_id` | `uuid` | NO | — | FK → `contracts(id)` ON DELETE CASCADE |
| `user_id` | `uuid` | NO | — | FK → `auth.users(id)` ON DELETE CASCADE; denormalised for RLS |
| `term_name` | `text` | NO | — | e.g. "Governing Law", "Notice Period" |
| `value` | `text` | NO | — | Current value (may be edited) |
| `original_value` | `text` | YES | `null` | AI-extracted value before user edit; set on first edit |
| `page_number` | `integer` | NO | — | 1-indexed page where term was found |
| `confidence_score` | `float4` | NO | — | 0.0–1.0 as returned by OpenAI |
| `source_sentence` | `text` | YES | `null` | Verbatim contract sentence supporting extraction |
| `is_custom` | `boolean` | NO | `false` | True for user-added terms |
| `is_edited` | `boolean` | NO | `false` | True if user has manually corrected value |
| `created_at` | `timestamptz` | NO | `now()` | |

**Indexes:** `idx_key_terms_contract_id ON key_terms(contract_id)`, `idx_key_terms_user_id ON key_terms(user_id)`

**RLS:** SELECT/INSERT/UPDATE use `USING (auth.uid() = user_id)`; DELETE disabled for users (service role only)

---

### Table: `term_corrections`

**Purpose:** Append-only audit log of every user edit to an extracted term. Powers the feedback loop (correction rate monitoring).

| Column | Type | Nullable | Default | Constraint |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `key_term_id` | `uuid` | NO | — | FK → `key_terms(id)` ON DELETE CASCADE |
| `user_id` | `uuid` | NO | — | FK → `auth.users(id)` ON DELETE CASCADE |
| `contract_id` | `uuid` | NO | — | Denormalised for reporting; FK → `contracts(id)` ON DELETE CASCADE |
| `old_value` | `text` | NO | — | Value before edit |
| `new_value` | `text` | NO | — | Value after edit |
| `created_at` | `timestamptz` | NO | `now()` | |

**Indexes:** `idx_term_corrections_user_id ON term_corrections(user_id)`, `idx_term_corrections_contract_id ON term_corrections(contract_id)`

**RLS:** INSERT allowed for authenticated users using `WITH CHECK (auth.uid() = user_id)`; SELECT restricted to service role only (correction rate analytics must not be readable by end users)

---

### Table: `chat_sessions`

**Purpose:** One session per contract (enforced by UNIQUE constraint). Acts as the parent container for all chat messages.

| Column | Type | Nullable | Default | Constraint |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `contract_id` | `uuid` | NO | — | FK → `contracts(id)` ON DELETE CASCADE; **UNIQUE** |
| `user_id` | `uuid` | NO | — | FK → `auth.users(id)` ON DELETE CASCADE |
| `created_at` | `timestamptz` | NO | `now()` | |
| `updated_at` | `timestamptz` | NO | `now()` | Updated by trigger on each new message |

**Indexes:** `idx_chat_sessions_contract_id ON chat_sessions(contract_id)`, `idx_chat_sessions_user_id ON chat_sessions(user_id)`

**UNIQUE:** `UNIQUE (contract_id)` — enforces one session per contract

**RLS:** SELECT/INSERT/UPDATE use `USING (auth.uid() = user_id)`

---

### Table: `chat_messages`

**Purpose:** Individual chat turns (user questions and AI responses) within a session.

| Column | Type | Nullable | Default | Constraint |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `session_id` | `uuid` | NO | — | FK → `chat_sessions(id)` ON DELETE CASCADE |
| `user_id` | `uuid` | NO | — | FK → `auth.users(id)` ON DELETE CASCADE; denormalised for RLS |
| `role` | `text` | NO | — | CHECK IN ('user', 'assistant') |
| `content` | `text` | NO | — | Full message text |
| `page_citation` | `integer` | YES | `null` | Page number extracted from `[Page X]` in assistant response |
| `created_at` | `timestamptz` | NO | `now()` | |

**Indexes:** Composite `idx_chat_messages_session_created ON chat_messages(session_id, created_at)` — supports ordered fetch of a session's messages

**RLS:** SELECT/INSERT use `USING (auth.uid() = user_id)`; DELETE disabled (messages are immutable)

---

### Table: `user_feedback`

**Purpose:** One feedback record per user per contract (rating + optional comment).

| Column | Type | Nullable | Default | Constraint |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `user_id` | `uuid` | NO | — | FK → `auth.users(id)` ON DELETE CASCADE |
| `contract_id` | `uuid` | NO | — | FK → `contracts(id)` ON DELETE CASCADE |
| `rating` | `text` | NO | — | CHECK IN ('up', 'down') |
| `comment` | `text` | YES | `null` | Optional free-text comment (max 500 chars) |
| `created_at` | `timestamptz` | NO | `now()` | |

**UNIQUE:** `UNIQUE (user_id, contract_id)` — one feedback per user per contract

**Indexes:** `idx_user_feedback_contract_id ON user_feedback(contract_id)`, `idx_user_feedback_user_id ON user_feedback(user_id)`

**RLS:** INSERT uses `WITH CHECK (auth.uid() = user_id)`; SELECT uses `USING (auth.uid() = user_id)`; UPDATE/DELETE disabled

---

### Supabase Storage Setup

**Block 7 — Storage Bucket (SQL, not a dashboard step):**
```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('contracts', 'contracts', false, 10485760, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;
```

**Block 8 — Storage RLS Policies (SQL, not a dashboard step):**
```sql
CREATE POLICY "storage_insert_own_contracts"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'contracts' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "storage_select_own_contracts"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'contracts' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "storage_delete_own_contracts"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'contracts' AND auth.uid()::text = (storage.foldername(name))[1]);
```

**File path pattern:** `contracts/{user_id}/{contract_id}/{filename}.pdf`  
**Signed URL expiry:** 3600 seconds (1 hour)  
**Storage is non-blocking:** If the Storage upload fails, `file_path` remains `null`. The AI pipeline (extraction + chat) reads from `contract_text` in the DB and is unaffected. Only the PDF viewer is hidden; the text viewer fallback activates automatically.

---

### `database.sql` Completeness Checklist

The generated `database.sql` file (in `supabase/`) must satisfy all of the following before schema work is marked done:

- [ ] `update_updated_at()` trigger function
- [ ] `contracts` table + indexes + RLS (4 policies: SELECT, INSERT, UPDATE, DELETE) + `updated_at` trigger
- [ ] `key_terms` table + indexes + RLS
- [ ] `term_corrections` table + indexes + RLS (INSERT only for users; SELECT for service role only)
- [ ] `chat_sessions` table + UNIQUE (contract_id) + indexes + RLS + `updated_at` trigger
- [ ] `chat_messages` table + composite index on `(session_id, created_at)` + RLS
- [ ] `user_feedback` table + UNIQUE (user_id, contract_id) + index + RLS
- [ ] `INSERT INTO storage.buckets` — bucket `contracts`, private, 10 MB limit, PDF only
- [ ] `CREATE POLICY storage_insert_own_contracts ON storage.objects`
- [ ] `CREATE POLICY storage_select_own_contracts ON storage.objects`
- [ ] `CREATE POLICY storage_delete_own_contracts ON storage.objects`
- [ ] Migration block for `contract_text` column at top: `ALTER TABLE contracts ADD COLUMN IF NOT EXISTS contract_text text`

---

## 8. AI Architecture

### Provider & Model

| Parameter | Value |
|---|---|
| Provider | OpenAI API |
| Model | `gpt-4o` |
| Context window | 128k tokens |
| Extraction: response_format | `{ type: "json_object" }` |
| Extraction: temperature | `0.1` |
| Extraction: max_tokens | `2000` |
| Chat: temperature | `0.4` |
| Chat: max_tokens | `1000` |
| API key location | Server-side only (`OPENAI_API_KEY` env var); never in client bundle |

### Key Term Extraction Prompt Strategy

**Technique:** Few-shot (3 NDA examples + 3 MSA examples in system prompt)

**System prompt structure:**
```
You are a legal contract analyst. Extract the specified key terms from the contract text provided.
Return ONLY a JSON array. Each element must have exactly these fields:
  term_name (string), value (string), page_number (integer), confidence_score (float 0.0-1.0), source_sentence (string)

If a term is not found in the contract, include it with value: "Not found", confidence_score: 0.0, page_number: 0, source_sentence: "".

[3 NDA examples with correct JSON output]
[3 MSA examples with correct JSON output]
```

**User prompt structure:**
```
Contract type: {NDA | MSA}
Terms to extract: {standard term list for type} + {custom terms if any}

Contract text:
{contract_text with [PAGE N] markers}
```

**Standard NDA terms:** Parties, Effective Date, Confidentiality Obligations, Permitted Disclosures, Term & Duration, Governing Law, Jurisdiction, IP Ownership, Non-Solicitation, Breach & Remedy

**Standard MSA terms:** Parties, Service Scope, Payment Terms, Invoice Schedule, Late Payment Penalty, Liability Cap, Indemnification, IP Ownership, Termination Clause, Governing Law, Dispute Resolution, Notice Period

**Custom terms:** Appended to the term list as zero-shot items in the same JSON schema. Maximum 5 custom terms in MVP.

### Confidence Scoring

- Embedded in the extraction prompt — the model self-reports a `confidence_score` (0.0–1.0) alongside each term in the same JSON object
- No second inference call needed
- UI mapping: ≥ 0.80 = green, 0.50–0.79 = amber, < 0.50 = red + ⚠️ warning

### Error Recovery

**JSON parse failure:**
```
Retry prompt sent: "Your previous response was not valid JSON. Return only the JSON array, no explanation."
Single retry. If second response also fails to parse → mark contract status = 'error'.
```

**OpenAI API error (5xx, timeout, rate limit):**
```
Retry with exponential backoff: attempt 1 → wait 2s → attempt 2 → wait 4s → attempt 3
After 3 failures → status = 'error', error_message = human-readable message
Frontend shows error card + "Retry" button (re-triggers POST /api/process)
```

### Chat Q&A Prompt Strategy

**Technique:** Context-augmented (full contract text as context), with conversation history

**System prompt:**
```
You are a contract analysis assistant. Answer questions ONLY using the document text provided below.
If the answer cannot be found in the document, say exactly: "I cannot find this information in the provided contract."
Every response must end with a page citation in the format: [Page X] where X is the page number most relevant to your answer.
Do not use general legal knowledge. Do not speculate beyond the document text.
```

**Messages array construction:**
```
[
  { role: "system", content: [system prompt] },
  { role: "user", content: "Here is the contract text:\n\n{contract_text}" },
  { role: "assistant", content: "Understood. I will answer questions only from this contract." },
  ...conversation history (up to last 10 turns)...,
  { role: "user", content: "{user's new question}" }
]
```

### Token Guard

Before calling OpenAI for extraction, estimate token count:
- Rough estimate: `contract_text.length / 4` (characters to tokens)
- If estimated tokens > 15,000: reject with error "This contract exceeds the maximum supported length (approximately 20 pages). Longer contract support is coming soon."
- This prevents unexpected cost overruns and context window errors.

### Cost Controls

| Control | Mechanism |
|---|---|
| Per-analysis cost target | ≤ $0.25 (~15k input + 1.5k output tokens ≈ $0.097 at GPT-4o rates) |
| Token estimation guard | Reject contracts > 15k estimated tokens before API call |
| Max output tokens | 2000 (extraction), 1000 (chat) — hard cap on response length |
| Chat history limit | Last 10 turns only passed to model per request |
| OpenAI `user` parameter | Set to `user_id` hash for abuse monitoring |
| No training opt-in | `openai.chat.completions.create()` — no fine-tuning or training flags |

---

## 9. API Specification

All routes are under `app/api/`. All routes require a valid Supabase session cookie. All error responses follow the shape: `{ error: string, code?: string }`.

---

### POST `/api/upload`

**Purpose:** Receive a PDF, extract text, create the contracts record, begin non-blocking Storage upload.

**Auth required:** Yes

**Request:** `Content-Type: multipart/form-data`
| Field | Type | Required | Validation |
|---|---|---|---|
| `file` | File | Yes | `application/pdf`; ≤ 10 MB; ≤ 20 pages |
| `contract_type` | string | Yes | Must be `"NDA"` or `"MSA"` |
| `title` | string | No | Defaults to filename (sanitised); max 200 chars |

**Success Response:** `201`
```json
{ "contract_id": "uuid", "status": "pending" }
```

**Error Responses:**
| Status | Condition |
|---|---|
| `400` | Invalid file type, file too large, too many pages, contract_type invalid |
| `422` | Extracted text < 100 words (likely scanned PDF): `{ error: "Scanned PDFs are not supported yet. Please upload a text-layer PDF." }` |
| `401` | No valid session |
| `500` | Unexpected server error (pdf-parse crash, DB write failure) |

---

### POST `/api/process`

**Purpose:** Trigger OpenAI key term extraction for a contract already in the DB.

**Auth required:** Yes

**Request:** `Content-Type: application/json`
| Field | Type | Required |
|---|---|---|
| `contract_id` | string (UUID) | Yes |

**Success Response:** `200`
```json
{ "status": "processing" }
```
(Actual completion is polled via GET `/api/contracts/[id]/status`)

**Error Responses:**
| Status | Condition |
|---|---|
| `400` | contract_id missing or malformed |
| `403` | contract does not belong to authenticated user |
| `404` | contract_id not found |
| `409` | contract.status is not 'pending' (already processed or processing) |
| `422` | Contract text exceeds token limit |
| `500` | OpenAI error after retries; contract status set to 'error' |

---

### GET `/api/contracts/[id]/status`

**Purpose:** Poll the processing status of a contract (used by the results page while processing).

**Auth required:** Yes

**Success Response:** `200`
```json
{
  "status": "pending" | "processing" | "completed" | "error",
  "error_message": "string | null"
}
```

**Error Responses:** `403` (not owner), `404` (not found)

---

### GET `/api/contracts/[id]/key-terms`

**Purpose:** Fetch all key terms for a completed contract.

**Auth required:** Yes

**Success Response:** `200`
```json
{
  "terms": [
    {
      "id": "uuid",
      "term_name": "Governing Law",
      "value": "State of New York",
      "page_number": 4,
      "confidence_score": 0.94,
      "source_sentence": "This Agreement shall be governed by the laws of the State of New York.",
      "is_custom": false,
      "is_edited": false,
      "original_value": null
    }
  ]
}
```

**Error Responses:** `403` (not owner), `404` (not found), `409` (status is not 'completed')

---

### GET `/api/contracts/[id]/signed-url`

**Purpose:** Generate a 1-hour Supabase Storage signed URL for the inline PDF viewer.

**Auth required:** Yes

**Success Response:** `200`
```json
{ "signed_url": "https://..." }
```

**Error Responses:**
| Status | Condition |
|---|---|
| `404` | contract not found or `file_path` is null (Storage upload failed) |
| `403` | not the contract owner |

---

### POST `/api/chat`

**Purpose:** Submit a user question and receive an AI response grounded in the contract text.

**Auth required:** Yes

**Request:**
| Field | Type | Required | Validation |
|---|---|---|---|
| `contract_id` | string (UUID) | Yes | Must be 'completed' |
| `message` | string | Yes | 1–2000 chars |

**Success Response:** `200`
```json
{
  "message": {
    "id": "uuid",
    "role": "assistant",
    "content": "The NDA has a term of 36 months from the Effective Date. [Page 2]",
    "page_citation": 2,
    "created_at": "2026-06-24T10:00:00Z"
  }
}
```

**Error Responses:**
| Status | Condition |
|---|---|
| `400` | message empty or too long, contract_id missing |
| `403` | contract not owned by user |
| `404` | contract not found |
| `409` | contract status is not 'completed' |
| `500` | OpenAI error after retries |

---

### PATCH `/api/terms/[id]`

**Purpose:** Update an extracted term value inline; write audit record.

**Auth required:** Yes

**Request:**
| Field | Type | Required | Validation |
|---|---|---|---|
| `value` | string | Yes | 1–1000 chars |

**Success Response:** `200`
```json
{
  "term": {
    "id": "uuid",
    "value": "Updated value",
    "is_edited": true,
    "original_value": "Previous AI value"
  }
}
```

**Error Responses:** `400` (empty value), `403` (not owner), `404` (term not found)

---

### POST `/api/feedback`

**Purpose:** Submit thumbs up/down rating and optional comment for a contract review.

**Auth required:** Yes

**Request:**
| Field | Type | Required | Validation |
|---|---|---|---|
| `contract_id` | string (UUID) | Yes | Must be 'completed' |
| `rating` | string | Yes | `"up"` or `"down"` |
| `comment` | string | No | Max 500 chars |

**Success Response:** `201`
```json
{ "feedback_id": "uuid" }
```

**Error Responses:**
| Status | Condition |
|---|---|
| `400` | Invalid rating value |
| `403` | Contract not owned by user |
| `404` | Contract not found |
| `409` | Feedback already submitted for this contract |

---

## 10. Feature Breakdown

### Phase 1 — MVP (Weeks 1–11)

All P0 and P1 user stories from the PRD.

| Feature | User Stories | Priority |
|---|---|---|
| Auth & Session Management | US-001 | P0 |
| PDF Upload & Text Extraction | US-002 | P0 |
| Key Term Extraction (OpenAI) | US-002, US-003, US-004 | P0 |
| Custom Term Addition | US-005 | P0 |
| Results Display: Key Terms Panel | US-003, US-004 | P0 |
| Results Display: PDF Viewer + Text Fallback | US-006 | P1 |
| Contract Chat (Q&A) | US-007, US-012 | P1 |
| Dashboard & Contract History | US-008 | P1 |
| Inline Key Term Editing | US-009 | P1 |
| Feedback Collection | US-010 | P2 |

**Acceptance Criteria (Phase 1 gate):**
- Upload → extraction → results visible in ≤ 30 seconds P95 for ≤ 20 pages
- ≥ 88% F1 on NDA test set; ≥ 85% on MSA test set (measured against 50-contract eval set)
- Zero cross-user data leakage (verified by test accounts attempting cross-user reads)
- "Not legal advice" disclaimer visible on every results page

### Phase 2 — Post-Launch Iteration (Weeks 15–18)

| Feature | Priority |
|---|---|
| Export key terms to CSV | P2 |
| Export results summary to PDF | P2 |
| Dashboard analytics charts (contracts by month, correction rate) | P2 |

### Phase 3 — Growth (Weeks 19–24)

| Feature |
|---|
| Scanned PDF support via OCR (AWS Textract or equivalent) |
| Contract comparison view (side-by-side key terms across 2 contracts) |
| Email notifications on processing completion |
| Multi-user workspace (team plans, up to 5 seats) |

---

## 11. Folder Structure

```
contractiq/                          # Next.js 14 project root
├── app/
│   ├── layout.tsx                   # Root layout — fonts, global styles, providers
│   ├── page.tsx                     # Landing page (public)
│   ├── globals.css                  # Tailwind base styles
│   │
│   ├── (auth)/
│   │   ├── layout.tsx               # Redirect-if-authed wrapper
│   │   ├── sign-up/
│   │   │   └── page.tsx
│   │   └── sign-in/
│   │       └── page.tsx
│   │
│   ├── (protected)/
│   │   ├── layout.tsx               # Session guard; redirect to /sign-in if no session
│   │   ├── dashboard/
│   │   │   └── page.tsx
│   │   └── contracts/
│   │       ├── new/
│   │       │   └── page.tsx         # Upload screen
│   │       └── [id]/
│   │           └── page.tsx         # Results page
│   │
│   └── api/
│       ├── upload/route.ts
│       ├── process/route.ts
│       ├── chat/route.ts
│       ├── feedback/route.ts
│       └── contracts/
│           └── [id]/
│               ├── status/route.ts
│               ├── key-terms/route.ts
│               └── signed-url/route.ts
│               └── terms/
│                   └── [termId]/route.ts   # PATCH for inline editing
│
├── components/
│   ├── ui/                          # shadcn/ui generated components
│   ├── auth/
│   │   ├── SignUpForm.tsx
│   │   └── SignInForm.tsx
│   ├── upload/
│   │   ├── ContractTypeSelector.tsx
│   │   ├── DropzoneUploader.tsx
│   │   └── UploadStatus.tsx
│   ├── results/
│   │   ├── ResultsHeader.tsx        # Contract title, type, date, disclaimer
│   │   ├── LeftPanel.tsx            # Orchestrates PdfViewer / TextViewer
│   │   ├── PdfViewer.tsx            # react-pdf; accepts targetPage prop
│   │   ├── TextViewer.tsx           # Fallback; parses [PAGE N] markers; accepts targetPage prop
│   │   ├── RightPanel.tsx           # Tab navigation: Key Terms | Chat
│   │   ├── KeyTermsPanel.tsx        # Term list + pre-processing preview
│   │   ├── KeyTermRow.tsx           # Single term: value, page, confidence, source, edit
│   │   ├── ConfidenceBadge.tsx      # Green/amber/red badge + warning icon
│   │   ├── EditTermModal.tsx        # Inline edit input
│   │   ├── ProcessingIndicator.tsx  # 3-step progress display
│   │   └── ChatPanel.tsx            # Chat message list + input bar
│   ├── dashboard/
│   │   ├── SummaryCards.tsx
│   │   └── ContractTable.tsx
│   └── shared/
│       ├── DisclaimerBanner.tsx     # "Not legal advice" — rendered on every results page
│       ├── ErrorCard.tsx
│       └── EmptyState.tsx
│
├── lib/
│   ├── supabase/
│   │   ├── client.ts                # createBrowserClient() — for Client Components
│   │   └── server.ts                # createServerClient() — for Server Components & API routes
│   ├── openai/
│   │   ├── extract.ts               # buildExtractionPrompt(), callExtractionAPI()
│   │   └── chat.ts                  # buildChatMessages(), callChatAPI()
│   ├── pdf/
│   │   └── parse.ts                 # parsePdf(buffer) → { text, pageCount }; injects [PAGE N] markers
│   ├── validation/
│   │   └── schemas.ts               # Zod schemas for all API request bodies
│   └── utils/
│       ├── tokens.ts                # estimateTokenCount(text) utility
│       └── confidence.ts            # confidenceToColor(), confidenceToLabel() utilities
│
├── hooks/
│   ├── useContractStatus.ts         # Polls /api/contracts/[id]/status every 2s
│   └── useSignedUrl.ts              # Fetches and caches signed URL
│
├── types/
│   └── index.ts                     # Shared TypeScript types: Contract, KeyTerm, ChatMessage, etc.
│
├── middleware.ts                    # Supabase session check; redirect unauthenticated users
│
├── supabase/
│   └── database.sql                 # Single paste-and-run SQL file (all tables, RLS, storage)
│
├── docs/
│   ├── ContractIQ_PRD.md
│   ├── engineering/
│   │   ├── engineering-doc.md       # This file
│   │   └── implementation-specs.md
│   └── specs/                       # Granular specs (Stage 2 output)
│
├── .env.example                     # All required environment variables
├── .env.local                       # Not committed; filled from .env.example
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## 12. Naming Conventions

### Files & Folders

| Type | Convention | Example |
|---|---|---|
| Next.js pages | kebab-case directory + `page.tsx` | `contracts/new/page.tsx` |
| Next.js layouts | kebab-case directory + `layout.tsx` | `(protected)/layout.tsx` |
| API route handlers | `route.ts` inside method-named directory | `api/upload/route.ts` |
| React components | PascalCase `.tsx` | `KeyTermsPanel.tsx` |
| Hooks | camelCase prefixed with `use` | `useContractStatus.ts` |
| Utilities | camelCase | `tokens.ts`, `confidence.ts` |
| Types | `index.ts` in `types/` | `types/index.ts` |

### Components

- All component files: PascalCase, e.g. `ConfidenceBadge.tsx`
- Props interfaces: `ComponentNameProps`, e.g. `KeyTermRowProps`
- Always named exports (not default exports) for components

### Database Tables & Columns

- Tables: snake_case, plural — `contracts`, `key_terms`, `chat_messages`, `user_feedback`
- Columns: snake_case — `contract_type`, `page_number`, `confidence_score`, `is_edited`
- Foreign keys: `{referenced_table_singular}_id` — `contract_id`, `session_id`, `user_id`
- Timestamps: `created_at`, `updated_at` (always `timestamptz`)
- Boolean flags: `is_` prefix — `is_custom`, `is_edited`

### API Routes

- Plural resource names: `/api/contracts`, `/api/terms`
- Nested resources: `/api/contracts/[id]/key-terms`
- Actions that are not CRUD: `/api/process`, `/api/upload`, `/api/chat`

### Environment Variables

| Prefix | Scope | Example |
|---|---|---|
| `NEXT_PUBLIC_` | Client-safe (browser) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| No prefix | Server-only | `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY` |

### TypeScript Types

- DB row types: match table name in PascalCase — `Contract`, `KeyTerm`, `ChatMessage`, `UserFeedback`
- API request/response shapes: `{Verb}{Resource}Request`, `{Verb}{Resource}Response` — `UploadContractRequest`, `ProcessContractResponse`
- Enums as const objects: `CONTRACT_TYPES`, `CONTRACT_STATUSES`

---

## 13. Testing Strategy

### Unit Tests (Jest + React Testing Library)

Target: utility functions, pure logic, individual UI components

| What to test | Examples |
|---|---|
| `lib/pdf/parse.ts` | `parsePdf()` inserts correct `[PAGE N]` markers; rejects buffers yielding < 100 words |
| `lib/utils/tokens.ts` | `estimateTokenCount()` returns values within expected range for known inputs |
| `lib/utils/confidence.ts` | `confidenceToColor()` returns correct colour for each confidence band |
| `lib/openai/extract.ts` | `buildExtractionPrompt()` includes all standard terms + custom terms in output string |
| `components/results/ConfidenceBadge.tsx` | Renders green for 0.85, amber for 0.65, red+warning for 0.40 |
| API route validation | Zod schemas reject malformed inputs (no file, wrong type, oversized) |

Coverage target: ≥ 80% on `lib/` utilities.

### Integration Tests (Supabase local dev + Node `supertest`)

Target: API route behaviour with real DB and mocked OpenAI

| Route | Test cases |
|---|---|
| `POST /api/upload` | Valid PDF → 201 with contract_id; invalid type → 400; scanned PDF → 422 |
| `POST /api/process` | Contract in 'pending' → status changes to 'completed'; double-processing → 409 |
| `POST /api/chat` | Valid question → 200 with page_citation; contract not 'completed' → 409 |
| `PATCH /api/terms/[id]` | Valid edit → is_edited true + term_corrections row created; empty value → 400 |
| `POST /api/feedback` | First submission → 201; second submission same contract → 409 |
| Cross-user access | User B cannot read/write User A's contracts, key_terms, chat_messages |

RLS verification: Run all CRUD operations from a second test user account. Expect all cross-user operations to return empty results or 403.

### E2E Tests (Playwright)

Target: complete user journeys in a headless browser

**Happy paths:**
1. Sign up → verify → land on dashboard (empty state)
2. Sign in → upload NDA → process → results page shows ≥ 8 key terms with confidence badges
3. Click key term page number → PDF viewer scrolls to correct page
4. Chat with contract → response includes `[Page X]` citation → clicking citation scrolls viewer
5. Edit a term → "Edited" badge appears; reload page → edited value persists
6. Submit feedback → thumbs up confirmed; retry submission → rejected with "already submitted"
7. Navigate to dashboard → contract appears in list → click row → results page re-opens with saved data

**Error paths:**
8. Upload a non-PDF → inline error "Only PDF files are accepted"
9. Upload a 25-page PDF → inline error about page limit
10. Simulate OpenAI 500 (mock) → results page shows error card with "Retry" button

### Offline Evaluation Suite (pre-launch gate)

| Eval | Dataset | Target | Cadence |
|---|---|---|---|
| NDA key term extraction F1 | 30 manually labelled NDA contracts | ≥ 88% F1 | Every release |
| MSA key term extraction F1 | 20 manually labelled MSA contracts | ≥ 85% F1 | Every release |
| Page number accuracy | Same 50 contracts | ≥ 92% correct page | Every release |
| Chat groundedness | 50 Q&A pairs reviewed by a human | ≤ 5% hallucinated | Monthly |
| Confidence calibration | Calibration curve on eval set | Error ≤ 0.10 per bucket | Monthly |

---

## 14. Specs to Implementation Mapping

| Spec Feature | Page(s) | Components | API Route(s) | DB Tables |
|---|---|---|---|---|
| Auth & Session Management | `/sign-up`, `/sign-in`, `(protected)/layout.tsx`, `middleware.ts` | `SignUpForm`, `SignInForm` | Supabase Auth (no custom route) | `auth.users` |
| PDF Upload & Text Extraction | `/contracts/new/page.tsx` | `ContractTypeSelector`, `DropzoneUploader`, `UploadStatus` | `POST /api/upload` | `contracts` |
| Key Term Extraction | `/contracts/[id]/page.tsx` | `KeyTermsPanel`, `PreProcessingPreview`, `ProcessButton`, `ProcessingIndicator` | `POST /api/process`, `GET /api/contracts/[id]/status`, `GET /api/contracts/[id]/key-terms` | `contracts`, `key_terms`, `term_corrections` |
| Custom Term Addition | `/contracts/[id]/page.tsx` (pre-processing state) | `KeyTermsPanel` (custom term input section) | `POST /api/process` (custom terms included in body) | `key_terms` (is_custom = true) |
| Results: Key Terms Panel | `/contracts/[id]/page.tsx` | `RightPanel`, `KeyTermsPanel`, `KeyTermRow`, `ConfidenceBadge`, `EditTermModal` | `PATCH /api/terms/[id]` | `key_terms`, `term_corrections` |
| Results: PDF Viewer + Text Fallback | `/contracts/[id]/page.tsx` | `LeftPanel`, `PdfViewer`, `TextViewer` | `GET /api/contracts/[id]/signed-url` | `contracts` (reads contract_text + file_path) |
| Contract Chat (Q&A) | `/contracts/[id]/page.tsx` | `RightPanel` (Chat tab), `ChatPanel` | `POST /api/chat` | `chat_sessions`, `chat_messages` |
| Dashboard & History | `/dashboard/page.tsx` | `SummaryCards`, `ContractTable` | Direct Supabase client query (no custom API route needed) | `contracts` |
| Inline Key Term Editing | `/contracts/[id]/page.tsx` | `KeyTermRow`, `EditTermModal` | `PATCH /api/terms/[id]` | `key_terms`, `term_corrections` |
| Feedback Collection | `/contracts/[id]/page.tsx` | `FeedbackWidget` (in `ResultsHeader` or bottom of `RightPanel`) | `POST /api/feedback` | `user_feedback` |
