import { beforeEach, describe, expect, it } from 'vitest'
import { makeGuest, resetDatabase } from '../../../tests/helpers/db'
import { generateToken } from '@/features/guests/token'
import { GET } from '../c/[token]/calendar.ics/route'

const call = (token: string) =>
  GET(new Request(`http://localhost/c/${token}/calendar.ics`), {
    params: Promise.resolve({ token }),
  })

describe('GET /c/[token]/calendar.ics', () => {
  beforeEach(resetDatabase)

  it('returns 404 for an unknown token', async () => {
    const res = await call(generateToken())
    expect(res.status).toBe(404)
  })

  it('returns the .ics file for a real guest', async () => {
    const g = await makeGuest()
    const res = await call(g.token)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/calendar; charset=utf-8')
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="15-anos-isabella.ics"')
    expect(await res.text()).toContain(`/c/${g.token}`)
  })
})
