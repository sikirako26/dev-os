# ContractIQ — Security Plan

Security foundation review of the `contractiq/` app (Next.js 14 App Router + Supabase + OpenAI). This documents every issue found during the audit, the fix applied, and what remains for the team to do manually in Supabase/hosting.

---

## 1. Issues Found & Fixed

| # | Issue | Risk | Fix |
|---|---|---|---|
| 1 | No rate limiting on any endpoint | Cost abuse — unlimited OpenAI calls (extraction, chat) and unlimited uploads per user | Added `rate_limit_events` table + `lib/security/rateLimiter.ts` (sliding window, service-role only). Wired into upload (20/day), process (5/hour), chat (30/min) |
| 2 | Contract text and chat messages sent to the LLM with no injection defense | A malicious PDF or chat message could try to override the system prompt, exfiltrate the prompt/env vars, or hijack the assistant's behavior | Added `lib/security/promptInjectionGuard.ts`. Chat messages are rejected (`400 prompt_injection`) before any AI call if they match known injection patterns. Contract text (attacker-controlled via upload) is wrapped in explicit `wrapUntrustedDocument()` delimiters in both the extraction and chat prompts, instructing the model to treat it as data only |
| 3 | File upload trusted only the client-supplied `Content-Type` header | Trivially spoofable — a renamed `.exe` sent with `Content-Type: application/pdf` would pass the old check | Added `lib/security/inputValidator.ts` → `validateFileUpload()`: extension blocklist → extension allowlist → MIME type → size, checked in that order before any file processing |
| 4 | Every API route re-implemented its own auth check and had no explicit per-user ownership check on contracts/terms — protection relied entirely on Postgres RLS | Defense-in-depth gap: if RLS were ever misconfigured or a route accidentally used the admin client, cross-user data access (IDOR) would be silently possible | Added `lib/security/authGuard.ts` (`requireAuth()`) and `lib/security/chatSecurity.ts` (`verifyContractOwnership`, `verifySessionOwnership`, `verifyKeyTermOwnership`). All contract/chat/key-term/feedback/custom-term routes now explicitly filter by `user_id` in application code, in addition to RLS |
| 5 | Upload storage path had an extra `contracts/` prefix (`contracts/{user_id}/{contract_id}/{file}`) | The bucket is already named `contracts`, so the storage RLS policy (`storage.foldername(name)[1] = auth.uid()`) was checking the literal string `"contracts"` against the user's UUID — always false. Every upload silently failed to persist to storage (`file_path` was always `null`), so the PDF viewer feature never actually worked | Fixed the object key to `{user_id}/{contract_id}/{filename}`, matching the RLS policy and the convention documented in `database.sql`. Also sanitized `file.name` to strip `/`/`\` before building the key |
| 6 | Login/logout ran entirely client-side via `supabase.auth.signInWithPassword()` / `signOut()` | Not exploitable on its own (Supabase's `@supabase/ssr` cookies are shared client/server), but left no server-side seam for future auth-specific controls (logging, rate limiting, MFA gating) and diverged from the security-foundation convention | Added `app/api/auth/login/route.ts` and `app/api/auth/logout/route.ts`. `SignInForm.tsx` and `AppNav.tsx` now call these routes instead of the SDK directly. Exempted both paths from the auth-required check in `middleware.ts` (a session obviously can't exist yet when logging in) |
| 7 | Several routes returned `400`/`413`/`415` for invalid input instead of `422` | Minor inconsistency, not a vulnerability | Standardized validation failures to `422` per the security-foundation convention |
| 8 | `MAX_FILE_BYTES`/`MAX_PAGES`/`MAX_TOKENS`/`MAX_MESSAGE_LENGTH`/chat history limit were duplicated or hardcoded per file | Drift risk (a future change to one limit wouldn't propagate) | Centralized in `lib/security/tokenLimiter.ts`; `MAX_CHAT_HISTORY` is now env-configurable (`.env.example`, default 100) |

---

## 2. What Was Already Correct (no change needed)

- **RLS policies** in `database.sql` are complete, correctly scoped (`auth.uid() = user_id`, or joined through the parent contract), and enabled on every table.
- **Storage bucket** is private (`public: false`) with per-user RLS on `storage.objects`, and the client only ever requests short-lived (1-hour) signed URLs — never a public URL.
- **Secrets** (`SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`) are server-only, not `NEXT_PUBLIC_`-prefixed, and `contractiq/.env.local` is covered by the root `.gitignore` (verified with `git check-ignore`).
- **Middleware** already protects every route except `/`, `/sign-in`, `/sign-up` (a superset of the routes the security-foundation spec calls out), redirecting unauthenticated users and bouncing authenticated users away from the auth pages.
- **Zod validation** already existed on every route; it's now re-exported through `lib/security/inputValidator.ts` as a single import surface rather than duplicated.

---

## 3. Files Created

```
lib/supabase/admin.ts                  createAdminClient() — service-role client for rate limiting only
lib/security/authGuard.ts              requireAuth()
lib/security/rateLimiter.ts            checkRateLimit(), rateLimitedResponse(), RATE_LIMITS
lib/security/promptInjectionGuard.ts   sanitizeForLLM(), wrapUntrustedDocument()
lib/security/tokenLimiter.ts           centralized size/length/history constants
lib/security/chatSecurity.ts           verifyContractOwnership(), verifySessionOwnership(), verifyKeyTermOwnership()
lib/security/inputValidator.ts         validateFileUpload() + re-exported Zod schemas
app/api/auth/login/route.ts            server-side sign-in
app/api/auth/logout/route.ts           server-side sign-out
supabase/rls-policies.sql              incremental SQL (rate_limit_events + RLS re-assertion)
.env.example                           documents all required env vars, including MAX_CHAT_HISTORY
docs/security/security-plan.md         this document
```

## 4. Files Modified

```
middleware.ts                                   exempt /api/auth/login and /api/auth/logout from the session check
database.sql                                     added rate_limit_events table (mirrors supabase/rls-policies.sql)
lib/validation/uploadSchema.ts                    now imports limits from lib/security/tokenLimiter.ts
lib/openai/buildExtractionPrompt.ts               wraps contract text with wrapUntrustedDocument()
lib/openai/buildChatPrompt.ts                     wraps contract text with wrapUntrustedDocument()
app/api/contracts/upload/route.ts                 requireAuth, rate limit, validateFileUpload, fixed storage path bug
app/api/contracts/[id]/route.ts                   requireAuth, verifyContractOwnership
app/api/contracts/[id]/process/route.ts           requireAuth, verifyContractOwnership, rate limit
app/api/contracts/[id]/chat/route.ts              requireAuth, verifyContractOwnership, rate limit, sanitizeForLLM
app/api/contracts/[id]/custom-terms/route.ts      requireAuth, verifyContractOwnership
app/api/contracts/[id]/feedback/route.ts          requireAuth, verifyContractOwnership
app/api/key-terms/[id]/route.ts                   requireAuth, verifyKeyTermOwnership (removed a redundant query)
components/auth/SignInForm.tsx                    calls POST /api/auth/login instead of the SDK directly
components/layout/AppNav.tsx                      calls POST /api/auth/logout instead of the SDK directly
```

---

## 5. SQL To Run

Run `contractiq/supabase/rls-policies.sql` once in the Supabase SQL Editor (idempotent — safe to re-run). It only adds `rate_limit_events`; all other tables already have correct RLS from `database.sql`.

## 6. Environment Variables To Add

Add to `.env.local`:

```
MAX_CHAT_HISTORY=100
```

No other new variables are required — `SUPABASE_SERVICE_ROLE_KEY` was already present and is now consumed by `lib/supabase/admin.ts`.

---

## 7. Outstanding / Manual Items

- **Supabase dashboard**: confirm email verification and password-reset flow are enabled (Authentication → Providers/Templates) — not something SQL or app code controls.
- **Auth brute-force protection**: Supabase's built-in GoTrue rate limits already cover `/auth/v1/token` (login) and `/auth/v1/signup` server-side, regardless of whether the app calls them from the client or a server route. No custom app-level rate limiting was added for login/signup, since `rate_limit_events` is keyed by `user_id` (via `auth.users` FK) and there is no authenticated user yet at login time — building a separate pre-auth (IP/email-keyed) limiter was judged out of scope unless brute-force attempts are actually observed.
- **Existing uploaded contracts**: any contracts uploaded before this fix have `file_path = null` in the database (the storage path bug meant no file was ever actually stored) — their PDF viewer will keep falling back to the text view. Only the extracted `contract_text` was ever persisted for those rows; there is no original file to backfill.
