import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { SignInForm } from '@/components/auth/SignInForm'

export const metadata: Metadata = { title: 'Sign in — ContractIQ' }

export default function SignInPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-grey-25 px-6 py-24">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-h4 text-grey-900">Welcome back</h1>
        <p className="text-body-lg text-grey-500">Sign in to review your contracts.</p>
      </div>
      <Suspense>
        <SignInForm />
      </Suspense>
      <p className="text-body-sm text-grey-500">
        Don&apos;t have an account?{' '}
        <Link href="/sign-up" className="font-medium text-blue-500 hover:text-blue-600">
          Get started free
        </Link>
      </p>
    </main>
  )
}
