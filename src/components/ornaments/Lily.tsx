import { useId, type CSSProperties } from 'react'
import './ornaments.css'

// Pink lily ported from the Hero board (prancha 05): three narrow back tepals,
// three wide front tepals with vein and spots, then the stamens.
const NARROW_TEPAL =
  'M120 130 C108 104 104 70 114 40 C116 34 118 30 120 28 C123 33 126 40 127 48 C133 76 130 106 120 130 Z'
const WIDE_TEPAL =
  'M120 130 C98 106 90 64 108 30 C112 22 117 18 120 16 C125 20 131 28 134 38 C146 70 138 106 120 130 Z'
const VEIN = 'M120 126 C118 96 117 60 120 24'
const FILAMENTS =
  'M120 130 Q132 108 146 85 M120 130 Q142 122 166 130 M120 130 Q136 150 145 173 M120 130 Q104 150 98 168 M120 130 Q94 124 68 130 M120 130 Q104 108 96 88'
const ANTHERS: [number, number][] = [
  [146, 85],
  [166, 130],
  [145, 173],
  [98, 168],
  [68, 130],
  [96, 88],
]
const WIDE_SPOTS: [number, number, number][][] = [
  [
    [116, 100, 1.7],
    [124, 92, 1.4],
    [125, 106, 1.5],
  ],
  [
    [116, 100, 1.7],
    [119, 110, 1.2],
  ],
  [
    [117, 98, 1.5],
    [123, 104, 1.6],
  ],
]

const STAGGER_S = 0.08
const STAMENS_AFTER_S = 0.8

function delayStyle(seconds: number | undefined): CSSProperties | undefined {
  return seconds === undefined ? undefined : { animationDelay: `${Math.round(seconds * 1000)}ms` }
}

export function LilyGradients({ id }: { id: string }) {
  return (
    <>
      <linearGradient id={`${id}-w`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#FDEEF2" />
        <stop offset=".55" stopColor="#F3AFC4" />
        <stop offset="1" stopColor="#D2507D" />
      </linearGradient>
      <linearGradient id={`${id}-n`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#FBE3EA" />
        <stop offset=".6" stopColor="#EE9DB6" />
        <stop offset="1" stopColor="#C8466F" />
      </linearGradient>
    </>
  )
}

/**
 * The lily's shapes in a 240×240 user space, centred at (120,130). Each tepal group
 * carries the `petal` class so a parent (Lily `animate`, or the Opening stage) can bloom it.
 * `delay` (seconds) staggers the tepals by 80 ms and lands the stamens last.
 */
export function LilyGlyph({ id, delay }: { id: string; delay?: number }) {
  const at = (i: number) => (delay === undefined ? undefined : delay + i * STAGGER_S)
  return (
    <>
      {[60, 180, 300].map((angle, i) => (
        <g key={`n${angle}`} transform={`rotate(${angle} 120 130)`}>
          <g className="petal" style={delayStyle(at(i))}>
            <path fill={`url(#${id}-n)`} d={NARROW_TEPAL} />
          </g>
        </g>
      ))}
      {[0, 120, 240].map((angle, i) => (
        <g key={`w${angle}`} transform={`rotate(${angle} 120 130)`}>
          <g className="petal" style={delayStyle(at(i + 3))}>
            <path fill={`url(#${id}-w)`} d={WIDE_TEPAL} />
            <path fill="none" stroke="#C9406E" strokeOpacity=".45" strokeWidth="1" d={VEIN} />
            {WIDE_SPOTS[i].map(([cx, cy, r]) => (
              <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill="#9E2A55" />
            ))}
          </g>
        </g>
      ))}
      <g className="petal" style={delayStyle(delay === undefined ? undefined : delay + STAMENS_AFTER_S)}>
        <circle cx="120" cy="130" r="9" fill="#F4D89A" fillOpacity=".6" />
        <path fill="none" stroke="#E3C891" strokeWidth="1.4" d={FILAMENTS} />
        {ANTHERS.map(([cx, cy]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="3.2" fill="#A4552F" />
        ))}
      </g>
    </>
  )
}

export function Lily({
  className,
  animate = false,
  delay,
  size = 240,
  style,
}: {
  className?: string
  animate?: boolean
  delay?: number
  size?: number
  style?: CSSProperties
}) {
  const id = useId()
  return (
    <svg
      viewBox="0 0 240 240"
      width={size}
      height={size}
      aria-hidden="true"
      className={[animate ? 'lily-bloom' : null, className].filter(Boolean).join(' ') || undefined}
      style={style}
    >
      <defs>
        <LilyGradients id={id} />
      </defs>
      <LilyGlyph id={id} delay={delay ?? (animate ? 0 : undefined)} />
    </svg>
  )
}
