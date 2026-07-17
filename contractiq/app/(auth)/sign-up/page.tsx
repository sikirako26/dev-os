import type { Metadata } from 'next'
import Link from 'next/link'
import { SignUpForm } from '@/components/auth/SignUpForm'

export const metadata: Metadata = { title: 'Get started — ContractIQ' }

export default function SignUpPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-grey-25 px-6 py-24">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-h4 text-grey-900">Get started free</h1>
        <p className="text-body-lg text-grey-500">
          Understand any NDA or MSA in minutes, not hours.
        </p>
      </div>
      <SignUpForm />
      <p className="text-body-sm text-grey-500">
        Already have an account?{' '}
        <Link href="/sign-in" className="font-medium text-blue-500 hover:text-blue-600">
          Sign in
        </Link>
      </p>
    </main>
  )
}
