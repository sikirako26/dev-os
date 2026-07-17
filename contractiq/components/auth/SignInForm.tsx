'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { InlineError } from '@/components/ui/InlineError'

const AUTH_TIMEOUT_MS = 10_000

export function SignInForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'pending' | 'timeout'>('idle')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setStatus('pending')

    const timeoutId = setTimeout(() => setStatus('timeout'), AUTH_TIMEOUT_MS)

    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    clearTimeout(timeoutId)

    if (!res.ok) {
      const body = await res.json().catch(() => null)
      setError(body?.error?.message ?? 'Invalid email or password')
      setStatus('idle')
      return
    }

    const redirect = searchParams.get('redirect') || '/dashboard'
    router.push(redirect)
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
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      {error && <InlineError message={error} />}
      {status === 'timeout' && (
        <InlineError message="This is taking longer than expected. Please try again." />
      )}

      <Button type="submit" loading={pending} disabled={pending} className="w-full">
        {pending ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  )
}
