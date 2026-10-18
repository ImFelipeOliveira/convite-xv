'use client'

import { motion, useReducedMotion } from 'motion/react'

// Gold thread divider (prancha 03, primitive 03; prancha 06): both threads draw outward from the
// centre, then the diamond lands with the seal overshoot. Reduced motion: appears drawn, no movement.
// `initial` never depends on the media query, so the server markup always matches.
const EASE_DOORS = [0.65, 0, 0.35, 1] as const
const EASE_SEAL = [0.34, 1.56, 0.64, 1] as const

export function GemDivider({ delay = 0.3, className }: { delay?: number; className?: string }) {
  const reduced = useReducedMotion() ?? false
  const thread = {
    initial: { pathLength: 0 },
    whileInView: { pathLength: 1 },
    viewport: { once: true },
    transition: reduced ? { duration: 0 } : { duration: 1.1, ease: EASE_DOORS, delay },
  } as const
  return (
    <svg viewBox="0 0 260 24" width="240" height="24" aria-hidden="true" className={className}>
      <motion.path {...thread} d="M116 12 H4" fill="none" stroke="#B8955A" strokeWidth="1" />
      <motion.path {...thread} d="M144 12 H256" fill="none" stroke="#B8955A" strokeWidth="1" />
      <motion.path
        initial={{ scale: 0, rotate: 45 }}
        whileInView={{ scale: 1, rotate: 0 }}
        viewport={{ once: true }}
        transition={reduced ? { duration: 0 } : { duration: 0.6, ease: EASE_SEAL, delay: delay + 0.8 }}
        style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
        d="M130 3 L139 12 L130 21 L121 12 Z"
        fill="none"
        stroke="#A8325E"
        strokeWidth="1"
      />
    </svg>
  )
}
