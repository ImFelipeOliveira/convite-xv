// Fake Evolution API for e2e: a tiny in-memory HTTP server the Next app talks to
// (EVOLUTION_URL=http://127.0.0.1:4010, EVOLUTION_API_KEY=test-key, see playwright.config.ts).
// Control endpoints (no apikey) let specs set the connection state (POST /__state {state, sendDelayMs?, qr?}),
// read the sendText calls (GET /__calls) and clear them (DELETE /__calls).
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { deflateSync } from 'node:zlib'

export const FAKE_EVOLUTION_PORT = 4010
export const FAKE_EVOLUTION_URL = `http://127.0.0.1:${FAKE_EVOLUTION_PORT}`
export const FAKE_EVOLUTION_API_KEY = 'test-key'
/** Sending to this number answers like Evolution does for a number without WhatsApp. */
export const FAKE_INVALID_NUMBER = '5500000000000'

export type FakeState = 'open' | 'connecting' | 'close'
/** Shape of the QR in the connect answer: full data URL, raw base64 (+ code), or not ready yet (count only). */
export type FakeQrFormat = 'dataUrl' | 'raw' | 'none'
export type FakeCall = { instance: string; number: string; text: string }

// --- a QR-looking PNG (not scannable) so review screenshots show something realistic ---
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}
/** 29×29 modules (+4 quiet zone) at 8 px, black/white, with the three finder squares. */
function fakeQrPng(seed: number): string {
  const modules = 29
  const quiet = 4
  const scale = 8
  const size = (modules + quiet * 2) * scale
  let x = seed
  const rand = () => ((x = (x * 1103515245 + 12345) & 0x7fffffff) % 100) / 100
  const grid = Array.from({ length: modules }, () => Array.from({ length: modules }, () => rand() < 0.5))
  const finder = (r0: number, c0: number) => {
    for (let r = -1; r < 8; r++)
      for (let c = -1; c < 8; c++) {
        const rr = r0 + r
        const cc = c0 + c
        if (rr < 0 || cc < 0 || rr >= modules || cc >= modules) continue
        const ring = Math.max(Math.abs(r - 3), Math.abs(c - 3))
        grid[rr][cc] = ring !== 2 && ring !== 4
      }
  }
  finder(0, 0)
  finder(0, modules - 7)
  finder(modules - 7, 0)
  const raw = Buffer.alloc(size * (size + 1), 255)
  for (let py = 0; py < size; py++) {
    raw[py * (size + 1)] = 0 // filter: none
    for (let px = 0; px < size; px++) {
      const r = Math.floor(py / scale) - quiet
      const c = Math.floor(px / scale) - quiet
      if (r >= 0 && c >= 0 && r < modules && c < modules && grid[r][c]) raw[py * (size + 1) + 1 + px] = 0
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 0 // grayscale
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
  return `data:image/png;base64,${png.toString('base64')}`
}

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
  let qr: FakeQrFormat = 'dataUrl'
  let connectCalls = 0

  const server: Server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://fake')
    const path = url.pathname
    const method = req.method ?? 'GET'

    // --- control endpoints (tests only) ---
    if (path === '/__state' && method === 'POST') {
      const body = (await readBody(req)) as { state?: FakeState; sendDelayMs?: number; qr?: FakeQrFormat } | null
      if (body?.state === 'open' || body?.state === 'connecting' || body?.state === 'close') {
        state = body.state
        sendDelayMs = Math.max(0, Number(body.sendDelayMs ?? 0))
        qr = body.qr === 'raw' || body.qr === 'none' ? body.qr : 'dataUrl'
        connectCalls = 0
        return json(res, 200, { state, sendDelayMs, qr })
      }
      return json(res, 400, { error: 'state must be open | connecting | close' })
    }
    if (path === '/__state' && method === 'GET') return json(res, 200, { state, connectCalls })
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
      // like Evolution v2: connected → the state; otherwise (re)starts pairing and answers the current QR.
      // The phone "scanning" it is simulated with POST /__state {state: 'open'}.
      connectCalls += 1
      if (state === 'open') return json(res, 200, { instance: { instanceName: decodeURIComponent(m[1]), state } })
      state = 'connecting'
      if (qr === 'none') return json(res, 200, { count: 0 })
      const png = fakeQrPng(connectCalls)
      if (qr === 'raw') {
        return json(res, 200, { pairingCode: null, code: '2@fake-qr', base64: png.split(',')[1], count: connectCalls })
      }
      return json(res, 200, { base64: png, code: 'fake-qr', count: connectCalls })
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
export async function setFakeEvolutionState(
  state: FakeState,
  opts: { sendDelayMs?: number; qr?: FakeQrFormat } = {},
): Promise<void> {
  const res = await fetch(`${FAKE_EVOLUTION_URL}/__state`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ state, sendDelayMs: opts.sendDelayMs ?? 0, qr: opts.qr ?? 'dataUrl' }),
  })
  if (!res.ok) throw new Error(`fake evolution: set state failed (${res.status})`)
}

export async function fakeEvolutionState(): Promise<{ state: FakeState; connectCalls: number }> {
  const res = await fetch(`${FAKE_EVOLUTION_URL}/__state`)
  return (await res.json()) as { state: FakeState; connectCalls: number }
}

export async function fakeEvolutionCalls(): Promise<FakeCall[]> {
  const res = await fetch(`${FAKE_EVOLUTION_URL}/__calls`)
  return (await res.json()) as FakeCall[]
}

export async function resetFakeEvolution(state: FakeState = 'close'): Promise<void> {
  await fetch(`${FAKE_EVOLUTION_URL}/__calls`, { method: 'DELETE' })
  await setFakeEvolutionState(state)
}
