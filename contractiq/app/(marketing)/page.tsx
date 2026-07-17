import Link from 'next/link'
import { FileText, ShieldCheck, Clock, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/Button'

const FEATURES = [
  {
    icon: Clock,
    title: 'Minutes, not hours',
    description:
      'Upload an NDA or MSA and get key terms extracted in under 30 seconds — no lawyer on call required.',
  },
  {
    icon: ShieldCheck,
    title: 'Confidence you can verify',
    description:
      'Every term ships with a page citation and a confidence score, so you know exactly what to double-check.',
  },
  {
    icon: MessageSquare,
    title: 'Ask it anything',
    description:
      'Chat with your contract and get answers grounded strictly in the document text, with citations.',
  },
]

export default function MarketingPage() {
  return (
    <main className="flex min-h-screen flex-col bg-white">
      <header className="flex h-16 items-center justify-between border-b border-grey-100 px-6 md:px-28">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-blue-500" aria-hidden="true" />
          <span className="text-body-lg font-semibold text-grey-900">ContractIQ</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/sign-in">
            <Button variant="ghost" size="sm">
              Sign in
            </Button>
          </Link>
          <Link href="/sign-up">
            <Button size="sm">Get started free</Button>
          </Link>
        </div>
      </header>

      <section className="flex flex-col items-center gap-6 px-6 py-24 text-center md:px-28">
        <h1 className="max-w-2xl text-h2 text-grey-900 md:text-h1">
          Understand any contract in minutes
        </h1>
        <p className="max-w-xl text-body-lg text-grey-500">
          ContractIQ reviews NDAs and MSAs for time-pressed founders and freelancers — key terms,
          page citations, and confidence scores, without a lawyer on call.
        </p>
        <Link href="/sign-up">
          <Button size="md">Get started free</Button>
        </Link>
        <p className="text-body-sm text-grey-300">Not legal advice. For informational purposes only.</p>
      </section>

      <section className="flex flex-col gap-10 border-t border-grey-50 px-6 py-16 md:px-28">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="flex flex-col gap-3 rounded-lg border border-grey-100 p-6">
              <feature.icon className="h-6 w-6 text-blue-500" aria-hidden="true" />
              <h2 className="text-body-lg font-semibold text-grey-900">{feature.title}</h2>
              <p className="text-body-sm text-grey-500">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
