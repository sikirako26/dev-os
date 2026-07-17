import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          'h-10 w-full rounded-md border bg-white px-3 text-body-lg text-grey-900 placeholder:text-grey-300 transition-colors duration-100 ease-out focus:outline-none focus:ring-2 focus:ring-offset-0 disabled:bg-grey-25 disabled:text-grey-400',
          error
            ? 'border-red-500 focus:ring-red-200'
            : 'border-grey-100 focus:border-blue-500 focus:ring-blue-100',
          className
        )}
        {...props}
      />
    )
  }
)
Input.displayName = 'Input'
