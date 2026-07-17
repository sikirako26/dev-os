# Spec: PDF Upload & Text Extraction

**Maps to:** PRD US-002 (upload portion), FR-02, FR-03, FR-14 · Engineering doc §4 Flow 3 (steps 1–2), §7, §9, §11
**Primary source files:** `app/(app)/contracts/upload/page.tsx`, `app/api/contracts/upload/route.ts`, `lib/pdf/parseContract.ts`, `lib/pdf/insertPageMarkers.ts`, `lib/validation/uploadSchema.ts`, `stores/upload-wizard-store.ts`

---

## 1. User Flow

1. User navigates to `/contracts/upload`.
2. `<ContractTypeSelector />` — user picks `NDA` or `MSA` (required before upload is enabled).
3. `<UploadDropzone />` — user drags/drops or file-picks a PDF.
4. Client-side validation runs **before** any network call:
   - File size ≤ 10 MB
   - MIME type `application/pdf`
   - Reject with inline error otherwise (no request sent)
5. Frontend calls `POST /api/contracts/upload` (multipart) via a TanStack Query mutation; `<UploadDropzone />` shows a progress bar bound to the upload's progress event.
6. Backend:
   a. Validates `contract_type` and re-validates file size/mime server-side (never trust client-only validation).
   b. Writes the raw file to Supabase Storage at `contracts/{user_id}/{contract_id}/{filename}.pdf` — **non-blocking**: failure here does not fail the request (see Edge Cases).
   c. Runs `pdf-parse` on the buffer to extract text.
   d. Inserts `[PAGE N]` markers at each page boundary (1-indexed) via `lib/pdf/insertPageMarkers.ts`.
   e. Rejects (`422`) if extracted word count < 100 ("Scanned PDFs are not supported yet").
   f. Rejects (`422`) if page count > 20 or token count > 15,000 (tiktoken estimate on the extracted text).
   g. Inserts a `contracts` row: `status = 'uploaded'`.
7. Response returns `{ contract_id, status, page_count, token_count }`.
8. Frontend transitions to the pre-processing preview (`<PreProcessingPreview />`) showing the standard term list for the selected `contract_type` (10 for NDA, 12 for MSA, per PRD §4 — hardcoded list, not DB-driven at MVP).

---

## 2. DB Schema Touched

`contracts` — INSERT with `user_id`, `contract_type`, `file_path` (nullable), `contract_text`, `status`, `page_count`, `token_count`.

See `docs/specs/supabase-schema.sql` for the full `CREATE TABLE` statement.

## 3. DB Tasks

