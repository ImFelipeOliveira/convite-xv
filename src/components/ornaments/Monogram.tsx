import type { CSSProperties } from 'react'

/** Gold-ringed script monogram (prancha 04/05). Announced as "Monograma I" unless `decorative`. */
export function Monogram({
  letter,
  size = 84,
  decorative = false,
  className,
  style,
}: {
  letter: string
  size?: number
  decorative?: boolean
  className?: string
  style?: CSSProperties
}) {
  const a11y = decorative
    ? ({ 'aria-hidden': true } as const)
    : ({ role: 'img', 'aria-label': `Monograma ${letter}` } as const)
  return (
    <svg viewBox="0 0 132 132" width={size} height={size} className={className} style={style} {...a11y}>
      <circle cx="66" cy="66" r="56" fill="none" stroke="#B8955A" strokeWidth="1" />
      <text
        x="66"
        y="92"
        textAnchor="middle"
        fontSize="76"
        fill="#C25578"
        style={{ fontFamily: 'var(--font-pinyon), cursive' }}
      >
        {letter}
      </text>
    </svg>
  )
}
