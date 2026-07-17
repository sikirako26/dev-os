import { NextResponse, type NextRequest } from 'next/server'
import { createMiddlewareClient } from '@/lib/supabase/middleware'

const PUBLIC_PATHS = ['/', '/sign-in', '/sign-up']
const PUBLIC_API_PATHS = ['/api/auth/login', '/api/auth/logout']

export async function middleware(request: NextRequest) {
  const { supabase, response } = createMiddlewareClient(request)
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const path = request.nextUrl.pathname
  const isApi = path.startsWith('/api/')
  const isPublic = PUBLIC_PATHS.includes(path) || PUBLIC_API_PATHS.includes(path)

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

  if (session && (path === '/sign-in' || path === '/sign-up')) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
