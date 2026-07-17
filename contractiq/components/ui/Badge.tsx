import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Tone = 'grey' | 'blue' | 'green' | 'red' | 'yellow' | 'violet'

const toneClasses: Record<Tone, string> = {
  grey: 'bg-grey-50 border-grey-200 text-grey-700',
  blue: 'bg-blue-50 border-blue-200 text-blue-700',
  green: 'bg-green-50 border-green-200 text-green-700',
  red: 'bg-red-50 border-red-200 text-red-700',
  yellow: 'bg-yellow-50 border-yellow-200 text-yellow-800',
  violet: 'bg-violet-50 border-violet-200 text-violet-700',
}

export function Badge({
  tone = 'grey',
  icon,
  children,
  className,
}: {
  tone?: Tone
  icon?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-body-sm font-medium',
        toneClasses[tone],
        className
      )}
    >
      {icon}
      {children}
    </span>
  )
}
