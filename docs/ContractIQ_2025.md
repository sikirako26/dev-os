# ContractIQ — PRD

**Version:** 1.0 | **Date:** July 3, 2026 | **Status:** Draft
**Scope:** NDA + MSA | **Stack:** Next.js 14 · Supabase · Claude 3.5 Sonnet

---

## Table of Contents

1. [Problem (AI-Specific)](#1-problem-ai-specific)
2. [User](#2-user)
3. [Core Metric](#3-core-metric)
4. [MVP Features](#4-mvp-features)
5. [Constraints](#5-constraints)
6. [Pricing](#6-pricing)

---

## 1. Problem (AI-Specific)

SMBs and freelancers sign NDAs and MSAs without understanding what they're agreeing to. Manual review takes 90–120 minutes and $250–$500/hr in lawyer time. Rule-based extraction fails — a single clause like "confidentiality obligation" appears in 50+ structurally different phrasings across law firms. No regex can cover that surface area.

LLMs are the right tool here: Claude 3.5 Sonnet reads legal prose in context, extracts the precise value of each term, and attributes it to a page number — all in one inference pass, no training data required per law firm. Generic AI chat tools (ChatGPT) produce unstructured summaries with no page reference, no confidence score, and no schema. ContractIQ wraps the LLM in a structured workflow that produces machine-readable, auditable, user-correctable output.

**Why this is defensible:**

| Moat | Detail |
|---|---|
| Contract-type specificity | Term schema purpose-built for NDA + MSA — extracts the 20–30 terms that matter |
| Confidence scoring | Per-term confidence visible to users; < 70% triggers "I don't know" in chat |
| Feedback loop | User corrections feed prompt improvement — proprietary signal competitors can't buy |
| Grounded chat | All answers come from the uploaded document only, with mandatory page citations |

---

## 2. User

**Primary — Founder / Ops Lead**

| Attribute | Detail |
|---|---|
| Role | Founder, COO, Procurement Manager — 5–250 employees, no in-house legal |
| Behaviour | Signs 5–15 contracts/month; Googles clauses or pays $250–$500/hr for ad-hoc review |
| Pain | 90–120 min per contract; misses auto-renewal, liability caps, IP assignment |
| Journey | Receive contract → skim → Google → lawyer call ($500) → sign anyway. ContractIQ replaces steps 3–5 in < 15 min |

**Secondary — Freelancer / Consultant**

| Attribute | Detail |
|---|---|
| Role | Designer, developer, consultant receiving client MSAs |
| Behaviour | Signs 1–4 MSAs/month; can't afford legal review for a $3k project |
| Pain | No tool tells them which clauses are non-standard or risky before they sign |

---

## 3. Core Metric

**North Star:** Time from upload → completed key-term review
**Baseline:** 90 minutes (manual) → **Target:** ≤ 15 minutes

| Metric | Target |
|---|---|
| Key-term extraction F1 | ≥ 88% (NDA) / ≥ 85% (MSA) |
| P95 extraction latency | ≤ 30s for ≤ 20-page contracts |
| User correction rate | ≤ 12% of extracted terms |
| Chat groundedness | ≥ 95% of answers cite a valid source |
| 30-day retention | ≥ 45% |
| NPS | ≥ 40 |

---

## 4. MVP Features

### P0 — Must Ship

| Feature | What It Does |
|---|---|
| Auth | Email/password sign-up + sign-in via Supabase; session persists; protected routes |
| PDF Upload | Drag-and-drop PDF (≤ 10 MB, ≤ 20 pages); server-side text extraction with `[PAGE N]` markers stored in DB; AI pipeline runs from stored text — never re-downloads the file |
| Contract Type Selection | User picks NDA or MSA; drives which term schema is sent to the LLM |
| Key Term Extraction | Claude 3.5 Sonnet extracts: name · value · page number · confidence score · source sentence for each standard term |
| Confidence Warnings | ≥ 80% green · 70–79% amber · < 70% red + ⚠️; chat auto-responds "I don't know" for terms below 70% |
| Custom Terms | Up to 5 user-defined terms added before processing; appear in results with "Custom" badge |
| Results Page | Two-panel: left = PDF viewer (PDF.js) with term highlights; right = key terms panel with click-to-page navigation |
| Legal Disclaimer | "Not legal advice. Verify critical terms with a qualified lawyer." — pinned, non-dismissible |

### P1 — Target v1.0

| Feature | What It Does |
|---|---|
| Chat with Contract | GPT-powered Q&A; full contract text as context; every response must include `[Page X]` citation; "I don't know" when answer not in document |
| Persistent Chat History | Chat messages stored in Supabase; reload contract = prior session resumes |
| Dashboard | Sortable contract history (name / type / date / status); empty state for new users |
| Inline Editing | Edit any extracted term; original AI value preserved in DB for feedback loop |
| Text Viewer Fallback | When PDF Storage unavailable, renders `[PAGE N]` text sections — same navigation behaviour as PDF viewer |

### P2 — Post-Launch

| Feature | What It Does |
|---|---|
| Export | Download key terms as CSV or formatted PDF summary |
| Feedback | Thumbs up/down + comment per review; stored for prompt improvement |

---

## 5. Constraints

### AI — MUST

- All chat answers grounded in the uploaded document only
- Every answer includes a `[Page X]` citation — no citation = response rejected
- Confidence < 70% → respond "I don't know based on this document"
- Cost ≤ $0.10 per chat question

### AI — MUST NOT

- Answer from general legal training data when not grounded in the document
- Return a response without a page citation
- Speculate or guess on terms not found in the document
- Answer general legal questions outside this specific contract

### Product

- Text-layer PDFs only, ≤ 10 MB, ≤ 20 pages (scanned PDFs rejected with clear error)
- English-language contracts, US/UK law only at launch
- LLM API key server-side only — never exposed to the client
- No training on user contract data; GDPR: user data deletion on request
- 90-day PDF retention, user-deletable at any time

---

## 6. Pricing

**Model:** Claude 3.5 Sonnet · **Budget:** $0.10/question · **Baseline:** 5 questions/deal/month · **Max:** $0.50/deal/month

| Plan | Price | Includes | Target User |
|---|---|---|---|
| Free Trial | $0 / 14 days | 5 analyses · full features | All new users |
| Starter | $19/month | 10 analyses + 50 chat questions/month | Freelancers, early founders |
| Growth | $49/month | 40 analyses + 200 questions/month · export | SMB ops managers |
| Pro | $129/month | Unlimited analyses + questions · 5-seat team workspace | Legal ops, agencies |

**Unit economics at 500 active users (~2,000 contracts/month):**

| Item | Monthly Cost |
|---|---|
| Claude 3.5 Sonnet — extraction | $300 |
| Claude 3.5 Sonnet — chat | $1,000 |
| Supabase Pro + Vercel + monitoring | $55 |
| **Total** | **~$1,355/mo** |

Cost per active user: **$2.71/month**. At $19/mo Starter, gross margin is strong at scale.
**Value anchor:** *"$19/month = less than 5 minutes of lawyer time — 10 full contract reviews included."*