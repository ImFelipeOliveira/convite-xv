import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'
import { EVENT } from '@/features/event/event'

export const alt = 'Convite de 15 anos da Isabella: uma carta fechada, pronta para abrir'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const GOLD = '#B8955A'
const SEAL_SIZE = 132
const SEAL_TOP = 236

const fontsDir = join(process.cwd(), 'public', 'fonts')

// Same image for every token and no guest data: nothing here reads the route params.
export default async function Image() {
  const [pinyon, bodoni] = await Promise.all([
    readFile(join(fontsDir, 'PinyonScript-Regular.ttf')),
    readFile(join(fontsDir, 'BodoniModa-Medium.ttf')),
  ])

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          background: '#F7DEDB',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 28,
            left: 28,
            right: 28,
            bottom: 28,
            border: `2px solid ${GOLD}`,
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 44,
            left: 44,
            right: 44,
            bottom: 44,
            border: `1px solid ${GOLD}`,
            display: 'flex',
          }}
        />
        {/* closed envelope: flap folds from the top corners to the seal, side folds from the bottom corners */}
        <svg
          width="1200"
          height="630"
          viewBox="0 0 1200 630"
          style={{ position: 'absolute', top: 0, left: 0 }}
        >
          <path d="M45 45 L600 302 L1155 45" fill="#FBE9E6" stroke={GOLD} strokeWidth="1.5" />
          <path d="M45 585 L430 330" fill="none" stroke={GOLD} strokeWidth="1" opacity="0.55" />
          <path d="M1155 585 L770 330" fill="none" stroke={GOLD} strokeWidth="1" opacity="0.55" />
        </svg>
        <div
          style={{
            position: 'absolute',
            top: SEAL_TOP,
            left: (1200 - SEAL_SIZE) / 2,
            width: SEAL_SIZE,
            height: SEAL_SIZE,
            borderRadius: '50%',
            background: 'radial-gradient(circle at 35% 30%, #D0588A, #A8325E 55%, #7A1F43)',
            boxShadow: '0 8px 18px rgba(122, 31, 67, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#F7DEDB',
            fontFamily: 'Bodoni',
            fontSize: 74,
          }}
        >
          I
        </div>
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 392,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <div style={{ fontFamily: 'Pinyon', fontSize: 120, color: '#C25578', lineHeight: 1 }}>
            {EVENT.celebrant}
          </div>
          <div
            style={{
              marginTop: 22,
              fontFamily: 'Bodoni',
              fontSize: 28,
              letterSpacing: 10,
              color: '#7A5629',
            }}
          >
            15 ANOS · 27.12.2026
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'Pinyon', data: pinyon, style: 'normal', weight: 400 },
        { name: 'Bodoni', data: bodoni, style: 'normal', weight: 400 },
      ],
    },
  )
}
