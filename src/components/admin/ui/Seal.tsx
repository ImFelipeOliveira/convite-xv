// Wax seal with the "15" monogram (Sistema visual: "Lacre · cera com borda irregular").
const POINTS = 28
const edge = Array.from({ length: POINTS }, (_, i) => {
  const angle = (i / POINTS) * Math.PI * 2
  const r = i % 2 === 0 ? 23 : 21.6 + ((i * 7) % 5) * 0.18
  return `${(24 + r * Math.cos(angle)).toFixed(2)},${(24 + r * Math.sin(angle)).toFixed(2)}`
}).join(' ')

export function Seal({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <polygon
        points={edge}
        fill="var(--seal)"
        strokeLinejoin="round"
        stroke="var(--seal)"
        strokeWidth="1.5"
      />
      <circle
        cx="24"
        cy="24"
        r="16.5"
        fill="none"
        stroke="var(--paper)"
        strokeOpacity=".45"
        strokeWidth=".8"
      />
      <circle cx="24" cy="24" r="16.5" fill="var(--deep-rose)" fillOpacity=".35" />
      <text
        x="24"
        y="29.5"
        textAnchor="middle"
        fill="var(--paper)"
        style={{ fontFamily: 'var(--font-bodoni), serif', fontSize: 16, fontStyle: 'italic' }}
      >
        15
      </text>
    </svg>
  )
}
