import { useId, type CSSProperties } from 'react'

const SEAL_OUTLINE =
  'M80 8 C98 6 112 14 124 22 C138 30 150 44 152 62 C156 78 154 96 146 110 C140 124 128 140 110 148 C96 154 78 156 62 150 C44 146 28 134 18 118 C8 102 6 84 10 66 C12 48 24 32 38 22 C50 12 64 8 80 8 Z'

const scriptFont: CSSProperties = { fontFamily: 'var(--font-pinyon), cursive' }

/** Wine wax seal stamped with the monogram, ported from the Opening board (prancha 04). Decorative. */
export function WaxSeal({
  letter = 'I',
  size = 120,
  className,
}: {
  letter?: string
  size?: number
  className?: string
}) {
  const id = useId()
  return (
    <svg viewBox="0 0 160 160" width={size} height={size} aria-hidden="true" className={className}>
      <defs>
        <radialGradient id={id} cx=".4" cy=".35" r=".75">
          <stop offset="0" stopColor="#D0588A" />
          <stop offset=".6" stopColor="#A8325E" />
          <stop offset="1" stopColor="#7A1F43" />
        </radialGradient>
      </defs>
      <path fill={`url(#${id})`} d={SEAL_OUTLINE} />
      <circle cx="80" cy="80" r="50" fill="none" stroke="#7A1F43" strokeWidth="3" strokeOpacity=".55" />
      <circle cx="80" cy="80" r="47" fill="none" stroke="#E58AAE" strokeWidth="1" strokeOpacity=".45" />
      <text x="81" y="105" textAnchor="middle" fontSize="66" fill="#E58AAE" fillOpacity=".5" style={scriptFont}>
        {letter}
      </text>
      <text x="80" y="104" textAnchor="middle" fontSize="66" fill="#7A1F43" style={scriptFont}>
        {letter}
      </text>
    </svg>
  )
}
