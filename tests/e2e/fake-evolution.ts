// Fake Evolution API for e2e: a tiny in-memory HTTP server the Next app talks to
// (EVOLUTION_URL=http://127.0.0.1:4010, EVOLUTION_API_KEY=test-key, see playwright.config.ts).
// Control endpoints (no apikey) let specs set the connection state (POST /__state {state, sendDelayMs?}),
// read the sendText calls (GET /__calls) and clear them (DELETE /__calls).
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'

export const FAKE_EVOLUTION_PORT = 4010
export const FAKE_EVOLUTION_URL = `http://127.0.0.1:${FAKE_EVOLUTION_PORT}`
export const FAKE_EVOLUTION_API_KEY = 'test-key'
/** Sending to this number answers like Evolution does for a number without WhatsApp. */
export const FAKE_INVALID_NUMBER = '5500000000000'

export type FakeState = 'open' | 'connecting' | 'close'
export type FakeCall = { instance: string; number: string; text: string }

// 1x1 transparent PNG
const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    let raw = ''
    req.on('data', (chunk) => (raw += chunk))
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : null)
      } catch {
        resolve(null)
      }
    })
  })
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

export async function startFakeEvolution(port = FAKE_EVOLUTION_PORT): Promise<{ close: () => Promise<void> }> {
  let state: FakeState = 'close'
  let calls: FakeCall[] = []
  let seq = 0
  let sendDelayMs = 0

  const server: Server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://fake')
    const path = url.pathname
    const method = req.method ?? 'GET'

    // --- control endpoints (tests only) ---
    if (path === '/__state' && method === 'POST') {
      const body = (await readBody(req)) as { state?: FakeState; sendDelayMs?: number } | null
      if (body?.state === 'open' || body?.state === 'connecting' || body?.state === 'close') {
        state = body.state
        sendDelayMs = Math.max(0, Number(body.sendDelayMs ?? 0))
        return json(res, 200, { state, sendDelayMs })
      }
      return json(res, 400, { error: 'state must be open | connecting | close' })
    }
    if (path === '/__state' && method === 'GET') return json(res, 200, { state })
    if (path === '/__calls' && method === 'GET') return json(res, 200, calls)
    if (path === '/__calls' && method === 'DELETE') {
      calls = []
      return json(res, 200, calls)
    }

    // --- Evolution API ---
    if (req.headers['apikey'] !== FAKE_EVOLUTION_API_KEY) {
      return json(res, 401, { status: 401, error: 'Unauthorized', response: { message: 'Unauthorized' } })
    }

    if (path === '/instance/create' && method === 'POST') {
      const body = (await readBody(req)) as { instanceName?: string } | null
      return json(res, 201, { instance: { instanceName: body?.instanceName ?? 'convite-xv', status: 'created' } })
    }

    let m = path.match(/^\/instance\/connect\/([^/]+)$/)
    if (m && method === 'GET') {
      // first call shows a QR code; the next one finds the phone "scanned" it
      if (state === 'open') return json(res, 200, {})
      if (state === 'connecting') {
        state = 'open'
        return json(res, 200, {})
      }
      state = 'connecting'
      return json(res, 200, { base64: TINY_PNG, code: 'fake-qr', count: 1 })
    }

    m = path.match(/^\/instance\/connectionState\/([^/]+)$/)
    if (m && method === 'GET') {
      return json(res, 200, { instance: { instanceName: decodeURIComponent(m[1]), state } })
    }

    m = path.match(/^\/instance\/logout\/([^/]+)$/)
    if (m && method === 'DELETE') {
      state = 'close'
      return json(res, 200, { status: 'SUCCESS', error: false, response: { message: 'Instance logged out' } })
    }

    m = path.match(/^\/message\/sendText\/([^/]+)$/)
    if (m && method === 'POST') {
      const body = (await readBody(req)) as { number?: string; text?: string } | null
      const number = String(body?.number ?? '')
      calls.push({ instance: decodeURIComponent(m[1]), number, text: String(body?.text ?? '') })
      if (sendDelayMs > 0) await new Promise((r) => setTimeout(r, sendDelayMs))
      if (state !== 'open') {
        return json(res, 400, { status: 400, error: 'Bad Request', response: { message: ['Connection Closed'] } })
      }
      if (number === FAKE_INVALID_NUMBER) {
        return json(res, 400, {
          status: 400,
          error: 'Bad Request',
          response: { message: [{ exists: false, jid: `${number}@s.whatsapp.net`, number }] },
        })
      }
      seq += 1
      return json(res, 201, {
        key: { remoteJid: `${number}@s.whatsapp.net`, fromMe: true, id: `FAKE-${seq}` },
        status: 'PENDING',
      })
    }

    return json(res, 404, { status: 404, error: 'Not Found' })
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => resolve())
  })

  return {
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections()
        server.close(() => resolve())
      }),
  }
}

/** Test-side helpers for the control endpoints. `sendDelayMs` slows down sendText answers. */
export async function setFakeEvolutionState(state: FakeState, opts: { sendDelayMs?: number } = {}): Promise<void> {
  const res = await fetch(`${FAKE_EVOLUTION_URL}/__state`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ state, sendDelayMs: opts.sendDelayMs ?? 0 }),
  })
  if (!res.ok) throw new Error(`fake evolution: set state failed (${res.status})`)
}

export async function fakeEvolutionCalls(): Promise<FakeCall[]> {
  const res = await fetch(`${FAKE_EVOLUTION_URL}/__calls`)
  return (await res.json()) as FakeCall[]
}

export async function resetFakeEvolution(state: FakeState = 'close'): Promise<void> {
  await fetch(`${FAKE_EVOLUTION_URL}/__calls`, { method: 'DELETE' })
  await setFakeEvolutionState(state)
}
