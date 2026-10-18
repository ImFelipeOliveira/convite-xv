'use client'

import { motion, useReducedMotion, type Variants } from 'motion/react'
import type { CSSProperties, ReactNode } from 'react'

// Scroll reveal (prancha 03, primitive 11): once 20% of the block is visible, items rise
// --reveal-y (24 px) and fade in over 700 ms, 80 ms apart; from the 7th item on they enter together.
// Reduced motion: no displacement, a 200 ms fade.
const EASE_LETTER = [0.22, 1, 0.36, 1] as const
const STAGGER_S = 0.08
const MAX_STAGGERED = 6
const REVEAL_Y = 24

type Kind = 'up' | 'fade' | 'ink'

const INK_MASK: CSSProperties = {
  WebkitMaskImage: 'linear-gradient(90deg,#000 40%,transparent 60%)',
  maskImage: 'linear-gradient(90deg,#000 40%,transparent 60%)',
  WebkitMaskSize: '250% 100%',
  maskSize: '250% 100%',
  WebkitMaskRepeat: 'no-repeat',
  maskRepeat: 'no-repeat',
}

// `hidden` is the same with or without reduced motion, so the server markup always matches.
function itemVariants(kind: Kind, reduced: boolean, duration: number | undefined): Variants {
  const at = (delay: number | undefined) => (delay === undefined ? {} : { delay })
  const hidden =
    kind === 'ink'
      ? { opacity: 0, WebkitMaskPosition: '100% 0%', maskPosition: '100% 0%' }
      : kind === 'fade'
        ? { opacity: 0 }
        : { opacity: 0, y: REVEAL_Y }
  const settled =
    kind === 'ink'
      ? { opacity: 1, WebkitMaskPosition: '0% 0%', maskPosition: '0% 0%' }
      : kind === 'fade'
        ? { opacity: 1 }
        : { opacity: 1, y: 0 }

  if (reduced) {
    // displacement and mask jump straight to the end; only the opacity fades
    return {
      hidden,
      visible: (delay?: number) => ({
        ...settled,
        transition: { duration: 0, opacity: { duration: 0.2, ease: 'easeOut', ...at(delay) } },
      }),
    }
  }
  const transition =
    kind === 'ink'
      ? { duration: duration ?? 1.3, ease: EASE_LETTER, opacity: { duration: 0.01 } }
      : kind === 'fade'
        ? { duration: duration ?? 1.4, ease: 'easeOut' as const }
        : { duration: duration ?? 0.7, ease: EASE_LETTER }
  return {
    hidden,
    visible: (delay?: number) => ({ ...settled, transition: { ...transition, ...at(delay) } }),
  }
}

const containerVariants: Variants = {
  hidden: {},
  visible: { transition: { delayChildren: (i: number) => Math.min(i, MAX_STAGGERED - 1) * STAGGER_S } },
}

/** Scroll trigger for a block; its RevealItem descendants animate in order when it comes into view. */
export function Reveal({
  children,
  className,
  style,
  id,
  'aria-labelledby': labelledBy,
  as = 'div',
}: {
  children: ReactNode
  className?: string
  style?: CSSProperties
  id?: string
  'aria-labelledby'?: string
  as?: 'div' | 'section'
}) {
  const Tag = as === 'section' ? motion.section : motion.div
  return (
    <Tag
      id={id}
      aria-labelledby={labelledBy}
      className={className}
      style={style}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.2 }}
      variants={containerVariants}
    >
      {children}
    </Tag>
  )
}

/**
 * One revealed item. `kind`: `up` (default) rises and fades, `fade` only fades, `ink` sweeps a soft mask
 * from the left like handwriting. `delay` (seconds from the trigger) overrides the 80 ms stagger when a
 * board sets its own timing.
 */
export function RevealItem({
  children,
  className,
  style,
  kind = 'up',
  delay,
  duration,
  as = 'div',
}: {
  children?: ReactNode
  className?: string
  style?: CSSProperties
  kind?: Kind
  delay?: number
  duration?: number
  as?: 'div' | 'span'
}) {
  const reduced = useReducedMotion() ?? false
  const Tag = as === 'span' ? motion.span : motion.div
  return (
    <Tag
      className={className}
      style={kind === 'ink' ? { ...INK_MASK, ...style } : style}
      variants={itemVariants(kind, reduced, duration)}
      custom={delay}
    >
      {children}
    </Tag>
  )
}
