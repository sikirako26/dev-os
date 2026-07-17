import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { AppNav } from '@/components/layout/AppNav'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    redirect('/sign-in')
  }

  return (
    <div className="flex min-h-screen flex-col bg-grey-25">
      <AppNav />
      <div className="flex-1">{children}</div>
    </div>
  )
}
