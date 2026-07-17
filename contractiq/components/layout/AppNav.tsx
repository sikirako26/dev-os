'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FileText } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useSession } from '@/hooks/useSession'

export function AppNav() {
  const router = useRouter()
  const { user } = useSession()

  async function handleSignOut() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/')
    router.refresh()
  }

  return (
    <header className="flex h-16 items-center justify-between border-b border-grey-100 bg-white px-6">
      <Link href="/dashboard" className="flex items-center gap-2 text-grey-900">
        <FileText className="h-5 w-5 text-blue-500" aria-hidden="true" />
        <span className="text-body-lg font-semibold">ContractIQ</span>
      </Link>
      <div className="flex items-center gap-4">
        {user && <span className="text-body-sm text-grey-500">{user.email}</span>}
        <Button variant="ghost" size="sm" onClick={handleSignOut}>
          Sign out
        </Button>
      </div>
    </header>
  )
}
