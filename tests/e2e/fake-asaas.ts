// Fake Asaas API for e2e: a tiny in-memory HTTP server the Next app talks to
// (ASAAS_BASE_URL=http://127.0.0.1:4120, ASAAS_API_KEY=test-key, see playwright.config.ts).
// Like the sandbox, a customer without cpfCnpj is refused. Control endpoints (no access_token):
//   POST /__mode {failPayments?, latencyMs?}  – 500 on POST /payments; delay every Asaas answer
//   POST /__payments/latest/status {status}  – sets the newest charge's Asaas status (e.g. RECEIVED)
//   GET /__calls                              – the Asaas calls so far ("METHOD /path")
//   POST /__reset                             – clears calls, charges and modes
import './load-env'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { deflateSync } from 'node:zlib'

export const FAKE_ASAAS_PORT = Number(process.env.FAKE_ASAAS_PORT || 4120)
export const FAKE_ASAAS_URL = `http://127.0.0.1:${FAKE_ASAAS_PORT}`
export const FAKE_ASAAS_API_KEY = 'test-key'

type Charge = { id: string; status: string; value: number }

// --- a QR-looking PNG (not scannable) so screenshots show something realistic ---
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
/** Raw base64 PNG (what Asaas' `encodedImage` carries): 29×29 modules with the three finder squares. */
function fakeQrBase64(seed: number): string {
  const modules = 29
  const quiet = 2
  const scale = 6
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
    raw[py * (size + 1)] = 0
    for (let px = 0; px < size; px++) {
      const r = Math.floor(py / scale) - quiet
      const c = Math.floor(px / scale) - quiet
      if (r >= 0 && c >= 0 && r < modules && c < modules && grid[r][c]) raw[py * (size + 1) + 1 + px] = 0
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]).toString('base64')
}

/** Tomorrow 23:59:59 in Brasília time, formatted like Asaas ('YYYY-MM-DD HH:mm:ss'). */
function expiration(): string {
  const brasilia = new Date(Date.now() - 3 * 3_600_000 + 86_400_000)
  return `${brasilia.toISOString().slice(0, 10)} 23:59:59`
}

function readBody(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    let raw = ''
    req.on('data', (c) => (raw += c))
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

export async function startFakeAsaas(port = FAKE_ASAAS_PORT): Promise<{ close: () => Promise<void> }> {
  let calls: string[] = []
  let charges: Charge[] = []
  let customerN = 0
  let paymentN = 0
  let failPayments = false
  let latencyMs = 0

  const server: Server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://fake')
    const path = url.pathname
    const method = req.method ?? 'GET'

    // --- control endpoints (tests only) ---
    if (path === '/__mode' && method === 'POST') {
      const body = await readBody(req)
      failPayments = body?.failPayments === true
      latencyMs = Math.max(0, Number(body?.latencyMs ?? 0))
      return json(res, 200, { failPayments, latencyMs })
    }
    if (path === '/__payments/latest/status' && method === 'POST') {
      const body = await readBody(req)
      const latest = charges[charges.length - 1]
      if (!latest || typeof body?.status !== 'string') return json(res, 404, { error: 'no charge' })
      latest.status = body.status
      return json(res, 200, latest)
    }
    if (path === '/__calls' && method === 'GET') return json(res, 200, calls)
    if (path === '/__reset' && method === 'POST') {
      calls = []
      charges = []
      failPayments = false
      latencyMs = 0
      return json(res, 200, { ok: true })
    }

    // --- Asaas API (paths relative to /v3) ---
    if (req.headers['access_token'] !== FAKE_ASAAS_API_KEY) {
      return json(res, 401, { errors: [{ code: 'invalid_access_token', description: 'Unauthorized' }] })
    }
    const apiPath = path.replace(/^\/v3/, '')
    calls.push(`${method} ${apiPath.replace(/^\/payments\/[^/]+/, '/payments/:id')}`)
    if (latencyMs > 0) await new Promise((r) => setTimeout(r, latencyMs))

    if (apiPath === '/customers' && method === 'POST') {
      const body = await readBody(req)
      if (typeof body?.cpfCnpj !== 'string' || !/^\d{11}$/.test(body.cpfCnpj)) {
        return json(res, 400, { errors: [{ code: 'invalid_cpfCnpj', description: 'CPF obrigatório' }] })
      }
      return json(res, 200, { id: `cus_fake_${++customerN}`, name: body.name })
    }

    if (apiPath === '/payments' && method === 'POST') {
      const body = await readBody(req)
      if (failPayments) return json(res, 500, { errors: [{ code: 'internal', description: 'boom' }] })
      const charge = { id: `pay_fake_${++paymentN}`, status: 'PENDING', value: Number(body?.value ?? 0) }
      charges.push(charge)
      return json(res, 200, { id: charge.id, status: charge.status, value: charge.value, billingType: 'PIX' })
    }

    let m = apiPath.match(/^\/payments\/([^/]+)\/pixQrCode$/)
    if (m && method === 'GET') {
      const charge = charges.find((c) => c.id === decodeURIComponent(m![1]))
      if (!charge) return json(res, 404, { errors: [{ code: 'not_found' }] })
      return json(res, 200, {
        encodedImage: fakeQrBase64(charges.indexOf(charge) + 7),
        payload: `00020126580014br.gov.bcb.pix0136fake-${charge.id}520400005303986540${charge.value.toFixed(2)}`,
        expirationDate: expiration(),
      })
    }

    m = apiPath.match(/^\/payments\/([^/]+)$/)
    if (m) {
      const id = decodeURIComponent(m[1])
      const charge = charges.find((c) => c.id === id)
      if (!charge) return json(res, 404, { errors: [{ code: 'not_found' }] })
      if (method === 'GET') return json(res, 200, { id, status: charge.status, value: charge.value })
      if (method === 'DELETE') {
        charge.status = 'DELETED'
        return json(res, 200, { deleted: true, id })
      }
    }

    return json(res, 404, { errors: [{ code: 'not_found' }] })
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

// --- test-side helpers for the control endpoints ---

export async function resetFakeAsaas(): Promise<void> {
  await fetch(`${FAKE_ASAAS_URL}/__reset`, { method: 'POST' })
}

export async function setFakeAsaasMode(mode: { failPayments?: boolean; latencyMs?: number }): Promise<void> {
  const res = await fetch(`${FAKE_ASAAS_URL}/__mode`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(mode),
  })
  if (!res.ok) throw new Error(`fake asaas: set mode failed (${res.status})`)
}

/** Sets the Asaas status of the newest charge ('RECEIVED' = paid, 'OVERDUE' = expired). */
export async function setLatestFakeChargeStatus(status: string): Promise<void> {
  const res = await fetch(`${FAKE_ASAAS_URL}/__payments/latest/status`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status }),
  })
  if (!res.ok) throw new Error(`fake asaas: set status failed (${res.status})`)
}

export async function fakeAsaasCalls(): Promise<string[]> {
  const res = await fetch(`${FAKE_ASAAS_URL}/__calls`)
  return (await res.json()) as string[]
}
