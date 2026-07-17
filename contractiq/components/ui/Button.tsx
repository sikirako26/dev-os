import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
}

const variantClasses: Record<Variant, string> = {
  primary: 'bg-blue-500 text-white hover:bg-blue-600 disabled:bg-grey-100 disabled:text-grey-400',
  secondary:
    'bg-white text-grey-900 border border-grey-100 hover:bg-grey-50 hover:border-grey-200 disabled:bg-grey-25 disabled:text-grey-400',
  ghost: 'bg-transparent text-grey-900 hover:bg-grey-50 disabled:text-grey-400',
  danger: 'bg-red-500 text-white hover:bg-red-600 disabled:bg-grey-100 disabled:text-grey-400',
}

const sizeClasses: Record<Size, string> = {
  sm: 'h-8 px-3 text-body-sm',
  md: 'h-10 px-4 text-body-lg',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors duration-100 ease-out focus-ring disabled:cursor-not-allowed',
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        {...props}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {children}
      </button>
    )
  }
)
Button.displayName = 'Button'
