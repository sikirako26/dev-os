# Spec: Authentication & Session Management

**Maps to:** PRD US-001, FR-01 · Engineering doc §4 Flow 1/2, §6, §11
**Primary source files:** `app/(auth)/sign-in/page.tsx`, `app/(auth)/sign-up/page.tsx`, `middleware.ts`, `lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/supabase/middleware.ts`, `hooks/useSession.ts`

---

## 1. User Flow

**Sign up:**
1. Visitor on `(marketing)/page.tsx` clicks "Get Started Free".
2. `<SignUpForm />` renders (modal or `/sign-up` route) collecting email + password.
3. Client calls `supabase.auth.signUp({ email, password })`.
4. Supabase creates `auth.users` row, sends verification email (if email confirmation is enabled in the Supabase project).
5. On success, redirect to `/dashboard`. Dashboard renders its empty state (0 contracts).
6. On failure, inline error rendered verbatim from Supabase (e.g. "User already registered").

**Sign in:**
1. Visitor on `/sign-in` submits email + password.
2. Client calls `supabase.auth.signInWithPassword({ email, password })`.
3. On success, Supabase issues a session (JWT + refresh token) stored in cookies via `@supabase/ssr`.
4. Redirect to `/dashboard` (or the originally intended route — see Edge Cases) within 10s.
5. On failure, inline error, no redirect.

**Sign out:**
1. User triggers sign-out action (nav menu).
2. Client calls `supabase.auth.signOut()`.
3. Session cookie cleared; redirect to `(marketing)/page.tsx`.

**Route protection:**
1. `middleware.ts` runs on every request matching `(app)/**` and `/api/**` (excluding auth callback routes).
2. It reads the Supabase session cookie via `createMiddlewareClient`.
3. No valid session → redirect to `/sign-in?redirect=<original-path>` for page routes, or return `401 { error: { code: "unauthenticated", message: "Sign in required" } }` for API routes.

---

## 2. DB Schema Touched

None beyond Supabase-managed `auth.users`. No custom `profiles` table at MVP — no additional user attributes are required (per engineering-doc.md §5A).

## 3. DB Tasks

- Enable the **Email** provider in Supabase Auth settings (Dashboard: Authentication → Providers → Email). This is a project-config step, not SQL — call it out explicitly to the user during setup since it cannot be scripted via `supabase-schema.sql`.
- Confirm "Confirm email" setting matches product decision (MVP assumes confirmation is OFF for faster onboarding, per PRD success metric "auth completes ≤10s" — email confirmation would block that). If the user wants email confirmation enabled, the ≤10s completion metric applies to the sign-in step only, not first-time verification.

## 4. API Routes

None. Auth is handled entirely by the Supabase JS client from the frontend (no `/api/auth/*` routes), per engineering-doc.md §9 note.

`middleware.ts` behavior (not a route, but the enforcement layer):

```ts
// middleware.ts
import { createMiddlewareClient } from './lib/supabase/middleware'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_PATHS = ['/sign-in', '/sign-up', '/']

export async function middleware(request: NextRequest) {
  const { supabase, response } = createMiddlewareClient(request)
  const { data: { session } } = await supabase.auth.getSession()

  const path = request.nextUrl.pathname
  const isApi = path.startsWith('/api/')
  const isPublic = PUBLIC_PATHS.includes(path)

  if (!session && !isPublic) {
    if (isApi) {
      return NextResponse.json(
        { error: { code: 'unauthenticated', message: 'Sign in required' } },
        { status: 401 }
      )
    }
    const redirectUrl = new URL('/sign-in', request.url)
    redirectUrl.searchParams.set('redirect', path)
    return NextResponse.redirect(redirectUrl)
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

## 5. State Management

- Supabase session is the source of truth. No Zustand or TanStack Query for auth state itself.
- `hooks/useSession.ts` wraps `supabase.auth.onAuthStateChange` and exposes `{ user, session, loading }` to client components that need reactive auth state (e.g. nav bar).
- Server components read the session directly via `lib/supabase/server.ts`'s `createServerClient` — no hook needed there.

```ts
// hooks/useSession.ts
'use client'
import { useEffect, useState } from 'react'
import { createBrowserClient } from '@/lib/supabase/client'
import type { Session, User } from '@supabase/supabase-js'

export function useSession() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createBrowserClient()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => listener.subscription.unsubscribe()
  }, [])

  return { session, user: session?.user ?? null, loading }
}
```

## 6. Component Spec

- **`<SignUpForm />`** — email + password fields, client-side format validation (email regex, password ≥ 8 chars), submit button disables + shows spinner while pending, surfaces Supabase error messages verbatim under the field.
- **`<SignInForm />`** — same shape as sign-up minus confirmation field.
- **`<AuthGuardLayout />`** — server component wrapping `(app)/layout.tsx`; reads session server-side, redirects if absent (defense in depth alongside middleware).

## 7. Design Notes

- Forms use `docs/design.md` form primitives (input, label, button).
- Error state uses `Token colors/Text/red` (danger token, primitive Red ★500 `#D13438`), never raw `red`/`#f00`.
- Spinner shown past 3s; if no response by 10s, replace spinner with a timeout error + "Try again" button (see Edge Cases).

## 8. Edge Cases

| Case | Behavior |
|---|---|
| Invalid credentials | Inline error "Invalid login credentials" (Supabase's message), no generic fallback |
| Auth call exceeds 3s | Show spinner on submit button |
| Auth call exceeds 10s | Replace spinner with timeout error + "Try again"; do not leave the button permanently disabled |
| Session expires mid-session (long-idle tab) | Next API call returns 401 → frontend interceptor (TanStack Query error handler) redirects to `/sign-in?redirect=<current-path>` |
| User navigates directly to a protected `(app)` URL while signed out | Middleware redirects to `/sign-in?redirect=<path>`; after successful sign-in, redirect back to that path |
| Duplicate sign-up (existing email) | Supabase returns "User already registered" — surfaced verbatim, with a "Sign in instead" link |
| Sign-out while an API request is in-flight | In-flight request completes or 401s naturally; no special handling required (RLS/session check happens per-request) |

## 9. Acceptance Criteria

- [ ] Sign-up creates an `auth.users` row and lands the user on `/dashboard` with the empty state.
- [ ] Sign-in completes in ≤ 10s P95, redirecting to `/dashboard` (or `redirect` param target).
- [ ] Invalid credentials show an inline, specific error — never a blank state or generic failure.
- [ ] All `(app)/**` and `/api/**` routes (except `/`, `/sign-in`, `/sign-up`) are unreachable without a valid session.
- [ ] Expired session triggers redirect-to-sign-in with the original destination preserved.
