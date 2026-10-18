'use client'

import { motion, useReducedMotion } from 'motion/react'
import { FILAMENTS, NARROW_TEPAL, WIDE_TEPAL } from './Lily'

// The lily drawn in gold line on burgundy (Closing, prancha 10): each tepal traces itself
// 100 ms after the previous one, the pink stamens last. Reduced motion: appears drawn at once.
const EASE_DOORS = [0.65, 0, 0.35, 1] as const

const STROKES = [
  { d: NARROW_TEPAL, angle: 60, stroke: '#B8955A', width: 1.6, delay: 0.1 },
  { d: NARROW_TEPAL, angle: 180, stroke: '#B8955A', width: 1.6, delay: 0.2 },
  { d: NARROW_TEPAL, angle: 300, stroke: '#B8955A', width: 1.6, delay: 0.3 },
  { d: WIDE_TEPAL, angle: 0, stroke: '#E3C891', width: 1.8, delay: 0.4 },
  { d: WIDE_TEPAL, angle: 120, stroke: '#E3C891', width: 1.8, delay: 0.5 },
  { d: WIDE_TEPAL, angle: 240, stroke: '#E3C891', width: 1.8, delay: 0.6 },
  { d: FILAMENTS, angle: 0, stroke: '#E07A9C', width: 1.4, delay: 1 },
]

export function LilyOutline({ size = 132, className }: { size?: number; className?: string }) {
  const reduced = useReducedMotion() ?? false
  return (
    <svg viewBox="0 0 240 240" width={size} height={size} aria-hidden="true" className={className}>
      {STROKES.map(({ d, angle, stroke, width, delay }) => (
        <g key={`${angle}-${delay}`} transform={angle ? `rotate(${angle} 120 130)` : undefined}>
          <motion.path
            initial={{ pathLength: 0 }}
            whileInView={{ pathLength: 1 }}
            viewport={{ once: true }}
            transition={reduced ? { duration: 0 } : { duration: 1.8, ease: EASE_DOORS, delay }}
            d={d}
            fill="none"
            stroke={stroke}
            strokeWidth={width}
          />
        </g>
      ))}
    </svg>
  )
}
