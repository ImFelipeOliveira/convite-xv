// Shared Tailwind classes for the admin panel: the invite's paper language (Sistema visual) —
// pill buttons, 2px fields with a gold hairline, seal focus ring, Jost UI, 44px touch targets.

const transition =
  'transition-[background-color,border-color,color,box-shadow,transform,opacity] duration-(--dur-micro) ease-(--ease-letter)'

export const focusRing =
  'outline-none focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-wine'

export const inputClass = [
  'min-h-11 w-full rounded-[2px] border border-hairline-strong bg-paper px-3.5 py-2.5 text-base text-wine',
  'placeholder:text-muted/70 hover:border-gold',
  'focus:border-seal focus:shadow-ring-seal focus:outline-none',
  'aria-invalid:border-error disabled:bg-blush/40 disabled:opacity-70',
  transition,
].join(' ')

export const labelClass = 'flex flex-col gap-1.5 text-sm font-medium text-wine'
export const helperClass = 'text-[13px] font-normal leading-snug text-muted'
export const fieldErrorClass = 'text-[13px] font-normal leading-snug text-error'
export const requiredMark = 'text-seal'

const buttonBase = [
  'relative inline-flex min-h-11 select-none items-center justify-center gap-2 whitespace-nowrap rounded-full',
  'text-[15px] font-medium tracking-[.02em]',
  'active:translate-y-px disabled:opacity-55 disabled:active:translate-y-0',
  focusRing,
  transition,
].join(' ')

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'md' | 'sm' | 'icon'

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-seal text-paper shadow-[0_1px_0_rgba(90,33,54,.25)] hover:bg-deep-rose active:bg-wine disabled:hover:bg-seal',
  secondary:
    'border border-seal/70 bg-paper text-seal hover:border-seal hover:bg-blush active:bg-petal/60 disabled:hover:bg-paper',
  ghost: 'text-wine hover:bg-blush active:bg-petal/60 disabled:hover:bg-transparent',
  danger: 'bg-error text-paper hover:bg-[#7F1616] active:bg-[#661111] disabled:hover:bg-error',
}

const sizes: Record<ButtonSize, string> = {
  md: 'px-5 py-2',
  sm: 'px-3.5 py-1.5 text-sm',
  icon: 'size-11 p-0',
}

export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md'): string {
  return `${buttonBase} ${variants[variant]} ${sizes[size]}`
}

export const primaryButtonClass = buttonClass('primary')
export const secondaryButtonClass = buttonClass('secondary')
export const dangerButtonClass = buttonClass('danger')

/** Paper sheet surface (cards, table, panels). */
export const surfaceClass = 'border border-hairline bg-paper shadow-paper'
