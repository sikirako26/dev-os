import { AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export function InlineError({ message, className }: { message: string; className?: string }) {
  if (!message) return null
  return (
    <div
      role="alert"
      className={cn(
        'flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-body-sm text-red-700',
        className
      )}
    >
      <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  )
}
