import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'

const loginRequestSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
})

export async function POST(req: NextRequest) {
  const parsed = loginRequestSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'invalid_request', message: 'Valid email and password are required' } },
      { status: 422 }
    )
  }

  const supabase = createServerClient()
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data)

  if (error || !data.user) {
    return NextResponse.json(
      { error: { code: 'invalid_credentials', message: error?.message ?? 'Invalid email or password' } },
      { status: 401 }
    )
  }

  return NextResponse.json({ user: { id: data.user.id, email: data.user.email } })
}
