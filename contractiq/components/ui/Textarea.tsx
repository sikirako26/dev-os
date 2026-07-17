import { forwardRef, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          'w-full resize-none rounded-md border border-grey-100 bg-white px-3 py-2 text-body-lg text-grey-900 placeholder:text-grey-300 transition-colors duration-100 ease-out focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-grey-25 disabled:text-grey-400',
          className
        )}
        {...props}
      />
    )
  }
)
Textarea.displayName = 'Textarea'
