'use client'

import { useEffect, useRef, useState } from 'react'

// Double gold frame that draws itself from the top centre (Hero, prancha 05), sized to its
// positioned parent so the 14/19 px insets hold at any viewport. Paths carry `stage-draw`:
// the Opening stage decides when they draw.
const BOARD = { w: 390, h: 844 }

function framePath(w: number, h: number, inset: number): string {
  return `M${w / 2} ${inset} H${w - inset} V${h - inset} H${inset} V${inset} Z`
}

export function DrawnFrame() {
  const ref = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState(BOARD)

  useEffect(() => {
    const parent = ref.current?.parentElement
    if (!parent) return
    // the parent's padding box (contentRect would leave out its padding)
    const observer = new ResizeObserver(() => setSize({ w: parent.clientWidth, h: parent.clientHeight }))
    observer.observe(parent)
    return () => observer.disconnect()
  }, [])

  return (
    <svg
      ref={ref}
      aria-hidden="true"
      width={size.w}
      height={size.h}
      viewBox={`0 0 ${size.w} ${size.h}`}
      className="pointer-events-none absolute top-0 left-0"
    >
      <path
        className="stage-draw"
        pathLength={1}
        d={framePath(size.w, size.h, 14)}
        fill="none"
        stroke="#B8955A"
        strokeOpacity=".8"
        strokeWidth="1"
      />
      <path
        className="stage-draw"
        pathLength={1}
        d={framePath(size.w, size.h, 19)}
        fill="none"
        stroke="#B8955A"
        strokeOpacity=".35"
        strokeWidth="1"
        style={{ animationDelay: '.15s' }}
      />
    </svg>
  )
}
