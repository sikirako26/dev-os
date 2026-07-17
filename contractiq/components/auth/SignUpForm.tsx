'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { createBrowserClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { InlineError } from '@/components/ui/InlineError'

const AUTH_TIMEOUT_MS = 10_000
const MIN_PASSWORD_LENGTH = 8

export function SignUpForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'pending' | 'timeout'>('idle')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
      return
    }

    setStatus('pending')
    const supabase = createBrowserClient()
    const timeoutId = setTimeout(() => setStatus('timeout'), AUTH_TIMEOUT_MS)

    const { error: signUpError } = await supabase.auth.signUp({ email, password })
    clearTimeout(timeoutId)

    if (signUpError) {
      setError(signUpError.message)
      setStatus('idle')
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  const pending = status === 'pending'

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="text-body-sm font-medium text-grey-500">
          Email
        </label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="password" className="text-body-sm font-medium text-grey-500">
          Password
        </label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      {error && <InlineError message={error} />}
      {status === 'timeout' && (
        <InlineError message="This is taking longer than expected. Please try again." />
      )}

      <Button type="submit" loading={pending} disabled={pending} className="w-full">
        {pending ? 'Creating account…' : 'Get started free'}
      </Button>
    </form>
  )
}
