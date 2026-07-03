# ContractIQ — Implementation Specs

**Version:** 1.1  
**Date:** 2026-06-24  
**Status:** Approved for implementation  
**Source:** `docs/engineering/engineering-doc.md`, `docs/ContractIQ_PRD.md`

---

## Feature Index

1. [Auth & Session Management](#feature-auth--session-management)
2. [PDF Upload & Text Extraction](#feature-pdf-upload--text-extraction)
3. [Key Term Extraction (OpenAI)](#feature-key-term-extraction-openai)
4. [Custom Term Addition](#feature-custom-term-addition)
5. [Results Display: Key Terms Panel](#feature-results-display-key-terms-panel)
6. [Results Display: PDF Viewer + Text Fallback](#feature-results-display-pdf-viewer--text-fallback)
7. [Contract Chat (Q&A)](#feature-contract-chat-qa)
8. [Dashboard & Contract History](#feature-dashboard--contract-history)
9. [Inline Key Term Editing](#feature-inline-key-term-editing)
10. [Feedback Collection](#feature-feedback-collection)
11. [Conversation Memory Layer](#feature-conversation-memory-layer)

---

## Feature: Auth & Session Management

### Description

- Users interact with the Supabase Auth UI (email + password sign-up and sign-in) embedded in the ContractIQ frontend
- The auth UI appears on two dedicated pages: `/sign-up` and `/sign-in`
- After successful sign-up, the user is redirected to `/dashboard`; after sign-in, same redirect
- No application data is stored at sign-up time beyond the `auth.users` Supabase record
- Session is persisted in browser local storage by the Supabase JS SDK; no custom cookie handling required
- A Next.js middleware file protects all `(protected)` routes and redirects unauthenticated users to `/sign-in`

---

### User Flow

1. **Sign Up:**
   - User visits `/` (landing page) and clicks "Get Started Free"
   - Frontend navigates to `/sign-up`
   - User enters email and password (min 8 chars); clicks "Create Account"
   - Supabase Auth sends a verification email
   - User clicks the link in the email → redirected back to the app → session established → redirect to `/dashboard`
   - If email already in use: inline error "An account with this email already exists. Sign in instead."
   - If password too short: inline error below the password field before submission

2. **Sign In:**
   - User visits `/sign-in`
   - Enters email and password; clicks "Sign In"
   - On success: redirect to `/dashboard`
   - On failure: inline error "Invalid email or password"
   - Loading state: button shows spinner and is disabled while request is in-flight

3. **Sign Out:**
   - User clicks "Sign Out" in the top-right navigation (available on all protected pages)
   - Supabase `signOut()` is called; session cleared
   - Redirect to `/sign-in`

4. **Protected Routes:**
   - `middleware.ts` runs on every request to `/(protected)/**`
   - Reads the Supabase session from the request cookie
   - If no valid session: redirect to `/sign-in?redirect={currentPath}`
   - After sign-in: redirect to the original path from the query param (or `/dashboard` as fallback)

---

### Placement

- Sign-up and sign-in forms: centered card on a full-screen page
- Card width: 400px; centered both horizontally and vertically
- Background: neutral grey (`bg-gray-50`)
- Card: white background, `rounded-xl`, `shadow-md`, `p-8`
- Logo above card, centred

---

### DB Schema

**No application tables are written during auth.** Supabase Auth manages its own `auth.users` table internally.

The `user_id` column in all application tables is a UUID that references `auth.users(id)`. This FK is enforced at the DB level with `ON DELETE CASCADE`.

---

### DB Tasks

No SQL setup required beyond what Supabase Auth provides automatically. All application tables reference `auth.users(id)` — see `database.sql` for FK definitions.

---

### DB Helper Functions

**`getCurrentUserId(supabaseServerClient)`**
- Parameters: a server-side Supabase client instance
- Returns: `string` (UUID) — the authenticated user's ID
- Used in every API route to get `session.user.id` and scope all DB operations
- Throws a `401` response if no valid session

---

### API Routes

Auth is handled entirely by Supabase Auth — no custom API routes required.

Supabase SDK calls used:
- `supabase.auth.signUp({ email, password })`
- `supabase.auth.signInWithPassword({ email, password })`
- `supabase.auth.signOut()`
- `supabase.auth.getSession()` — called in middleware and every API route

---

### State Management

- Component: `SignUpForm`, `SignInForm`
- State variables:
  - `email: string` — controlled input
  - `password: string` — controlled input
  - `isLoading: boolean` — true while Supabase call is in-flight
  - `error: string | null` — inline error message
- On submit: set `isLoading = true`, call Supabase, handle response, set `isLoading = false`
- Error clears when user modifies any input field

---

### Component

**`SignUpForm`** — `components/auth/SignUpForm.tsx`
- Props: none (self-contained; uses Next.js `router.push()` for redirect)
- Renders: email input, password input, submit button, inline error display, "Already have an account? Sign in" link
- Submit disabled while `isLoading = true`
- On success: calls `router.push('/dashboard')`

**`SignInForm`** — `components/auth/SignInForm.tsx`
- Props: `redirectTo?: string` — path to redirect after successful sign-in
- Renders: email input, password input, submit button, inline error, "Don't have an account? Sign up" link
- On success: calls `router.push(redirectTo ?? '/dashboard')`

---

### Design

- Header: ContractIQ logo + page title ("Create your account" / "Welcome back")
- Inputs: full-width, `rounded-md border`, `h-10`, label above input
- Submit button: full-width, primary brand colour, white text, spinner when loading
- Error message: red text `text-sm text-red-600` below the relevant field (field-level) or below the button (form-level)
- "Not legal advice" disclaimer is NOT shown on auth pages

---

### Edge Cases

| Scenario | Handling |
|---|---|
| Email already registered (sign-up) | Inline error: "An account with this email already exists" |
| Wrong password (sign-in) | Inline error: "Invalid email or password" — do not distinguish which field is wrong |
| Email not verified | Supabase Auth handles; user sees "Check your email for a verification link" |
| User closes tab before verifying email | Email link remains valid for 24 hours (Supabase default); user can re-request from sign-in page |
| Session expires mid-session | Supabase SDK auto-refreshes tokens; if refresh fails, next API call returns 401 → middleware redirects to `/sign-in` |
| User navigates directly to `/dashboard` without session | Middleware intercepts; redirects to `/sign-in?redirect=/dashboard` |
| Network error on submit | Error: "Unable to connect. Check your internet connection and try again." |

---

## Feature: PDF Upload & Text Extraction

### Description

- Users upload a PDF contract (NDA or MSA) after selecting the contract type
- The upload page is at `/contracts/new`
- PDF text is extracted **server-side at upload time** using `pdf-parse` and stored in `contracts.contract_text` with `[PAGE N]` markers
- Supabase Storage upload is attempted **non-blocking** in the background; if it fails, `file_path` remains `null` and the AI pipeline is unaffected
- After upload completes, the user is redirected to `/contracts/[id]` (results page) where they see the pre-processing preview

---

### User Flow

1. User navigates to `/contracts/new` (via "Review a Contract" button on dashboard or nav)
2. **Contract type selection:** dropdown with two options: "NDA — Non-Disclosure Agreement" and "MSA — Master Service Agreement". Selection required before upload is enabled.
3. **File selection:** drag-and-drop zone OR "Browse files" button. Accepts `.pdf` only.
4. **Client-side validation (before upload):**
   - File type must be `application/pdf` → error: "Only PDF files are accepted"
   - File size must be ≤ 10 MB → error: "File is too large. Maximum size is 10 MB."
5. **Upload in-flight state:** progress bar (indeterminate) + "Uploading..." text. Drop zone and type selector are disabled.
6. **Server-side validation:**
   - If page count > 20 → `400` → error: "This contract is too long. Maximum is 20 pages."
   - If extracted text < 100 words → `422` → error: "Scanned PDFs are not supported yet. Please upload a text-layer PDF."
7. **On success:** `201` response with `{ contract_id }` → frontend redirects to `/contracts/[contract_id]`
8. **On error:** error message displayed inline inside the drop zone; user can try again without refreshing

---

### Placement

- Full-page layout within the `(protected)` shell
- Upload card: centred, max-width 640px
- Drop zone: dashed border, `rounded-xl`, minimum height 200px, icon + "Drag your PDF here or browse" copy
- Contract type selector above the drop zone
- Upload button below the drop zone (enabled only when type selected + file chosen)

---

### DB Schema

**Table: `contracts`** (created at upload time)

| Column | Set at upload |
|---|---|
| `id` | Generated (`gen_random_uuid()`) |
| `user_id` | From session |
| `title` | Sanitised filename (strip extension, replace underscores/hyphens with spaces, max 200 chars) |
| `contract_type` | From form (`NDA` or `MSA`) |
| `contract_text` | Full extracted text with `[PAGE N]` markers |
| `status` | `'pending'` |
| `file_path` | `null` at insert time; updated asynchronously if Storage upload succeeds |
| `error_message` | `null` |
| `page_count` | Integer from pdf-parse metadata |
| `created_at`, `updated_at` | `now()` |

---

### DB Tasks

```sql
-- Run in Supabase SQL Editor (included in database.sql)

CREATE TABLE IF NOT EXISTS contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  contract_type text NOT NULL CHECK (contract_type IN ('NDA', 'MSA')),
  contract_text text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'error')),
  file_path text,
  error_message text,
  page_count integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contracts_user_id ON contracts(user_id);
CREATE INDEX IF NOT EXISTS idx_contracts_created_at ON contracts(created_at DESC);

ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY contracts_select_own ON contracts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY contracts_insert_own ON contracts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY contracts_update_own ON contracts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY contracts_delete_own ON contracts FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER contracts_updated_at
  BEFORE UPDATE ON contracts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

---

### DB Helper Functions

**`createContractRecord(supabase, { userId, title, contractType, contractText, pageCount })`**
- Parameters: server Supabase client; object with fields above
- Returns: `{ id: string }` — the new contract's UUID
- Table: `contracts`
- No conflict check needed (each upload always creates a new row)

**`updateContractFilePath(supabase, contractId, filePath)`**
- Parameters: server Supabase client; contract UUID; Storage path string
- Returns: void
- Runs asynchronously after Storage upload completes; does not block the API response

---

### API Routes

#### `POST /api/upload`

**Request:** `multipart/form-data`
- `file`: PDF binary
- `contract_type`: `"NDA"` | `"MSA"`

**Processing steps:**
1. Validate session → get `userId`
2. Read file buffer from form data
3. Validate MIME type === `application/pdf`; size ≤ 10485760 bytes
4. `pdf-parse(buffer)` → `{ text, numpages }`
5. Validate `numpages ≤ 20`; validate word count of text ≥ 100
6. Inject `[PAGE N]` markers into text using pdf-parse page break data
7. `INSERT INTO contracts` → get `contractId`
8. `void uploadToStorage(buffer, userId, contractId, filename)` — fire and forget; `catch` logs error silently
9. Return `201 { contract_id: contractId, status: 'pending' }`

**Error responses:**
- `400`: missing file, invalid type, file too large, invalid contract_type
- `422`: page count > 20; text word count < 100
- `401`: no session
- `500`: DB insert failure

---

### State Management

- Component owner: `UploadPage` (server component shell) + `DropzoneUploader` (client component)
- State in `DropzoneUploader`:
  - `contractType: 'NDA' | 'MSA' | null` — selected type; `null` initially
  - `file: File | null` — selected file
  - `isUploading: boolean`
  - `error: string | null`
- Upload button enabled only when `contractType !== null && file !== null && !isUploading`
- On success: `router.push('/contracts/' + contract_id)`
- On error: `error` is set; `isUploading = false`; user can retry

---

### Component

**`DropzoneUploader`** — `components/upload/DropzoneUploader.tsx`
- Props: `onSuccess: (contractId: string) => void`
- Manages contract type selector, drag-and-drop zone, and upload trigger internally
- Uses the HTML5 File API for drag events; fallback `<input type="file" accept=".pdf">`
- Renders progress bar (indeterminate) during upload
- Does NOT accept multiple files

**`ContractTypeSelector`** — `components/upload/ContractTypeSelector.tsx`
- Props: `value: string | null; onChange: (value: 'NDA' | 'MSA') => void`
- Renders shadcn `Select` component with two options

---

### Design

- Drop zone idle: dashed border `border-dashed border-2 border-gray-300`, upload icon, grey helper text
- Drop zone hover/drag-over: `border-blue-400 bg-blue-50`
- Drop zone with file: shows filename, file size, green checkmark icon, "Remove" button
- Upload button: primary colour, full width of card, "Upload & Continue →"
- Error state: red border on drop zone + red error text below

---

### Edge Cases

| Scenario | Handling |
|---|---|
| Non-PDF file dropped | Immediate client-side rejection before upload: "Only PDF files are accepted" |
| PDF > 10 MB | Client-side rejection: "File is too large. Maximum size is 10 MB." |
| PDF > 20 pages | Server-side 400 → inline error on upload page |
| Scanned / image PDF | `422` → "Scanned PDFs are not supported yet. Please upload a text-layer PDF." |
| Storage upload fails silently | `file_path` = null; pipeline continues; user never sees this error |
| DB insert fails | `500` → "Something went wrong. Please try again." |
| User navigates away during upload | Upload request continues server-side; if it completes, the contract exists in DB — visible on dashboard next visit |
| Duplicate file uploaded | No deduplication — each upload creates a new contract record |

---

## Feature: Key Term Extraction (OpenAI)

### Description

- After upload, the results page (`/contracts/[id]`) shows a pre-processing preview of the terms that will be extracted
- Users can add up to 5 custom terms before triggering extraction
- Clicking "Process Contract" calls `POST /api/process`, which calls OpenAI GPT-4o and writes results to `key_terms`
- The results page polls `contracts.status` every 2 seconds while processing
- On completion, the key terms panel renders with all extracted terms

---

### User Flow

1. Results page loads at `/contracts/[id]` with `status = 'pending'`
2. Right panel shows **pre-processing preview**: list of standard terms (based on contract_type) with placeholder "—" values and a "+ Add Key Term" button
3. User optionally adds custom terms (see Custom Term Addition feature)
4. User clicks "Process Contract" button
5. Three-step progress indicator appears:
   - Step 1: "Extracting text..." (brief — text already in DB; step confirms text retrieval)
   - Step 2: "Analysing with AI..." (OpenAI call in-flight)
   - Step 3: "Compiling results..."
6. Status polling (`GET /api/contracts/[id]/status`) runs every 2 seconds
7. On `status = 'completed'`: fetch `GET /api/contracts/[id]/key-terms` → render key terms panel
8. On `status = 'error'`: show error card with `error_message` + "Retry" button (re-triggers `POST /api/process`)

---

### Placement

- Pre-processing state: right panel of the two-panel results layout
- Processing indicator: centred in the right panel, replaces the preview list
- Completed state: key terms list fills the right panel (scrollable)
- Error state: error card centred in right panel

---

### DB Schema

**Table: `key_terms`**

```sql
CREATE TABLE IF NOT EXISTS key_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  term_name text NOT NULL,
  value text NOT NULL,
  original_value text,
  page_number integer NOT NULL,
  confidence_score float4 NOT NULL,
  source_sentence text,
  is_custom boolean NOT NULL DEFAULT false,
  is_edited boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

---

### DB Tasks

```sql
-- Run in Supabase SQL Editor (included in database.sql)

CREATE TABLE IF NOT EXISTS key_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  term_name text NOT NULL,
  value text NOT NULL,
  original_value text,
  page_number integer NOT NULL DEFAULT 0,
  confidence_score float4 NOT NULL DEFAULT 0,
  source_sentence text,
  is_custom boolean NOT NULL DEFAULT false,
  is_edited boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_key_terms_contract_id ON key_terms(contract_id);
CREATE INDEX IF NOT EXISTS idx_key_terms_user_id ON key_terms(user_id);

ALTER TABLE key_terms ENABLE ROW LEVEL SECURITY;

CREATE POLICY key_terms_select_own ON key_terms FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY key_terms_insert_own ON key_terms FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY key_terms_update_own ON key_terms FOR UPDATE USING (auth.uid() = user_id);
```

---

### DB Helper Functions

**`insertKeyTerms(supabase, terms[])`**
- Parameters: server Supabase client; array of term objects (all fields)
- Returns: void
- Bulk insert into `key_terms`; all terms for one contract inserted in a single statement

**`getKeyTermsByContractId(supabase, contractId)`**
- Parameters: server Supabase client; contract UUID
- Returns: `KeyTerm[]` ordered by `created_at ASC` (preserves standard-terms-first order)

---

### API Routes

#### `POST /api/process`

**Request:** `{ contract_id: string }`

**Processing steps:**
1. Validate session; confirm `contracts.user_id = session.user.id`
2. Verify `status = 'pending'`; return `409` if already processing/completed
3. `UPDATE contracts SET status = 'processing'`
4. Read `contract_text` and `contract_type` from DB
5. Fetch custom terms from `key_terms WHERE contract_id = id AND is_custom = true` (added in pre-processing)
6. Estimate token count; reject if > 15,000 estimated tokens
7. Build extraction prompt (`lib/openai/extract.ts`)
8. Call OpenAI with retry logic (3 attempts, exponential backoff)
9. Parse JSON response; validate schema
10. Bulk insert into `key_terms`
11. `UPDATE contracts SET status = 'completed'`
12. Return `200 { status: 'processing' }` (status polling confirms completion)

On terminal failure: `UPDATE contracts SET status = 'error', error_message = '...'`

#### `GET /api/contracts/[id]/status`

Returns `{ status, error_message }` — polled by client every 2 seconds.

#### `GET /api/contracts/[id]/key-terms`

Returns `{ terms: KeyTerm[] }` — called once after `status = 'completed'`.

---

### State Management

- Component: `ResultsPage` (client component)
- State variables:
  - `processingStatus: 'idle' | 'processing' | 'completed' | 'error'` — drives panel rendering
  - `keyTerms: KeyTerm[]` — populated after completion
  - `errorMessage: string | null`
  - `customTerms: string[]` — user-typed custom term names (max 5)
- `useContractStatus` hook: polls every 2000ms while `processingStatus = 'processing'`; stops on 'completed' or 'error'
- On 'completed': calls `GET /api/contracts/[id]/key-terms` and sets `keyTerms`

---

### Component

**`ProcessingIndicator`** — `components/results/ProcessingIndicator.tsx`
- Props: `step: 1 | 2 | 3` — controls which step is highlighted
- Renders 3 labelled steps with a progress connector; active step shows a spinner icon

**`KeyTermsPanel`** (pre-processing state) — `components/results/KeyTermsPanel.tsx`
- Props: `contractType: 'NDA' | 'MSA'; onProcess: () => void; isProcessing: boolean`
- Renders standard term preview list + custom term input + "Process Contract" button
- Button disabled while `isProcessing = true`

---

### Design

- Pre-processing list: each row shows term name + "—" placeholder in muted grey
- "Process Contract" button: primary colour, full width
- Processing indicator: 3 steps in a vertical list; active step has primary colour icon + bold text; completed steps have green checkmark
- Error card: red border, error icon, `error_message` text, "Retry" button

---

### Edge Cases

| Scenario | Handling |
|---|---|
| OpenAI JSON parse fails | Retry with corrective prompt; second failure → `status = 'error'` |
| OpenAI API 5xx / timeout | Retry 3× with exponential backoff; then `status = 'error'` |
| Contract text > 15k tokens | `422` before OpenAI call: "Contract is too long for analysis" |
| User clicks "Process" twice | Second request returns `409` (status not 'pending'); ignored client-side (button disabled after first click) |
| Some terms not found in contract | Term inserted with `value = "Not found"`, `confidence_score = 0.0`, `page_number = 0` |
| User refreshes page during processing | Status poll resumes on re-render; processing continues server-side |
| User closes browser during processing | Processing completes server-side; contract visible on dashboard with 'completed' status on next visit |

---

## Feature: Custom Term Addition

### Description

- Before clicking "Process Contract", users can add up to 5 custom key terms to extract
- Custom terms appear in the pre-processing preview list with a "Custom" badge
- They are injected into the OpenAI extraction prompt alongside standard terms and produce the same output structure (value, page, confidence, source sentence)
- Custom terms are stored in `key_terms` with `is_custom = true` before processing begins (so they persist if the user navigates away and returns)

---

### User Flow

1. On the pre-processing preview (right panel, before processing), a "+ Add Key Term" button is visible below the standard terms list
2. User clicks the button → a small inline input appears at the bottom of the list
3. User types a custom term name (e.g. "Non-compete radius") and presses Enter or clicks "Add"
4. Term appears in the list immediately with a "Custom" badge and a remove (×) button
5. A `POST` to `POST /api/contracts/[id]/custom-terms` saves the term to `key_terms` with `is_custom = true` and a placeholder `value = ''`
6. If user adds a 5th term, the "+ Add Key Term" button is hidden with a note: "Maximum 5 custom terms"
7. User can remove a custom term before processing by clicking ×; this deletes the `key_terms` row
8. On "Process Contract", the custom terms are already in `key_terms`; `POST /api/process` reads them from DB

---

### Placement

- Inline at the bottom of the pre-processing terms list in the right panel
- Input field: full width of the panel, with "Add" button to the right
- Custom term rows appear interspersed at the bottom of the list (after standard terms)
- "Custom" badge: small, secondary colour (e.g. indigo), `rounded-full`, `text-xs`

---

### DB Schema

Uses the existing `key_terms` table. Custom terms are inserted before processing with:
- `is_custom = true`
- `value = ''` (empty until processing completes)
- `page_number = 0`, `confidence_score = 0` (placeholder values)

---

### DB Tasks

No additional tables. Uses `key_terms` table from the Key Term Extraction feature. Ensure the `is_custom` column exists (it does per the schema definition above).

---

### DB Helper Functions

**`addCustomTerm(supabase, { contractId, userId, termName })`**
- Parameters: server Supabase client; contract UUID; user UUID; term name string
- Returns: `{ id: string }` — the new key_terms row UUID
- Inserts with `is_custom = true`, `value = ''`

**`removeCustomTerm(supabase, termId, userId)`**
- Parameters: server Supabase client; key_terms UUID; user UUID
- Returns: void
- Deletes row; verifies `user_id = userId` before delete (RLS also enforces this)

---

### API Routes

#### `POST /api/contracts/[id]/custom-terms`

**Request:** `{ term_name: string }`

**Validation:**
- `term_name` must be 1–100 characters
- Count of existing custom terms for this contract must be < 5; return `400` with "Maximum 5 custom terms reached" if at limit
- Contract must be in `'pending'` status; return `409` if already processed

**Success Response:** `201 { term: { id, term_name, is_custom: true } }`

#### `DELETE /api/contracts/[id]/custom-terms/[termId]`

**Validation:** term must belong to this contract + user; status must be `'pending'`

**Success Response:** `204 No Content`

---

### State Management

- Owned by `KeyTermsPanel` component (pre-processing state)
- State:
  - `customTerms: { id: string; term_name: string }[]` — persisted terms (from DB on load)
  - `inputValue: string` — controlled input for new term name
  - `isAdding: boolean` — true while POST /api/... is in-flight
- `customTerms.length >= 5` → hide add button, show cap message
- On successful add: append to `customTerms`, clear `inputValue`
- On remove: optimistic update (remove from state immediately, then DELETE)

---

### Component

**`CustomTermInput`** — inside `KeyTermsPanel.tsx` (not a separate file)
- Renders: text input + "Add" button; submit on Enter key
- Disabled while `isAdding = true` or `customTerms.length >= 5`

**Custom term row in the preview list:**
- Shows: term name + "Custom" badge + × remove button
- × triggers `DELETE` API call + optimistic removal from `customTerms` state

---

### Design

- Custom term row: same height as standard term rows; "Custom" badge in indigo `bg-indigo-100 text-indigo-700`
- Remove button: grey × icon, appears on hover
- Input field: borderless within the list, placeholder "Enter term name..." 
- Cap message: `text-xs text-gray-500` below the list: "Maximum of 5 custom terms"

---

### Edge Cases

| Scenario | Handling |
|---|---|
| User adds 6th term | "+ Add Key Term" button hidden after 5th add; API also enforces `400` |
| Duplicate term name | No deduplication — allowed (user may want "Governing Law (US)" and "Governing Law (UK)") |
| User types a very long term name | Client trims to 100 chars before submission |
| User removes a term after processing starts | DELETE blocked by API (`409` — status no longer 'pending'); remove button hidden once processing begins |
| Network error on add | Optimistic state reverted; error toast: "Couldn't save term. Try again." |

---

## Feature: Results Display: Key Terms Panel

### Description

- The key terms panel is the primary output surface — the right panel of the two-panel results layout
- It displays all extracted terms (standard + custom) after processing completes
- Each row shows: Term Name, Extracted Value, Page Number badge (clickable), Confidence badge (colour-coded), and an expandable "Why?" section with the verbatim source sentence
- Users can edit any term's value inline (see Inline Key Term Editing feature)
- The panel persists its state on re-visit (data is loaded from `key_terms` on page load)

---

### User Flow

1. After `status = 'completed'`, `key_terms` are fetched and rendered as a list
2. Each row is visible by default; no accordion collapse
3. **Confidence badge:** green (≥ 80%), amber (50–79%), red (< 50%)
4. **⚠️ warning:** for confidence < 50%, ⚠️ icon appears next to the value; tooltip on hover: "Low confidence — we recommend verifying this in the document directly."
5. **Page badge:** shows "P.4" (page number); clicking scrolls the left panel to that page
6. **"Why?" expander:** chevron icon on each row; expands to show `source_sentence` in a light grey box with italic formatting. If `source_sentence` is empty, shows: "Source sentence not available."
7. **Edit button:** pencil icon on each row; opens inline edit (see Inline Key Term Editing)
8. **"Edited" badge:** displayed on any term where `is_edited = true`, next to the term name

---

### Placement

- Full height of right panel, scrollable
- Panel header: "Key Terms" label + contract type chip
- Each row: `border-b`, `py-3 px-4`
- Source sentence expander: indented grey box below the row
- Fixed "Not legal advice" disclaimer pinned to the bottom of the right panel

---

### DB Schema

Reads from `key_terms` (all columns). No writes in this feature except via the Edit action (see Inline Key Term Editing).

---

### DB Tasks

See Key Term Extraction feature — `key_terms` table already created there.

---

### DB Helper Functions

**`getKeyTermsByContractId(supabase, contractId)`** — same as defined in Key Term Extraction.

---

### API Routes

`GET /api/contracts/[id]/key-terms` — same as defined in Key Term Extraction.

---

### State Management

- Component: `ResultsPage` (client component)
- `keyTerms: KeyTerm[]` — loaded from API on mount (when status = 'completed')
- `activePage: number | null` — set when user clicks a page badge; passed to `LeftPanel` via prop
- Individual term state (expanded/collapsed "Why?" section) is local to `KeyTermRow`
- `onTermEdited(updatedTerm: KeyTerm)` callback propagated from `ResultsPage` → `KeyTermsPanel` → `KeyTermRow` to update the term in place without re-fetching

---

### Component

**`KeyTermsPanel`** — `components/results/KeyTermsPanel.tsx`
- Props: `terms: KeyTerm[]; onPageSelect: (page: number) => void; onTermEdited: (term: KeyTerm) => void`
- Renders: list of `KeyTermRow` components; panel header; disclaimer at bottom

**`KeyTermRow`** — `components/results/KeyTermRow.tsx`
- Props: `term: KeyTerm; onPageSelect: (page: number) => void; onEdited: (term: KeyTerm) => void`
- Internal state: `isExpanded: boolean` (controls "Why?" section)
- Renders: term name, value (or edit input if editing), page badge, confidence badge, edit button, "Edited" badge if `is_edited`, source sentence expander

**`ConfidenceBadge`** — `components/results/ConfidenceBadge.tsx`
- Props: `score: number` (0.0–1.0)
- Returns a pill with: colour class + percentage text + ⚠️ icon if score < 0.5
- `aria-label` includes full description for screen readers

---

### Design

- Row layout: `flex justify-between items-start`
- Left: term name (semibold) + "Edited" badge + "Custom" badge if `is_custom`
- Right: value text (truncated to 2 lines with tooltip for full text) + page badge + confidence badge + edit icon
- Page badge: `bg-gray-100 text-gray-600 rounded px-1.5 text-xs font-mono cursor-pointer hover:bg-blue-100`
- Confidence badge: pill, `text-xs font-semibold px-2 py-0.5 rounded-full`
  - Green: `bg-green-100 text-green-700`
  - Amber: `bg-amber-100 text-amber-700`
  - Red: `bg-red-100 text-red-700` + ⚠️ icon
- Source sentence box: `bg-gray-50 rounded p-3 text-sm italic text-gray-600 mt-2`
- "Not legal advice" disclaimer: `border-t pt-3 text-xs text-gray-400 text-center`

---

### Edge Cases

| Scenario | Handling |
|---|---|
| Term value is "Not found" | Display in italic grey; confidence badge shows red 0% + ⚠️ |
| `source_sentence` is null/empty | "Source sentence not available." in grey italic |
| `page_number = 0` (term not found) | Page badge shows "—" and is not clickable |
| Very long extracted value | Truncate to 2 lines in display mode; full value shown in edit input |
| No key terms (e.g. API error before insert) | Empty state: "No terms were extracted. Try processing again." + Retry button |
| User revisits a completed contract | Key terms loaded from DB on mount; no re-processing needed |

---

## Feature: Results Display: PDF Viewer + Text Fallback

### Description

- The left panel of the results page shows the uploaded contract for reference
- **Primary:** PDF.js viewer rendered using a 1-hour signed URL from Supabase Storage (when `file_path` is set)
- **Fallback:** A paginated text viewer that parses `[PAGE N]` markers from `contracts.contract_text` (when `file_path` is null or signed URL generation fails)
- Both viewers respond to `targetPage` prop changes (triggered by clicking a page number in the key terms panel or a citation in chat) and scroll/navigate to the target page

---

### User Flow

**PDF Viewer (primary):**
1. `ResultsPage` mounts → `useSignedUrl` hook fetches `GET /api/contracts/[id]/signed-url`
2. If signed URL returned: `PdfViewer` renders with the URL; PDF loads progressively
3. User can scroll pages, zoom in/out with +/- buttons
4. Clicking a page number badge in the key terms panel sets `targetPage` → `PdfViewer` scrolls to that page smoothly
5. If signed URL request returns 404 (no `file_path`): fall through to text viewer

**Text Viewer (fallback):**
1. `contract_text` from the contracts record (already in client state from the status fetch) is split on `[PAGE N]` markers into an array of page sections
2. Each page section is rendered as a labelled block: "— Page N —" header + text content in a monospaced font
3. User can scroll; clicking a page number badge navigates to the anchor for that page section
4. Font size increase/decrease buttons available (14px default, range 12–18px)

---

### Placement

- Left panel: 55% of the results page width, full viewport height, `overflow-y-auto`
- PDF viewer: full width of the panel; pages stack vertically with a 16px gap
- Text viewer: full width, left-padded 24px, right-padded 24px; page labels in `text-gray-400 font-mono text-xs uppercase`
- Zoom/font controls: fixed toolbar at the top of the left panel

---

### DB Schema

Reads `contracts.file_path` and `contracts.contract_text`. No writes.

---

### DB Tasks

No new tables. `file_path` and `contract_text` are already in the `contracts` table.

---

### DB Helper Functions

No new functions. `contract_text` is available on the `contracts` record already fetched by the results page.

---

### API Routes

#### `GET /api/contracts/[id]/signed-url`

**Processing:**
1. Validate session; verify contract ownership
2. Read `contracts.file_path`; if null → `404`
3. `supabase.storage.from('contracts').createSignedUrl(file_path, 3600)`
4. Return `{ signed_url }`

**Error responses:**
- `404`: `file_path` is null (Storage upload failed at upload time)
- `403`: not the contract owner
- `500`: Supabase Storage error generating URL

---

### State Management

- Component: `ResultsPage`
- State:
  - `targetPage: number | null` — set by key term page badge click or chat citation click; reset to null after scroll completes
  - `signedUrl: string | null` — fetched by `useSignedUrl` hook
  - `useTextFallback: boolean` — true when `signedUrl` is null after fetch attempt

**`useSignedUrl(contractId)`** — `hooks/useSignedUrl.ts`
- Fetches `GET /api/contracts/[id]/signed-url` once on mount
- Returns `{ signedUrl, isLoading, error }`
- If error (404 or 500): sets `signedUrl = null`; `LeftPanel` switches to `TextViewer`

---

### Component

**`LeftPanel`** — `components/results/LeftPanel.tsx`
- Props: `contractId: string; contractText: string; targetPage: number | null; onPageRendered?: () => void`
- Orchestrates: fetches signed URL; renders `PdfViewer` or `TextViewer` based on result
- Passes `targetPage` to whichever viewer is active

**`PdfViewer`** — `components/results/PdfViewer.tsx`
- Props: `signedUrl: string; targetPage: number | null`
- Uses `react-pdf` (`Document` + `Page` components)
- Pages rendered lazily (only pages near the viewport)
- On `targetPage` change: scrolls to the corresponding page element via `scrollIntoView`
- Toolbar: zoom in (+), zoom out (-), current page / total pages display

**`TextViewer`** — `components/results/TextViewer.tsx`
- Props: `contractText: string; targetPage: number | null`
- Parses `contractText` on first render by splitting on `/\[PAGE (\d+)\]/` regex
- Renders each page as `<section id="page-{n}">` with a sticky page label
- On `targetPage` change: `document.getElementById('page-{n}').scrollIntoView({ behavior: 'smooth' })`
- Toolbar: font size increase/decrease buttons

---

### Design

- Toolbar: `sticky top-0 bg-white border-b z-10 flex items-center gap-2 px-4 py-2`
- PDF viewer pages: white background, `shadow-sm`, 16px vertical gap
- Text viewer: `font-mono text-sm leading-relaxed`; page label: `text-gray-400 text-xs uppercase tracking-wider border-t pt-4 mt-4`
- Loading state: skeleton placeholder (grey animated block filling the panel)
- Error state (both viewers fail): "Unable to display contract. You can still review the key terms in the panel." — text viewer is always the final fallback since `contract_text` is always in the DB

---

### Edge Cases

| Scenario | Handling |
|---|---|
| Storage upload failed at upload time | `file_path` = null → `GET /api/.../signed-url` returns 404 → text viewer activates automatically |
| Signed URL expired (user leaves page open > 1 hour) | On next `targetPage` change, PDF fails to load → `PdfViewer` shows "Document expired. Refresh to reload." |
| `contract_text` is missing `[PAGE N]` markers | `TextViewer` renders entire text as a single section labelled "Page 1" |
| PDF with unusual fonts or layout | PDF.js renders it as-is; page navigation still works by page index |
| `targetPage` exceeds total pages | Ignored silently; no scroll action taken |
| User zooms past maximum | Zoom capped at 200%; minimum 50% |

---

## Feature: Contract Chat (Q&A)

### Description

- A chat interface embedded in the right panel of the results page (second tab: "Chat")
- Users type plain-English questions about the contract; the AI answers strictly from the document
- Every AI response includes a `[Page X]` citation; clicking it scrolls the left panel to that page
- One chat session per contract; all messages are persisted to Supabase and reloaded on every visit
- Chat is only available after the contract has been processed (`status = 'completed'`)

---

### User Flow

1. User clicks "Chat" tab in the right panel (tab navigation replaces the key terms list)
2. **First visit:** empty chat with a prompt: "Ask me anything about this contract"
3. **Return visit:** previous messages load from Supabase in ascending timestamp order
4. User types a question (up to 2000 chars) and clicks Send or presses Ctrl+Enter
5. User's message appears immediately (right-aligned, blue bubble) — optimistic insert
6. Loading indicator (three dots animation) shows while AI is processing
7. AI response appears (left-aligned, grey bubble) with citation: "Source: Page X" as a clickable link
8. Clicking "Source: Page X" sets `targetPage` in parent → left panel scrolls to that page
9. If AI cannot find the answer: response text is "I cannot find this information in the provided contract." — no page citation
10. On OpenAI error: error message inline in chat: "Something went wrong. Please try again." — user message is not persisted on server error

---

### Placement

- Right panel, second tab ("Chat"), full height
- Chat message list: scrollable, fills available height above the input bar
- Input bar: fixed at bottom of the right panel; `sticky bottom-0`
- User messages: right-aligned, max-width 85%, `bg-blue-600 text-white rounded-2xl rounded-br-sm`
- AI messages: left-aligned, max-width 85%, `bg-gray-100 text-gray-900 rounded-2xl rounded-bl-sm`

---

### DB Schema

**Table: `chat_sessions`**

```sql
CREATE TABLE IF NOT EXISTS chat_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contract_id)
);
```

**Table: `chat_messages`**

```sql
CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  page_citation integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

---

### DB Tasks

```sql
-- chat_sessions
CREATE TABLE IF NOT EXISTS chat_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contract_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_contract_id ON chat_sessions(contract_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON chat_sessions(user_id);

ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY chat_sessions_select_own ON chat_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY chat_sessions_insert_own ON chat_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY chat_sessions_update_own ON chat_sessions FOR UPDATE USING (auth.uid() = user_id);

CREATE TRIGGER chat_sessions_updated_at
  BEFORE UPDATE ON chat_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- chat_messages
CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  page_citation integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session_created ON chat_messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id ON chat_messages(user_id);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY chat_messages_select_own ON chat_messages FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY chat_messages_insert_own ON chat_messages FOR INSERT WITH CHECK (auth.uid() = user_id);
```

---

### DB Helper Functions

**`getOrCreateChatSession(supabase, { contractId, userId })`**
- Upserts into `chat_sessions` on `contract_id` conflict
- Returns `{ id: string }` — session UUID

**`getChatMessages(supabase, sessionId)`**
- Returns all messages for the session, ordered `created_at ASC`
- Used to populate chat history on load and to build the OpenAI messages array

**`insertChatMessage(supabase, { sessionId, userId, role, content, pageCitation })`**
- Inserts a single message row
- Returns `{ id, created_at }`

---

### API Routes

#### `POST /api/chat`

**Request:** `{ contract_id: string; message: string }`

**Processing steps:**
1. Validate session; verify contract ownership + `status = 'completed'`
2. Validate `message` length (1–2000 chars)
3. `getOrCreateChatSession()` → `sessionId`
4. `insertChatMessage()` — save user message
5. `getChatMessages()` — fetch full history (ascending)
6. Read `contracts.contract_text`
7. Build OpenAI messages array (system prompt + contract text as context + last 10 turns + new message)
8. Call OpenAI (temperature 0.4, max 1000 tokens, 3 retries with backoff)
9. Extract `page_citation` from `[Page X]` pattern in response text
10. `insertChatMessage()` — save assistant response
11. `UPDATE chat_sessions SET updated_at = now()`
12. Return `200 { message: { id, role: 'assistant', content, page_citation, created_at } }`

On OpenAI error: do not save assistant message; return `500` with human-readable error.

---

### State Management

- Component: `ChatPanel`
- State:
  - `messages: ChatMessage[]` — loaded from API on mount (via `GET /api/contracts/[id]/chat-messages`)
  - `inputValue: string`
  - `isLoading: boolean` — true while POST /api/chat is in-flight
  - `error: string | null`
- On send:
  1. Optimistic append of user message to `messages`
  2. Set `isLoading = true`
  3. POST `/api/chat`
  4. On success: append assistant message to `messages`; set `isLoading = false`
  5. On error: remove optimistic user message; set `error`; set `isLoading = false`
- `onCitationClick(page)` → calls parent `ResultsPage.setTargetPage(page)`

---

### Component

**`ChatPanel`** — `components/results/ChatPanel.tsx`
- Props: `contractId: string; onCitationClick: (page: number) => void`
- Loads chat history on mount via `GET /api/contracts/[id]/chat-messages`
- Manages send flow internally
- Auto-scrolls to bottom on new message append

**`ChatMessageList`** — inside `ChatPanel.tsx`
- Renders user and assistant message bubbles
- Assistant messages parse `[Page X]` pattern and render as a clickable `<button>` that calls `onCitationClick`

**`ChatInputBar`** — inside `ChatPanel.tsx`
- `<textarea>` (auto-resizes to 3 lines max); Submit button
- Ctrl+Enter submits; Enter alone creates a newline
- Disabled while `isLoading = true`

---

### Design

- Empty state: centred icon + "Ask me anything about this contract" in grey italic
- Loading indicator: three-dot bounce animation in a left-aligned grey bubble
- Citation link: `text-blue-600 underline text-xs` — "Source: Page 4"
- Error inline message: red text `text-sm text-red-600` in a left-aligned grey bubble
- Input bar: `border-t bg-white px-4 py-3`; textarea has `rounded-lg border`; Send button primary colour

---

### Edge Cases

| Scenario | Handling |
|---|---|
| AI answers from general knowledge (not document) | System prompt explicitly forbids this; automated test verifies "I cannot find this" response for off-document questions |
| No page citation in response | `page_citation` stored as `null`; no citation link rendered |
| User sends empty message | Submit button disabled; Enter key ignored |
| Message > 2000 chars | API returns `400`; frontend shows "Message is too long (max 2000 characters)" |
| OpenAI error mid-conversation | Inline error in chat; user message not persisted server-side; user can retry |
| Contract not yet processed | Chat tab disabled (greyed out with tooltip: "Process the contract first to enable chat") |
| Very long chat history (200+ messages) | All messages fetched and sent to OpenAI (full history, not windowed); this is the PRD assumption for MVP |

---

## Feature: Dashboard & Contract History

### Description

- The dashboard at `/dashboard` is the home screen after sign-in
- It shows a summary of all contracts reviewed by the authenticated user and quick access to start a new review
- Data is read directly from the `contracts` table via the Supabase client (no custom API route needed — RLS ensures users only see their own contracts)

---

### User Flow

1. User signs in → redirect to `/dashboard`
2. **Empty state (first-time user):** illustration + "No contracts reviewed yet — upload your first contract to begin" + "Review a Contract" button
3. **Populated state:**
   - Summary cards row: "Total Contracts", "NDAs", "MSAs"
   - Sortable contract table below the cards
4. **Contract table columns:** Contract Name | Type (NDA/MSA chip) | Date Uploaded | Status chip
5. **Sorting:** clicking column headers toggles ascending/descending sort; default sort: Date Uploaded DESC
6. **Row click:** navigates to `/contracts/[id]` — results page loads with saved data
7. **"Review a Contract" button:** always visible in the top-right of the dashboard header → navigates to `/contracts/new`

---

### Placement

- Full-page layout within the `(protected)` shell
- Dashboard header: page title "Dashboard" + "Review a Contract" button top-right
- Summary cards: horizontal row, 3 cards, below the header
- Contract table: below the summary cards, full page width

---

### DB Schema

Reads from `contracts` table. No writes. Columns used: `id`, `title`, `contract_type`, `status`, `created_at`.

---

### DB Tasks

No new tables. Uses `contracts` table already created in the PDF Upload feature.

---

### DB Helper Functions

**`getContractsByUserId(supabase, userId)`**
- Parameters: client-side Supabase instance (RLS enforced via session); user UUID
- Returns: `Contract[]` ordered by `created_at DESC`
- Selects: `id, title, contract_type, status, created_at`

This is a direct Supabase client query in the component — no API route needed because RLS scopes results to the authenticated user automatically.

---

### API Routes

No custom API routes for the dashboard. The `DashboardPage` server component queries Supabase directly using the server client:

```ts
const { data: contracts } = await supabase
  .from('contracts')
  .select('id, title, contract_type, status, created_at')
  .order('created_at', { ascending: false })
```

---

### State Management

- `DashboardPage` is a **server component** — data is fetched at render time, no client-side state for the initial load
- `ContractTable` is a **client component** (for sort interaction):
  - `sortColumn: 'title' | 'contract_type' | 'created_at'` — default `'created_at'`
  - `sortDirection: 'asc' | 'desc'` — default `'desc'`
  - `contracts: Contract[]` — received as a prop from the server component; sorted client-side on header click

---

### Component

**`DashboardPage`** — `app/(protected)/dashboard/page.tsx`
- Server component; fetches contracts; passes data to child client components

**`SummaryCards`** — `components/dashboard/SummaryCards.tsx`
- Props: `contracts: Contract[]`
- Computes counts from the array (no additional fetch)
- Renders 3 shadcn `Card` components

**`ContractTable`** — `components/dashboard/ContractTable.tsx`
- Props: `contracts: Contract[]`
- Client component for sort interaction
- Renders: sortable header row + data rows; row is `cursor-pointer` with `hover:bg-gray-50`
- Clicking a row: `router.push('/contracts/' + id)`

**`EmptyState`** — `components/shared/EmptyState.tsx`
- Props: `title: string; description: string; ctaLabel: string; ctaHref: string`
- Rendered by `DashboardPage` when `contracts.length === 0`

---

### Design

- Summary cards: `grid grid-cols-3 gap-4`; each card has a label + large number + small icon
- Status chip colours:
  - `pending`: `bg-gray-100 text-gray-600`
  - `processing`: `bg-blue-100 text-blue-700` + spinner icon
  - `completed`: `bg-green-100 text-green-700`
  - `error`: `bg-red-100 text-red-700`
- Contract type chip: `bg-indigo-100 text-indigo-700` for NDA; `bg-purple-100 text-purple-700` for MSA
- Sort indicator: ↑↓ icon on the active sort column header
- Empty state: centred illustration + CTA button, padded `py-24`

---

### Edge Cases

| Scenario | Handling |
|---|---|
| New user (zero contracts) | Empty state renders with CTA |
| Contract in 'processing' status | Processing chip displayed; row is clickable but results page shows processing indicator |
| Contract in 'error' status | Error chip displayed; row is clickable; results page shows error card with retry |
| Many contracts (50+) | No pagination in MVP; table scrolls vertically. Pagination is a post-MVP enhancement. |
| Contract title very long | Truncated with `text-ellipsis overflow-hidden` in the table cell; full title in tooltip |
| User deletes a contract | Contract disappears from list on next navigation (no real-time update in MVP) |

---

## Feature: Inline Key Term Editing

### Description

- Users can correct any extracted term value directly in the key terms panel
- The original AI-extracted value is preserved in `key_terms.original_value`
- Every edit writes an audit record to `term_corrections`
- Edited terms display an "Edited" badge to make corrections visible at a glance

---

### User Flow

1. User hovers over a key term row → pencil icon appears on the right
2. User clicks the pencil icon → the value text becomes an `<input>` field pre-filled with the current value
3. The row shows "Save" and "Cancel" buttons
4. User edits the value and clicks "Save" (or presses Enter)
5. `PATCH /api/terms/[id]` is called with the new value
6. On success: input reverts to display mode; "Edited" badge appears next to the term name
7. User clicks "Cancel" (or presses Escape) → input reverts without saving
8. If the same term is edited again, a new `term_corrections` row is inserted; `key_terms.value` is updated to the latest value

---

### Placement

- Edit input appears inline within the key term row (replaces the value display text)
- Input width matches the available value column width
- "Save" button: small, primary colour, `rounded`; to the right of the input
- "Cancel" button: small, ghost/text style; to the right of "Save"

---

### DB Schema

**Table: `term_corrections`** (append-only audit log)

```sql
CREATE TABLE IF NOT EXISTS term_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key_term_id uuid NOT NULL REFERENCES key_terms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  old_value text NOT NULL,
  new_value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

---

### DB Tasks

```sql
CREATE TABLE IF NOT EXISTS term_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key_term_id uuid NOT NULL REFERENCES key_terms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  old_value text NOT NULL,
  new_value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_term_corrections_user_id ON term_corrections(user_id);
CREATE INDEX IF NOT EXISTS idx_term_corrections_contract_id ON term_corrections(contract_id);

ALTER TABLE term_corrections ENABLE ROW LEVEL SECURITY;

-- Users can insert their own corrections; they cannot read them (service role only reads for analytics)
CREATE POLICY term_corrections_insert_own ON term_corrections FOR INSERT WITH CHECK (auth.uid() = user_id);
```

---

### DB Helper Functions

**`updateKeyTermValue(supabase, { termId, newValue, userId })`**
- Fetches the current `key_terms` row (to read `value` for `old_value`)
- If `original_value` is null (first edit): sets `original_value = current value`
- Updates `key_terms` row: `value = newValue`, `is_edited = true`
- Inserts into `term_corrections`: `{ key_term_id, user_id, contract_id, old_value, new_value }`
- Returns updated `key_terms` row

---

### API Routes

#### `PATCH /api/terms/[id]`

Actually routed as: `app/api/contracts/[id]/terms/[termId]/route.ts`

**Request:** `{ value: string }`

**Validation:**
- `value` must be 1–1000 characters (not empty, not excessively long)
- Term must exist and belong to the authenticated user

**Processing:**
1. Validate session; fetch `key_terms` row; verify `user_id` matches
2. Read current `value` as `old_value`
3. If `original_value` is null: set `original_value = old_value`
4. `UPDATE key_terms SET value = newValue, is_edited = true, original_value = coalesce(original_value, old_value)`
5. `INSERT INTO term_corrections (key_term_id, user_id, contract_id, old_value, new_value)`
6. Return `200 { term: { id, value, is_edited, original_value } }`

**Error responses:**
- `400`: empty value or value > 1000 chars
- `403`: term does not belong to user
- `404`: term not found

---

### State Management

- Editing state is managed locally within `KeyTermRow`:
  - `isEditing: boolean` — true when in edit mode
  - `editValue: string` — controlled input value; initialised from `term.value`
  - `isSaving: boolean` — true while PATCH is in-flight
- On "Save" success: call `onEdited(updatedTerm)` prop callback → parent `KeyTermsPanel` updates its `terms` array in place
- On "Cancel": set `isEditing = false`, reset `editValue` to `term.value`

---

### Component

**`KeyTermRow`** — `components/results/KeyTermRow.tsx` (edit mode is a view state within this component)

When `isEditing = true`:
- Renders: `<input>` pre-filled with current value + "Save" button + "Cancel" button
- Input is focused automatically on mount of edit mode (`autoFocus`)
- "Save" button disabled while `isSaving = true` or `editValue.trim() === ''`
- Pressing Escape triggers Cancel

When `isEditing = false` and `term.is_edited = true`:
- Renders "Edited" badge: `bg-orange-100 text-orange-700 text-xs rounded px-1.5`

---

### Design

- Edit input: `rounded border border-blue-400 px-2 py-1 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-400`
- "Save" button: `bg-blue-600 text-white text-xs rounded px-2 py-1 hover:bg-blue-700`
- "Cancel" button: `text-gray-500 text-xs hover:text-gray-700 px-2 py-1`
- "Edited" badge: `bg-orange-100 text-orange-700 text-xs font-medium rounded-full px-1.5 py-0.5 ml-1`

---

### Edge Cases

| Scenario | Handling |
|---|---|
| User saves with the same value | Allowed — a correction record is written; `is_edited = true`; no validation rejects identical values |
| User saves an empty value | "Save" button disabled; API also rejects with `400` |
| User edits same term multiple times | Each edit creates a new `term_corrections` row; `original_value` is set on the first edit and never overwritten |
| Network error on save | `isSaving = false`; error toast "Couldn't save. Try again."; input remains open |
| Multiple terms in edit mode simultaneously | Not allowed — opening a new term's edit mode closes any other open edit (tracked by a single `editingTermId` state in the parent `KeyTermsPanel`) |

---

## Feature: Feedback Collection

### Description

- After reviewing a contract, users can submit a thumbs-up or thumbs-down rating with an optional text comment
- One feedback submission allowed per user per contract (enforced by a UNIQUE constraint)
- Feedback is stored in `user_feedback` and used for product quality monitoring
- The feedback widget is displayed at the bottom of the results page right panel

---

### User Flow

1. After `status = 'completed'`, a feedback widget appears at the bottom of the right panel (below key terms list or chat panel, above the disclaimer)
2. Prompt text: "Were the extracted terms accurate?"
3. User clicks 👍 or 👎 (both are toggle buttons; only one can be selected)
4. An optional text area appears below the rating buttons: "Tell us more (optional)"
5. User types a comment (max 500 chars) or skips
6. User clicks "Submit Feedback"
7. `POST /api/feedback` is called
8. On success: widget is replaced with "Thanks for your feedback!" confirmation message
9. On return visit: if feedback already submitted, widget shows the previously submitted rating (read-only, no re-submission)

---

### Placement

- Bottom of the right panel, between the key terms / chat content and the "Not legal advice" disclaimer
- Compact: single row for the rating buttons + collapsible textarea
- Pinned above the disclaimer, not sticky (scrolls with content)

---

### DB Schema

**Table: `user_feedback`**

```sql
CREATE TABLE IF NOT EXISTS user_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  rating text NOT NULL CHECK (rating IN ('up', 'down')),
  comment text CHECK (char_length(comment) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, contract_id)
);
```

---

### DB Tasks

```sql
CREATE TABLE IF NOT EXISTS user_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  rating text NOT NULL CHECK (rating IN ('up', 'down')),
  comment text CHECK (char_length(comment) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, contract_id)
);

CREATE INDEX IF NOT EXISTS idx_user_feedback_contract_id ON user_feedback(contract_id);
CREATE INDEX IF NOT EXISTS idx_user_feedback_user_id ON user_feedback(user_id);

ALTER TABLE user_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_feedback_insert_own ON user_feedback FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_feedback_select_own ON user_feedback FOR SELECT USING (auth.uid() = user_id);
```

---

### DB Helper Functions

**`getExistingFeedback(supabase, { userId, contractId })`**
- Returns: `UserFeedback | null`
- Used on results page load to check if the user has already submitted feedback

**`submitFeedback(supabase, { userId, contractId, rating, comment })`**
- Inserts into `user_feedback`
- Returns: `{ id: string }`
- On duplicate (UNIQUE constraint violation): propagates `409`

---

### API Routes

#### `POST /api/feedback`

**Request:** `{ contract_id: string; rating: 'up' | 'down'; comment?: string }`

**Validation:**
- `rating` must be `'up'` or `'down'`
- `comment` if provided: max 500 chars
- Contract must exist and belong to the user

**Processing:**
1. Validate session; verify contract ownership
2. Check for existing feedback (or catch UNIQUE constraint on insert)
3. `INSERT INTO user_feedback`
4. Return `201 { feedback_id: id }`

**Error responses:**
- `400`: invalid rating
- `403`: contract not owned by user
- `404`: contract not found
- `409`: feedback already submitted for this contract

---

### State Management

- Component: `FeedbackWidget`
- State:
  - `existingFeedback: UserFeedback | null` — loaded from DB on mount
  - `selectedRating: 'up' | 'down' | null`
  - `comment: string`
  - `isSubmitting: boolean`
  - `submitted: boolean` — true after successful POST
- On mount: fetch existing feedback → if exists, set `selectedRating` and `submitted = true`
- Submit button enabled only when `selectedRating !== null && !isSubmitting`

---

### Component

**`FeedbackWidget`** — `components/results/FeedbackWidget.tsx`
- Props: `contractId: string`
- Self-contained; loads its own existing feedback state on mount
- Renders: prompt text + 👍 / 👎 toggle buttons + optional textarea + Submit button
- When `submitted = true`: renders "Thanks for your feedback!" read-only state showing the selected rating

---

### Design

- Container: `border-t pt-4 mt-4`
- Prompt: `text-sm text-gray-600 font-medium`
- Rating buttons: `rounded-full p-2 border`; selected state: `border-blue-600 bg-blue-50 text-blue-600`; unselected: `border-gray-300 text-gray-400`
- Textarea: appears with a smooth height transition; `text-sm rounded border border-gray-300 px-3 py-2 w-full mt-2`; char counter `X/500` shown bottom-right
- Submit button: `text-sm` primary colour; "Submit Feedback"
- Confirmation: `text-sm text-green-600 font-medium` with checkmark icon

---

### Edge Cases

| Scenario | Handling |
|---|---|
| User submits feedback on return visit | Widget loads in read-only confirmed state; "Submit" button not visible |
| User tries to submit without selecting a rating | Submit button remains disabled; no API call made |
| API returns 409 (race condition) | Show confirmation state anyway — feedback was already saved |
| Comment > 500 chars | Textarea shows red character counter; submit button disabled; API also enforces via CHECK constraint |
| Contract not yet processed | Feedback widget is hidden (only shown when `status = 'completed'`) |
| Network error on submit | `isSubmitting = false`; error toast: "Couldn't submit feedback. Try again." |

---

## Feature: Conversation Memory Layer

### Description

The Conversation Memory Layer gives the chat assistant awareness of both the uploaded contract and the full conversation history. Before generating a response, the system classifies the user's question into one of three context types and retrieves only the sources that are relevant. This prevents the model from being told to "answer only from the contract" when the user is asking about the conversation itself.

---

### Context Types

| Type | When it applies | Contract text sent? | History sent? | Required attribution |
|---|---|---|---|---|
| `CONTRACT` | New question about the document (default) | Yes | Last 10 turns | `[Page X]` |
| `HISTORY` | Question purely about the conversation (e.g. "What was my second question?") | **No** | Last 20 turns | `[From conversation]` |
| `BOTH` | Cross-references prior exchange AND the document (e.g. "Based on what you said about the parties, are there exclusions?") | Yes | Last 10 turns | `[Page X]` and/or `[From conversation]` |

Omitting the 15k-token contract text for `HISTORY` queries is not only more accurate — it also cuts token consumption by ~90% for those requests.

---

### Classification Rules

Classification is heuristic (regex only — no extra API call) and operates in priority order:

1. **No history exists** → always `CONTRACT`.
2. **`HISTORY_ONLY` patterns match** → `HISTORY`. Patterns cover:
   - Ordinal references: "what was my **second** question?", "the **third** thing I asked"
   - Direct history questions: "what did you say?", "list everything I've asked so far"
   - Recap requests: "summarize our chat", "how many questions have I asked?"
3. **`HISTORY_REFERENCE` patterns match** → `BOTH`. Patterns cover:
   - "as you mentioned earlier…", "you said that…"
   - "based on what you told me about the parties…"
   - "going back to what you said…"
4. **No match** → `CONTRACT` (safe default for new document questions).

---

### Architecture

```
lib/memory/
  types.ts            ContextType, ClassificationResult, ConversationTurn
  classifier.ts       classifyQuery(question, history) → ClassificationResult
  context-builder.ts  buildContextMessages(type, contractText, history, question) → MessageParam[]
```

**`classifyQuery`** — takes the raw question and the full history array; returns `{ type, confidence }`.

**`buildContextMessages`** — assembles the OpenAI messages array:

```
CONTRACT / BOTH:
  [system]          → document-focused or dual-source system prompt
  [user]            → "Here is the contract text: …"
  [assistant]       → acknowledgment priming
  [...history turns] (last 10)
  [user]            → new question

HISTORY:
  [system]          → conversation-focused system prompt
  [...history turns] (last 20 — no contract injection)
  [user]            → new question
```

**`answerWithMemory`** in `lib/openai/chat.ts` — replaces `answerContractQuestion`. Runs classify → build → OpenAI call (3 retries, exponential backoff). Returns `{ content, pageCitation, contextType }`.

---

### System Prompts

Three distinct system prompts, one per context type:

**`CONTRACT`**
> Answer ONLY from the contract. Every response must end with `[Page X]`. Do not use general legal knowledge.

**`HISTORY`**
> Answer using ONLY the conversation history. Do not reference the contract. End every response with `[From conversation]`.

**`BOTH`**
> Answer from the contract and/or conversation history. Use `[Page X]` for document facts, `[From conversation]` for conversation facts. Include both attributions when both sources are used.

---

### API Changes

`POST /api/chat` response now includes `context_type` alongside `message`:

```json
{
  "message": { "id": "...", "role": "assistant", "content": "...", "page_citation": 3 },
  "context_type": "CONTRACT"
}
```

`context_type` values: `"CONTRACT"` | `"HISTORY"` | `"BOTH"`.

---

### UI: Source Attribution Badges

Assistant messages in `ChatPanel` display a source badge below the message bubble:

| `context_type` | Badge | Colour |
|---|---|---|
| `CONTRACT` | 📄 From contract | Blue |
| `HISTORY` | 💬 From conversation | Purple |
| `BOTH` | ⊞ Contract + conversation | Teal |

For messages reloaded from DB on page mount (which have no `context_type` in the response), the badge is inferred from the message content: `[Page X]` → `CONTRACT`, `[From conversation]` → `HISTORY`, both → `BOTH`.

---

### DB Schema

No new tables. The memory layer is stateless — it reads existing `chat_messages` rows and builds the context window at query time.

---

### Files

| File | Role |
|---|---|
| `lib/memory/types.ts` | `ContextType`, `ClassificationResult`, `ConversationTurn` |
| `lib/memory/classifier.ts` | `classifyQuery()` — heuristic regex classifier |
| `lib/memory/context-builder.ts` | `buildContextMessages()` — assembles OpenAI messages array |
| `lib/openai/chat.ts` | `answerWithMemory()` — classify → build → call → return |
| `app/api/chat/route.ts` | Uses `answerWithMemory`; returns `context_type` in response |
| `components/results/ChatPanel.tsx` | Source attribution badges; `DisplayMessage` with `context_type` field |

---

### Edge Cases

| Scenario | Handling |
|---|---|
| User asks "what was my second question?" with no history | `history.length === 0` → `CONTRACT`; model correctly says it cannot find this in the contract |
| Ordinal reference not in classifier patterns | Falls through to `CONTRACT`; model still has history injected as message turns so conversational context is present |
| `HISTORY` query with very long conversation (>20 turns) | Classifier caps history at 20 turns; oldest turns are dropped |
| `BOTH` query: no `[Page X]` in assistant response | `pageCitation` is `null`; page cite link is not shown; `[From conversation]` badge renders |
| `context_type` missing in very old DB messages | `inferContextType()` in `ChatPanel` parses content for `[Page X]` / `[From conversation]` markers to determine badge |
| OpenAI API error during classified call | Same 3-retry exponential backoff as before; error propagates to API route → 500 |
