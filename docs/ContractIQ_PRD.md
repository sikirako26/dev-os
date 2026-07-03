# ContractIQ — Product Requirements Document

**Version:** 2.0 | **Date:** July 3, 2026 | **Status:** Draft
**Scope:** NDA + MSA contracts | **Stack:** Next.js 14 · Supabase · Claude 3.5 Sonnet

---

## Table of Contents

1. [Problem (AI-Specific)](#1-problem-ai-specific)
2. [User](#2-user)
3. [Core Metric](#3-core-metric)
4. [MVP Features](#4-mvp-features)
5. [Constraints](#5-constraints)
6. [Grounding Strategy](#6-grounding-strategy)
7. [Hallucination Guardrails](#7-hallucination-guardrails)
8. [Cost Budget](#8-cost-budget)
9. [Eval Strategy](#9-eval-strategy)
10. [Production Readiness](#10-production-readiness)
11. [Engineering Context](#11-engineering-context)
12. [Product Intelligence](#12-product-intelligence)
13. [Design & UX](#13-design--ux)
14. [Technical Implementation Framework (Next.js)](#14-technical-implementation-framework-nextjs)
15. [Feature-Wise Build Plan](#15-feature-wise-build-plan)

---

## 1. Problem (AI-Specific)

### What Is Broken

Business professionals — founders, ops leads, and freelancers — routinely sign NDAs and MSAs without fully understanding what they're agreeing to. Without in-house legal teams, a single contract review takes 90–120 minutes, requires expertise most SMBs don't have, and frequently results in missed obligations, unfavourable auto-renewal terms, or uncapped liability clauses that only surface after a dispute.

### Why Rule-Based Systems Fail

Regex and keyword matching cannot handle the clause variant diversity present in real-world contracts. A "confidentiality obligation" clause may appear in 50+ structurally different phrasings — from *"the Receiving Party shall hold all Confidential Information in strict confidence"* to *"neither party may disclose the terms hereof to any third party"*. Rule-based parsers produce a >30% miss rate on production contracts and require continuous manual maintenance as new law firms introduce new clause structures.

### Why LLMs Are the Right Approach

Claude 3.5 Sonnet can read legal prose in context, reason about what a clause means, extract the precise value of a term (e.g. *"36 months"* as notice period), and attribute it to the exact page number — all in a single inference pass. This makes structured extraction tractable without a labelled training corpus specific to each law firm's drafting style.

### Market Gap

Existing tools (DocuSign CLM, Ironclad, Kira Systems) are designed for enterprise legal teams with $50k–$500k annual contracts. Generic AI assistants like ChatGPT produce unstructured summaries with no page reference, no confidence score, and no contract-type-specific schema. There is no affordable, purpose-built tool for SMBs reviewing NDA/MSA contracts with a structured upload-extract-chat workflow.

### Why ContractIQ Is Defensible

| Moat Dimension | Detail |
|---|---|
| Contract-type specificity | Prompt library and term schema purpose-built for NDA and MSA structures — extracts the 20–30 terms that matter, not a generic summary |
| Confidence scoring | Visible per-term confidence teaches users what to scrutinise, building trust over time |
| Feedback loop | Every user correction (opt-in, anonymised) feeds prompt improvement — proprietary signal that generic tools don't collect |
| Grounded chat | Q&A strictly answers from the uploaded contract text, not general legal knowledge — eliminates the hallucination risk that undermines trust in ChatGPT |

---

## 2. User

### Primary Persona — Time-Pressed Founder / Ops Lead

| Attribute | Detail |
|---|---|
| Role | Founder, COO, Procurement Manager, Legal Ops Manager |
| Company | 5–250 employees; no in-house legal counsel |
| Industries | SaaS, agency, professional services, fintech, e-commerce |
| Contract volume | 5–15 NDAs or MSAs per month |
| Current behaviour | Google searches, ad-hoc lawyer consultations ($250–$500/hr), or just signs without reading |
| Core pain | 90–120 min per review; misses auto-renewal clauses, indemnification limits, IP assignment; feels routine but isn't |

**Journey today:** Receives contract via email → opens in PDF reader → skims headings → Googles unfamiliar terms → calls a lawyer for "quick" review ($500) → signs anyway because the deal can't wait. ContractIQ replaces steps 3–5 in under 15 minutes.

### Secondary Persona — Freelancer / Consultant

| Attribute | Detail |
|---|---|
| Role | Individual contributor: designer, developer, marketer, consultant |
| Contract volume | 1–4 MSAs/month from larger clients |
| Core pain | Power imbalance discourages pushback; no tool surfaces which clauses are non-standard; cannot afford $500 legal review for a $3k project |

**Journey today:** Receives client MSA → overwhelmed by dense legal language → signs to avoid friction → later discovers unfavourable IP assignment or uncapped liability clause. ContractIQ gives them the language and page reference to push back with confidence.

---

## 3. Core Metric

**North Star:** Average time from contract upload to completed key-term review
- **Baseline:** 90 minutes (manual review, no tool)
- **Target:** ≤ 15 minutes end-to-end within ContractIQ
- **Tracked via:** Session logs — upload timestamp to last interaction or explicit "review complete" action

### Primary Metrics

| Metric | Baseline | Target | How Tracked |
|---|---|---|---|
| Key-term extraction F1 | 0% (no tool) | ≥ 88% NDA / ≥ 85% MSA | Offline eval vs labelled test set |
| P95 extraction latency | — | ≤ 30s for ≤ 20-page contracts | Server-side timing logs |
| Confidence calibration error | — | ≤ 0.10 per 10% bucket | Calibration curve on eval set |

### Secondary Metrics

| Metric | Target | How Tracked |
|---|---|---|
| User correction rate | ≤ 12% of extracted terms manually corrected | `corrections_count / total_extracted_terms` per session |
| 30-day retention | ≥ 45% | Supabase session analytics |
| Contracts per active user / month | ≥ 4 | Dashboard analytics on contracts table |
| Cost per analysis | ≤ $0.25 (20-page contract) | Openaibilling logs |
| NPS | ≥ 40 | In-app survey at session end |

---

## 4. MVP Features

### P0 — Must Ship (Core Value)

**Authentication (Supabase Auth)**
Email/password sign-up and sign-in. On registration the user is redirected to the Dashboard. Session state persists via Supabase session tokens. Invalid credentials return a clear inline error. Auth state is accessible server-side via `@supabase/ssr` — all protected routes verify the session in Next.js middleware before rendering.

**PDF Upload + Text Extraction**
User uploads a PDF (drag-and-drop or file picker). The `POST /api/upload` route runs `pdf-parse` server-side, extracts the full text with `[PAGE N]` markers inserted at every page boundary, and stores it in `contracts.contract_text`. The raw PDF is optionally uploaded to Supabase Storage for the inline viewer — this is non-blocking: if Storage fails, only the viewer is unavailable; the AI pipeline runs entirely from the stored text. Files outside 10 MB / 20 pages are rejected with a specific error message before any processing begins.

**Contract Type Selection (NDA / MSA)**
User selects the contract type before upload. This selection determines which term schema is passed to the extraction prompt. NDA terms: Parties, Effective Date, Confidentiality Obligations, Permitted Disclosures, Term & Duration, Governing Law, Jurisdiction, IP Ownership, Non-Solicitation, Breach & Remedy. MSA terms: Parties, Service Scope, Payment Terms, Invoice Schedule, Late Payment Penalty, Liability Cap, Indemnification, IP Ownership, Termination Clause, Governing Law, Dispute Resolution, Notice Period.

**Claude 3.5 Sonnet Key Term Extraction**
The `POST /api/process` route reads `contract_text` from the DB (never the PDF), builds a few-shot prompt with 3 NDA or 3 MSA labelled examples, and calls Claude 3.5 Sonnet in JSON mode. Output is a structured array: `{ term_name, value, page_number, confidence_score, source_sentence }`. Results are written to the `key_terms` table. A single auto-retry is attempted if JSON parse fails. If extraction errors persist, `contracts.status` is set to `error` and the UI surfaces a retry CTA without requiring re-upload.

**Confidence Warnings**
Confidence scores are colour-coded on the key terms panel: green (≥ 80%), amber (70–79%), red (< 70%). Terms below 70% show a ⚠️ icon and tooltip: *"Low confidence — verify this directly in the document."* The PDF viewer auto-scrolls to the nearest matching page span. Terms are always shown regardless of score, but in the chat interface, any term with confidence < 70% triggers an automatic "I don't know based on this document" response if the user asks about it directly.

**Custom Key Term Addition**
A `+ Add Key Term` button on the upload screen lets users add up to 5 custom terms before processing (e.g. *"Non-compete radius"*, *"Data residency clause"*). Custom terms are appended to the standard term list in the extraction prompt with the same schema. Results appear in the key terms panel with a "Custom" badge. Custom terms are stored in `key_terms` with `is_manual = true`.

**Results Page: Key Terms Panel + PDF Viewer**
Two-panel layout: left panel is the interactive PDF viewer (PDF.js, scrollable, zoomable, term spans highlighted); right panel is the key terms list. Clicking any page reference on the key terms panel scrolls the PDF viewer to that page with a visual highlight. Each term row has an expandable "Why?" section showing the verbatim source sentence used for extraction. A `"Not legal advice. Verify critical terms with a qualified lawyer."` disclaimer is pinned at the top of the results page — non-dismissible.

---

### P1 — Target v1.0

**Chat with Contract**
A "Chat" tab on the results page opens a full-screen chat interface. The `POST /api/chat` route reads `contract_text` from the DB, fetches the last 200 messages for the session (ascending), and builds the message array for Claude 3.5 Sonnet. The system prompt hardcodes document-only answers and mandatory `[Page X]` citation. Each AI response includes a "Source: Page X" link that scrolls the PDF viewer. Chat messages are written to `chat_messages` in real time, linked to `chat_sessions`, linked to `contracts`.

**Persistent Chat History**
Reopening any contract from the Dashboard loads the full prior chat session. The session is scoped one-per-contract (one `chat_sessions` row per `contract_id`). All messages survive browser refresh and re-login.

**Dashboard with Contract History**
The Dashboard shows a summary card (total contracts, NDA count, MSA count) and a sortable, paginated list of all previous contracts with columns: Name · Type · Date · Status. Clicking any row navigates to the results page for that contract. Empty state: *"No contracts reviewed yet — upload your first contract to begin."*

**Inline Key Term Editing**
Any extracted term value can be edited inline. The updated value is saved to Supabase within 2 seconds; the original AI-extracted value is preserved in `term_corrections` for the feedback loop. Edited terms display an "Edited" badge. Edits do not trigger a re-extraction.

**Text Viewer Fallback**
When `signed_pdf_url` is null (Storage unavailable or upload failed), the left panel renders a paginated text viewer that parses `[PAGE N]` markers from `contract_text` and renders each page as a labelled section with font-size controls. The text viewer responds to `targetPage` prop changes from key-term click events identically to the PDF viewer.

---

### P2 — Post-Launch Backlog

| Feature | Description |
|---|---|
| Export (CSV / PDF) | Generates a formatted key terms summary file downloadable within 5 seconds |
| Feedback rating | Thumbs up/down + optional comment per review, stored in `user_feedback` |
| Batch upload | Upload up to 5 contracts at once, processed sequentially |
| Dashboard charts | Contracts reviewed per month, term correction rate trend |

---

## 5. Constraints

### AI Behaviour — MUST

| Rule | Detail |
|---|---|
| All answers grounded in uploaded document | The LLM may only answer from the contract text provided — no general legal knowledge used |
| Every answer includes a citation | Every factual claim in a chat response must include a `[Page X]` citation — responses without citations are rejected |
| Confidence < 70% → "I don't know" | If the model cannot locate a clear answer in the document with ≥ 70% confidence, it must respond: *"I don't know based on this document"* — no guessing |
| Cost < $0.10 per question | Each chat turn must stay within $0.10 in LLM token cost; prompt and context are sized accordingly |

### AI Behaviour — MUST NOT

| Rule | Why |
|---|---|
| Hallucinate (answer from training data when not grounded) | Prevents "AI sounds confident but wrong" — the core trust failure in legal tooling |
| Answer without a citation | An uncited answer cannot be verified; it trains users to trust the AI blindly |
| Guess at information not in the document | Better to say "I don't know" than return a plausible but incorrect clause value |
| Answer general legal questions outside this contract | Domain must be limited to the specific uploaded deal — not legal advice broadly |

### Product Constraints

| Constraint | Rationale |
|---|---|
| Text-layer PDFs only, ≤ 10 MB, ≤ 20 pages | `pdf-parse` cannot handle scanned/image PDFs; size limit keeps token costs within budget |
| English-language, US/UK law only (MVP) | CUAD eval dataset and few-shot examples are US/UK-biased; accuracy degrades on other jurisdictions |
| LLM API key server-side only | Never exposed in client bundle, network requests, or logs |
| No training on user contract data | Required for GDPR compliance and user trust |
| GDPR: data deletion on request | DPA with LLM provider signed before EU onboarding |
| 90-day PDF retention, user-deletable | Auto-deleted 90 days after last access; users can delete at any time from Dashboard |
| Custom terms capped at 5 (MVP) | More custom terms increase context length and latency; cap reviewed at v1.1 |

---

## 6. Grounding Strategy

ContractIQ's chat agent is grounded strictly in the uploaded contract text using a full-context LLM approach — the entire contract is passed as context on every turn.

### How It Works

On every chat turn, the `POST /api/chat` route fetches `contracts.contract_text` from the database (stored at upload, never re-downloaded) and all prior messages for the session (up to 200, ascending). These are assembled into the message array:

```
[system prompt] → [full contract text block] → [conversation history] → [user question]
```

The model reads the full document on every call. There is no retrieval step, no vector store, and no chunk boundary problem. For a ≤ 20-page contract (10,000–15,000 tokens), this fits comfortably within Claude 3.5 Sonnet's context window.

### System Prompt (Hardcoded, Non-Negotiable)

> "You are a contract analysis assistant. Answer questions only from the document text provided below. Do not use general legal knowledge. If you cannot find a clear answer in the document with high confidence, respond: 'I don't know based on this document.' Every response must include a citation in the format [Page X]. Never answer without a citation."

### Why Full-Context Over Chunking

| Approach | Tradeoff |
|---|---|
| **Full-context (our approach)** | Simpler, no retrieval errors, no chunk boundary splits, lower latency, sufficient for ≤ 20-page contracts |
| Chunking + vector retrieval | Needed for very long docs (100+ pages) — adds embedding pipeline, retrieval latency, and the risk of missing a clause that spans two chunks |

Full-context is the right call for MVP contract sizes. If limits are raised beyond 20 pages in v2, a chunking strategy will be evaluated then.

### Query Classification (No Extra API Call)

The system prompt instructs the model to adjust scope based on question type — about the contract, about prior conversation, or both — enabling memory-style follow-ups (*"What did you say about the liability cap?"*) without a separate classification inference.

---

## 7. Hallucination Guardrails

Hallucination risk exists at two surfaces: extraction (wrong term value or page) and chat (answer drawn from training data instead of the document). Three guardrails stack to prevent both.

### Guardrail 1 — Confidence Threshold

If the model cannot locate a clear, well-supported answer in the document, it must respond **"I don't know based on this document."** No partial guesses, no hedged answers, no confident-sounding fabrications.

- Confidence threshold: **< 70%** → mandatory "I don't know" response
- Applied to both extraction (low-confidence terms display ⚠️) and chat (low-confidence answers blocked entirely)
- Better to be wrong in a transparent, recoverable way than to hallucinate convincingly

### Guardrail 2 — Citation Requirement

Every factual claim in a chat response requires a source citation (`[Page X]`). Responses without citations are rejected before being shown to the user.

- Enforced in the system prompt as a non-negotiable output rule
- Automated CI test: assert every AI response in the test suite contains at least one `[Page X]` tag
- Extraction: every extracted term shows its verbatim source sentence (expandable) so users can verify the AI's reasoning directly

### Guardrail 3 — Domain Limiting

The model only answers questions about the specific uploaded contract. It must not answer general legal questions, speculate about what "most contracts" say, or draw on knowledge outside the document.

- System prompt explicitly scopes answers to the uploaded document only
- Automated CI test: send a general legal question (e.g. *"What is the standard NDA notice period in the UK?"*) → assert response contains "I don't know based on this document" and not a general answer
- Legal disclaimer pinned on every results page: *"ContractIQ is not legal advice. Verify critical terms with a qualified lawyer."*

### Guardrail Summary

| Guardrail | Trigger | Response |
|---|---|---|
| Confidence threshold | Model confidence < 70% | "I don't know based on this document" |
| Citation requirement | No `[Page X]` in response | Response rejected; user sees retry prompt |
| Domain limiting | Question outside the uploaded contract | Deflect: scope limited to this document |

---

## 8. Cost Budget

### Model

**Claude 3.5 Sonnet** — selected for strong instruction-following on legal text, reliable citation compliance, and favourable cost-to-quality ratio at production volume.

### Per-Question Cost Budget

| Parameter | Value |
|---|---|
| Max cost per chat question | **$0.10** |
| Baseline questions per deal / month | 5 |
| Max spend per deal / month | **$0.50** |
| Extraction cost per contract | ≤ $0.15 (one-time, at upload) |
| **Total per deal (extraction + 5 questions)** | **≤ $0.65** |

The $0.10/question budget drives prompt efficiency decisions: context passed to the model is sized to the contract text only — no extra retrieval overhead, no unnecessary system prompt verbosity.

### Monthly Operational Cost (500 active users / ~2,000 contracts per month)

| Item | Monthly Cost |
|---|---|
| Claude 3.5 Sonnet — extraction (2,000 × $0.15) | $300 |
| Claude 3.5 Sonnet — chat (10,000 questions × $0.10) | $1,000 |
| Supabase Pro (DB + Storage + Auth) | $25 |
| Vercel Pro (frontend + API routes) | $20 |
| Uptime monitoring | $10 |
| **Total** | **~$1,355/mo** |

Cost per active user: **$2.71/month**. At $19/mo Starter plan, gross margin remains strong at scale. Chat volume drives cost; usage caps per plan tier prevent runaway spend.

### MVP Build Cost (14 weeks)

| Role | FTE | Duration | Cost |
|---|---|---|---|
| Lead Fullstack Engineer | 1.0 | 14 weeks | $35,000 |
| Frontend Engineer | 1.0 | 14 weeks | $28,000 |
| Product Manager | 1.0 | 14 weeks | $28,000 |
| QA / DevOps | 0.5 | 14 weeks | $10,500 |
| UX Designer | 0.5 | 8 weeks | $7,000 |
| Infrastructure (Supabase, Vercel, LLM credits, tooling) | — | — | $655 |
| **Total** | | | **~$109,155** |

### Directional Pricing

| Plan | Price | Includes | Target User |
|---|---|---|---|
| Free Trial | $0 / 14 days | 5 analyses, full features | All new users |
| Starter | $19/month | 10 analyses + 50 chat questions/month | Freelancers, early founders |
| Growth | $49/month | 40 analyses + 200 questions/month, export | SMB ops managers |
| Pro | $129/month | Unlimited analyses + questions, 5-seat workspace | Legal ops, agencies |

---

## 9. Eval Strategy

Four evals must pass before each release ships. These are non-negotiable — a failed eval blocks the release.

### Eval 1 — Grounding (Are answers grounded in the document?)

- **Method:** Run 50 Q&A pairs through the chat system against known test contracts
- **Check:** Does each answer cite a `[Page X]` source that exists in the document?
- **Pass threshold:** ≥ 95% of responses are properly grounded with a valid citation
- **Failure mode:** Model answers from training data — correct-sounding but not from the contract
- **Cadence:** Every release

### Eval 2 — Accuracy (Are grounded answers factually correct?)

- **Method:** Take the Q&A pairs from Eval 1 that passed grounding; have a human reviewer verify each answer is accurate to its cited source
- **Check:** Does the answer correctly represent what the cited page actually says?
- **Pass threshold:** ≥ 90% of grounded answers are accurate to source
- **Failure mode:** Model cites the right page but misreads or paraphrases the clause incorrectly
- **Cadence:** Every release

### Eval 3 — Usefulness (Do answers help users?)

- **Method:** After one week of beta usage, survey users with: *"Did this AI answer help you understand your contract?"*
- **Pass threshold:** ≥ 70% respond Yes
- **Failure mode:** Answers are technically grounded and accurate but written in legalese the user can't act on
- **Cadence:** Weekly during beta; monthly post-launch

### Eval 4 — Trust (Do users trust the AI enough to act on it?)

- **Method:** Survey: *"Would you make a decision based on this AI's answer?"*
- **Pass threshold:** ≥ 60% respond Yes
- **Failure mode:** Users use the product but don't trust it — a leading indicator of churn
- **Cadence:** End of beta; quarterly post-launch

### Eval Summary

| Eval | What It Tests | Pass Threshold | Cadence |
|---|---|---|---|
| Grounding | Every answer cites a valid source | ≥ 95% properly cited | Every release |
| Accuracy | Cited answers are factually correct | ≥ 90% accurate to source | Every release |
| Usefulness | Answers help users understand | ≥ 70% say Yes | Weekly (beta) / Monthly |
| Trust | Users would act on answers | ≥ 60% say Yes | End of beta / Quarterly |

### Extraction-Specific Evals (Technical)

| Eval | Method | Target | Cadence |
|---|---|---|---|
| Extraction F1 | Precision / Recall / F1 vs 30 NDA + 20 MSA labelled contracts | ≥ 88% NDA / 85% MSA | Every release |
| Page attribution accuracy | % terms with correct page number vs ground truth | ≥ 92% | Every release |
| Confidence calibration | Calibration curve: predicted vs observed accuracy per 10% bucket | Error ≤ 0.10 | Monthly |
| Drift detection | Sample 10 recent user corrections; compare against expected extraction | No regression | Weekly |

**Drift alert:** 7-day rolling correction rate > 12% → immediate prompt review, no waiting for next monthly cycle.

---

## 10. Production Readiness

### Security

| Area | Control |
|---|---|
| Data isolation | Supabase RLS on all tables: `auth.uid() = user_id`; verified via cross-user test accounts in CI pipeline |
| API key protection | OpenaiAPI key server-side only; never in client bundle, never logged, never in error responses |
| PDF access | Signed URLs with 1-hour expiry; Storage RLS restricts to owner's folder: `auth.uid()::text = (storage.foldername(name))[1]` |
| Prompt injection | System prompt separation enforced; user-supplied text passed as data, not injected into system prompt string |
| Error responses | No stack traces or internal paths in API error responses to client |

### Reliability & Operations

| Item | Detail |
|---|---|
| Uptime target | 99.5% SLA; Uptime Robot monitors key endpoints with Slack alerts |
| LLM API failures | Retry with exponential backoff (3 attempts, 2s/4s/8s); `contracts.status = 'error'` after final failure; user sees retry CTA — no re-upload required |
| Storage failures | Non-blocking; AI pipeline continues using `contract_text`; only PDF viewer is hidden |
| Rate limiting | Per-user rate limit on `/api/process` and `/api/chat`; usage alerts at 80% of monthly LLM token budget |
| Data backups | Supabase automatic daily backups (Pro plan); 7-day point-in-time recovery |
| GDPR | User data deletion available from Dashboard; data processing agreement in place with Supabase and Openaibefore EU launch |

---

## 11. Engineering Context

### Stack

| Layer | Technology | Rationale |
|---|---|---|
| Frontend | Next.js 14 (App Router) + TypeScript + Tailwind CSS | Server components, built-in API routes, TypeScript end-to-end |
| Auth | Supabase Auth (`@supabase/ssr`) | Session management in Next.js middleware; RLS integration |
| Database | Supabase Postgres | Managed Postgres + RLS + real-time subscriptions in one platform |
| Storage | Supabase Storage | Co-located with DB; signed URLs; RLS via SQL |
| LLM | Claude 3.5 Sonnet (Anthropic) | Strong instruction-following on legal text; reliable citation compliance; 200k context |
| PDF extraction | `pdf-parse` (server-side) | No data egress to third parties; handles text-layer PDFs |
| PDF rendering | `react-pdf` / PDF.js (client-side) | No server load; page navigation and zoom; lazy-load pages |
| Hosting | Vercel | Zero-config deployment; edge middleware for auth |

### Critical Architecture Decisions

**Text extracted once, read many times.** At upload, `pdf-parse` extracts the full text with `[PAGE N]` markers and stores it in `contracts.contract_text`. Every downstream operation — Claude 3.5 Sonnet extraction, chat, text viewer — reads from the DB. The PDF file is never re-downloaded after upload. This means the AI pipeline is fully independent of Supabase Storage availability.

**Storage is non-blocking.** The upload route attempts to write the PDF to Supabase Storage after extracting text. If Storage fails, `contracts.file_path` is left null and processing continues normally. Only the PDF viewer is affected — it falls back to the text viewer.

**No fine-tuning at launch.** Few-shot prompting with 3 NDA + 3 MSA labelled examples in the system prompt closes the accuracy gap without requiring a proprietary training dataset. Fine-tuning is planned for v2 once sufficient user correction data is collected.

### Database Schema (Dependency Order)

| Table | Key Columns | Notes |
|---|---|---|
| `contracts` | `id, user_id, contract_type, contract_text, file_path, status, error_message` | `status`: pending → processing → completed → error |
| `key_terms` | `id, contract_id, user_id, term_name, value, page_number, confidence_score, source_sentence, is_manual` | `is_manual = true` for custom terms |
| `term_corrections` | `id, key_term_id, user_id, original_value, corrected_value` | INSERT-only for users; SELECT for service role (feedback loop) |
| `chat_sessions` | `id, contract_id, user_id` | UNIQUE on `contract_id` — one session per contract |
| `chat_messages` | `id, session_id, user_id, role, content, created_at` | Composite index on `(session_id, created_at)` |
| `user_feedback` | `id, user_id, contract_id, rating, comment` | UNIQUE on `(user_id, contract_id)` |

All tables: indexed `user_id`, RLS enabled, `updated_at` triggers on `contracts` and `chat_sessions`.

**Storage bucket** (`contracts`): private · 10 MB file size limit · PDF MIME type only
Path pattern: `contracts/{user_id}/{contract_id}/{filename}.pdf`
Bucket and all three Storage RLS policies (INSERT / SELECT / DELETE) created via SQL — no dashboard steps.

---

## 12. Product Intelligence

ContractIQ's ability to improve over time depends on three feedback loops operating in parallel.

### Feedback Loops

| Loop | Signal | Action | Cadence |
|---|---|---|---|
| User corrections | `term_corrections` table — every inline edit captured (opt-in, anonymised) | Review correction patterns; update few-shot examples in extraction prompt | Weekly |
| Explicit feedback | `user_feedback` — thumbs up/down + comment per review | Tag systematic failures; prioritise edge cases for prompt work | Weekly |
| Eval regression | Offline eval suite run on every deploy | Alert if F1 drops more than 2 points from previous release | Every deploy |

### Prompt Versioning

All extraction prompts are versioned (v1.0, v1.1…) in a shared team document with the following fields per version: version ID, change summary, F1 before/after on eval set, date deployed, author. A/B testing of prompt variants is run monthly on a 50-contract offline eval set. New prompt versions are never deployed to production without a passing eval run.

### Post-Launch Segmentation

After launch, accuracy will be segmented by contract jurisdiction (where available from user profile) and industry to surface systematic gaps. Non-US/non-UK performance is expected to be lower at launch due to CUAD dataset bias — tracked monthly, addressed in v1.2 with jurisdiction-specific few-shot examples.

---

## 13. Design & UX

**Core principle:** Zero legal jargon without a tooltip. Any non-lawyer should complete a full contract review with no onboarding training required.

### Screen Inventory

| Screen | Purpose | Key Interactions |
|---|---|---|
| **Landing** | Convert visitors to sign-ups | Value prop headline · demo GIF showing extraction in 30s · "Get Started Free" + "Sign In" CTAs |
| **Sign Up / Sign In** | Auth | Supabase email/password modal · email verification · redirect to Dashboard on success |
| **Dashboard** | Contract history + quick action | Summary card (total · NDA · MSA counts) · sortable contract list (name / type / date / status) · "Review a Contract" primary CTA · empty state message |
| **Upload** | Contract submission | Contract type dropdown (NDA / MSA) · drag-and-drop PDF zone · pre-processing preview of standard terms to be extracted · "+ Add Key Term" button · "Process Contract" CTA |
| **Processing** | Progress feedback | 3-step animated indicator: "Extracting text" → "Analysing with AI" → "Compiling results" · estimated time shown |
| **Results** | Core review experience | Left: PDF viewer (PDF.js — scrollable, zoomable, highlighted term spans) or text viewer fallback · Right: key terms panel with colour-coded confidence badges · expandable source sentence per term · "Chat" tab · legal disclaimer pinned at top |
| **Chat** | Document Q&A | Floating tab on results page · right-aligned user bubbles · left-aligned AI responses · "Source: Page X" link per response · persistent chat history |
| **Error States** | Recovery | Upload errors (file too large, wrong type) · LLM timeout (retry CTA without re-upload) · scanned PDF detection · empty extraction (all terms low confidence) |

### Confidence Colour System

| Score | Colour | Indicator |
|---|---|---|
| ≥ 80% | Green | Clean badge — no warning |
| 50–79% | Amber | Amber badge — review recommended |
| < 70% | Red | Red badge + ⚠️ icon + tooltip + PDF auto-scroll; chat blocks answer → "I don't know" |

### Accessibility

WCAG 2.1 AA compliance required at v1.0 launch. All legal jargon terms in the UI are tooltipped with plain-English definitions. Colour indicators are always paired with an icon or text label — not colour alone.

---

## 14. Technical Implementation Framework (Next.js)

### App Router Structure

```
app/
├── (auth)/
│   ├── login/page.tsx
│   └── signup/page.tsx
├── (app)/
│   ├── dashboard/page.tsx
│   ├── review/
│   │   ├── new/page.tsx              — upload + custom term addition
│   │   └── [contractId]/page.tsx     — results: PDF viewer + key terms + chat
│   └── layout.tsx                    — auth guard via middleware
├── api/
│   ├── upload/route.ts               — pdf-parse → store contract_text → Storage upload (non-blocking)
│   ├── process/route.ts              — read contract_text → Claude 3.5 Sonnet extraction → write key_terms
│   └── chat/route.ts                 — read contract_text + history → Claude 3.5 Sonnet → write chat_messages
└── middleware.ts                     — Supabase session refresh + protect (app) routes
```

### API Route Responsibilities

| Route | Input | Output | Key Logic |
|---|---|---|---|
| `POST /api/upload` | PDF file (multipart) + `contract_type` | `{ contractId, status }` | pdf-parse → `contract_text` → DB insert → Storage upload (non-blocking) → return contractId |
| `POST /api/process` | `{ contractId }` | `{ keyTerms[] }` | Read `contract_text` from DB → build few-shot prompt → Claude 3.5 Sonnet JSON mode → parse → write `key_terms` → set `status = completed` |
| `POST /api/chat` | `{ contractId, message }` | `{ response, pageReference }` | Fetch `contract_text` + message history → Claude 3.5 Sonnet → write to `chat_messages` → return response |

### Model Configuration

```ts
// Extraction
{
  model: "gpt-40-mini",   
  
}

// Chat
{
  model: "gpt-40-mini",   
}
```

### Extraction Output Schema

```ts
type KeyTerm = {
  term_name: string;
  value: string;
  page_number: number;        // 1-indexed
  confidence_score: number;   // 0.0–1.0
  source_sentence: string;    // verbatim sentence used for extraction
}
```

### Key Libraries

| Library | Purpose |
|---|---|
| `pdf-parse` | Server-sid
e text extraction from PDF
 binary |
| `openai` | OpenAI SDK —
structured JSON output + c
hat completions |

| `@supabase/ssr` | Server
-side Supabase client for
Next.js App Router |
| `react-pdf` | PDF.js wra
pper for in-browser PDF re
ndering |
| `zod` | Runtime schema v
alidation on Claude 3.5 So
nnet JSON output before DB
 write |

---

## 15. Feature-Wise Build Plan

| Phase | Features | Exit Criteria | Weeks |
|---|---|---|---|
| **v0.1 — Foundation** | Supabase project setup: all tables + RLS + Storage bucket via SQL (single paste-and-run `database.sql`) · Next.js 14 scaffold with App Router · landing page (static) · email/password auth · empty dashboard with auth guard | Auth works end-to-end; `database.sql` runs without errors; RLS verified via test accounts | 1–2 |
| **v0.2 — Core Review** | PDF upload screen with contract type selector · `pdf-parse` server-side text extraction + `[PAGE N]` markers stored in DB · Storage upload (non-blocking) · `POST /api/process` calling Claude 3.5 Sonnet · key terms panel (name / value / page / confidence) · confidence warnings (⚠️ for < 70%) · results stored in Supabase | End-to-end upload → extract → display works; F1 ≥ 82% on 10-contract smoke test; P95 latency ≤ 45s | 3–5 |
| **v0.3 — Enriched UX** | Pre-processing preview showing which standard terms will be extracted · custom key term addition (up to 5, "Custom" badge in results) · inline PDF viewer (PDF.js via `react-pdf`) · click-to-navigate from key term panel to PDF page · expandable source sentence tooltip per term · text viewer fallback when Storage unavailable | All P0 acceptance criteria met; custom terms appear in extraction with same data structure | 6–8 |
| **v0.4 — Chat & History** | `POST /api/chat` with full-context grounding + mandatory page citation · persistent chat sessions in Supabase · populated dashboard (sortable contract list with status) · inline key term editing (original preserved in `term_corrections`) · "Edited" badge · LLM timeout error state with retry CTA | Chat responds only from document; history persists on re-login; dashboard loads correctly for 10+ contracts | 9–11 |
| **v1.0 — Launch** | Feedback submission (thumbs up/down + comment → `user_feedback`) · e2e performance optimisation (target ≤ 30s P95) · full security audit (RLS cross-user test, signed URL expiry, prompt injection surface) · WCAG 2.1 AA review · rate limiting on `/api/process` and `/api/chat` · onboarding tooltip overlay for first-time users · legal disclaimer approved | F1 ≥ 88% NDA / 85% MSA · latency ≤ 30s P95 · security audit passed · DPA with Openaiconfirmed · Supabase Pro provisioned | 12–14 |
| **v1.1 — Post-Launch** | Export key terms to CSV and PDF summary report · batch upload (up to 5 contracts, processed sequentially) · dashboard analytics (contracts reviewed per month chart, correction rate trend) | Export downloads correctly in < 5s; batch processing completes without timeout | 15–18 |
| **v1.2 — Growth** | Scanned PDF support via OCR (AWS Textract) · contract comparison view (side-by-side key terms for 2 contracts) · non-US/non-UK few-shot examples (jurisdiction segmentation from v1.1 data) | OCR extracts text from image PDFs with ≥ 90% fidelity on test set | 19–24 |

### Cross-Phase Dependencies

| Dependency | Required Before |
|---|---|
| OpenaiAPI access approved | v0.2 development starts |
| 30 NDA + 20 MSA contracts labelled by legal SME | v0.2 eval suite set up |
| Supabase Pro plan provisioned | v1.0 launch |
| Legal review of "not legal advice" disclaimer | v1.0 launch |
| GDPR DPA with Openaiconfirmed | First EU user onboarded |
| Custom term performance tested at 10–20 terms | v1.1 cap decision |