- `contracts` table + indexes `(user_id)` and `(user_id, created_at desc)` — created in `supabase-schema.sql`.
- Storage bucket `contracts` (private) + RLS policies restricting `INSERT`/`SELECT`/`DELETE` to `auth.uid()::text = (storage.foldername(name))[1]` — created in `supabase-schema.sql`. **This must ship via SQL, not the Supabase dashboard** — omitting it silently breaks uploads for all users except the bucket owner (PRD assumption #13).

## 4. API Route

### `POST /api/contracts/upload`

**Auth:** required (session cookie, enforced by `middleware.ts`).

**Request:** `multipart/form-data`
| Field | Type | Notes |
|---|---|---|
| `file` | File | PDF, ≤ 10 MB |
| `contract_type` | string | `'NDA' \| 'MSA'` |

**Response `200`:**
```json
{
  "contract_id": "uuid",
  "status": "uploaded",
  "page_count": 12,
  "token_count": 8421
}
```

**Validation (Zod, `lib/validation/uploadSchema.ts`):**
```ts
import { z } from 'zod'

export const uploadRequestSchema = z.object({
  contract_type: z.enum(['NDA', 'MSA']),
})

export const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10MB
export const MAX_PAGES = 20
export const MAX_TOKENS = 15000
export const MIN_WORDS = 100
```

**Error responses:**
| Status | Code | When |
|---|---|---|
| 400 | `invalid_request` | Missing file or invalid `contract_type` |
| 413 | `file_too_large` | File > 10MB |
| 415 | `unsupported_media_type` | Non-PDF mime type |
| 422 | `unsupported_scanned_pdf` | Extracted text < 100 words |
| 422 | `contract_too_long` | > 20 pages or > 15,000 tokens |
| 500 | `internal_error` | pdf-parse crash, unexpected failure |

**Route sketch:**
```ts
// app/api/contracts/upload/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { uploadRequestSchema, MAX_FILE_BYTES, MAX_PAGES, MAX_TOKENS, MIN_WORDS } from '@/lib/validation/uploadSchema'
import { parseContract } from '@/lib/pdf/parseContract'
import { insertPageMarkers } from '@/lib/pdf/insertPageMarkers'
import { encode } from 'gpt-tokenizer'

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: { code: 'unauthenticated', message: 'Sign in required' } }, { status: 401 })
  }

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const parsed = uploadRequestSchema.safeParse({ contract_type: formData.get('contract_type') })

  if (!file || !parsed.success) {
    return NextResponse.json({ error: { code: 'invalid_request', message: 'file and contract_type are required' } }, { status: 400 })
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: { code: 'file_too_large', message: 'File must be 10MB or smaller' } }, { status: 413 })
  }
  if (file.type !== 'application/pdf') {
    return NextResponse.json({ error: { code: 'unsupported_media_type', message: 'Only PDF files are supported' } }, { status: 415 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const { text, pageCount } = await parseContract(buffer)
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length

  if (wordCount < MIN_WORDS) {
    return NextResponse.json({ error: { code: 'unsupported_scanned_pdf', message: 'Scanned PDFs are not supported yet' } }, { status: 422 })
  }

  const markedText = insertPageMarkers(text, pageCount)
  const tokenCount = encode(markedText).length

  if (pageCount > MAX_PAGES || tokenCount > MAX_TOKENS) {
    return NextResponse.json({ error: { code: 'contract_too_long', message: 'Contract exceeds the 20-page / 15,000-token limit' } }, { status: 422 })
  }

  const contractId = crypto.randomUUID()
  const filePath = `contracts/${user.id}/${contractId}/${file.name}`

  // Non-blocking Storage write — failure does not fail the request
  let storedPath: string | null = filePath
  const { error: storageError } = await supabase.storage.from('contracts').upload(filePath, buffer, { contentType: 'application/pdf' })
  if (storageError) storedPath = null

  const { error: insertError } = await supabase.from('contracts').insert({
    id: contractId,
    user_id: user.id,
    contract_type: parsed.data.contract_type,
    file_path: storedPath,
    contract_text: markedText,
    status: 'uploaded',
    page_count: pageCount,
    token_count: tokenCount,
  })

  if (insertError) {
    return NextResponse.json({ error: { code: 'internal_error', message: 'Failed to save contract' } }, { status: 500 })
  }

  return NextResponse.json({ contract_id: contractId, status: 'uploaded', page_count: pageCount, token_count: tokenCount })
}
```

## 5. State Management

- **TanStack Query mutation** (`useUploadContractMutation`) drives the upload call; exposes `progress` via `axios` `onUploadProgress` or `XMLHttpRequest` (native `fetch` does not expose upload progress — use `XMLHttpRequest` or `axios` in the mutation function).
- **Zustand `upload-wizard-store`** holds ephemeral wizard state before/independent of the server call:
```ts
// stores/upload-wizard-store.ts
import { create } from 'zustand'

type WizardStep = 'selecting-type' | 'uploading' | 'previewing' | 'adding-custom-terms' | 'processing'

interface UploadWizardState {
  step: WizardStep
  contractType: 'NDA' | 'MSA' | null
  file: File | null
  customTerms: string[]
  setStep: (step: WizardStep) => void
  setContractType: (type: 'NDA' | 'MSA') => void
  setFile: (file: File | null) => void
  addCustomTerm: (term: string) => void
  removeCustomTerm: (term: string) => void
  reset: () => void
}

export const useUploadWizardStore = create<UploadWizardState>((set) => ({
  step: 'selecting-type',
  contractType: null,
  file: null,
  customTerms: [],
  setStep: (step) => set({ step }),
  setContractType: (contractType) => set({ contractType }),
  setFile: (file) => set({ file }),
  addCustomTerm: (term) => set((s) => (s.customTerms.length >= 5 ? s : { customTerms: [...s.customTerms, term] })),
  removeCustomTerm: (term) => set((s) => ({ customTerms: s.customTerms.filter((t) => t !== term) })),
  reset: () => set({ step: 'selecting-type', contractType: null, file: null, customTerms: [] }),
}))
```

## 6. Component Spec

- **`<ContractTypeSelector />`** — segmented control or dropdown, `NDA` / `MSA`; disabled once a file is selected mid-upload.
- **`<UploadDropzone />`** — drag-and-drop target + hidden file input fallback, client-side validation (size/mime) before enabling submit, progress bar during upload.
- **`<PreProcessingPreview />`** — renders the standard term list for the selected type as static rows (not yet extracted values), plus `<AddCustomTermButton />` (see `custom-term-addition.md`).

## 7. Design Notes

- Progress indicator uses the design system's 3-step progress component: "Uploading" (this spec) is a single determinate progress bar (not the 3-step "extracting → analysing → compiling" indicator, which applies to the **process** step — see `key-term-extraction.md`).
- Errors render via the shared `<InlineError />` using the Red token family, with an icon — never color alone (WCAG AA).

## 8. Edge Cases

| Case | Behavior |
|---|---|
| File > 10MB or non-PDF | Rejected client-side before any network call; inline error |
| Scanned/image PDF (< 100 words extracted) | `422 unsupported_scanned_pdf`; no usable `contracts` row is left — either no insert happens (preferred) or the row is inserted with `status='error'` and excluded from dashboard "resume" affordances |
| Contract > 20 pages or > 15,000 tokens (dense text within page limit) | `422 contract_too_long`, rejected before any OpenAI call is attempted |
| Supabase Storage write fails | Non-blocking: `file_path` stored as `null`; upload still succeeds since `contract_text` is the source of truth for processing/chat; Results page (`results-display.md`) falls back to `<TextViewerFallback />` |
| Network drops mid-upload | TanStack Query mutation surfaces an error state; `<UploadDropzone />` shows "Upload failed — try again", file selection is preserved so the user doesn't have to re-pick |
| User uploads a second file before the first finishes | Dropzone disabled while a mutation is `pending` |

## 9. Acceptance Criteria

- [ ] Valid PDF ≤ 10MB, ≤ 20 pages, ≤ 15,000 tokens uploads successfully and creates a `contracts` row with `status='uploaded'`.
- [ ] Non-PDF or oversized files are rejected client-side with zero network calls.
- [ ] Scanned PDFs (< 100 words) are rejected server-side with the exact copy "Scanned PDFs are not supported yet".
- [ ] Storage failures never block the upload flow or corrupt `contract_text`.
- [ ] `[PAGE N]` markers are present and 1-indexed in `contract_text` for every page.
