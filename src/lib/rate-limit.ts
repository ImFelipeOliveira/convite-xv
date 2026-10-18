type Entry = { stamps: number[]; windowMs: number }

const hits = new Map<string, Entry>()
const SWEEP_EVERY_MS = 5_000
let lastSweep = 0

// Each key is pruned against its OWN window, so a short-window call never wipes a long-window entry.
function sweep(now: number): void {
  if (now - lastSweep < SWEEP_EVERY_MS) return
  lastSweep = now
  for (const [k, e] of hits) {
    if (e.stamps.every((t) => now - t >= e.windowMs)) hits.delete(k)
  }
}

export function rateLimit(
  key: string,
  opts: { max: number; windowMs: number },
  now = Date.now(),
): { ok: boolean; remaining: number } {
  sweep(now)
  const recent = (hits.get(key)?.stamps ?? []).filter((t) => now - t < opts.windowMs)
  if (recent.length >= opts.max) {
    hits.set(key, { stamps: recent, windowMs: opts.windowMs })
    return { ok: false, remaining: 0 }
  }
  recent.push(now)
  hits.set(key, { stamps: recent, windowMs: opts.windowMs })
  return { ok: true, remaining: opts.max - recent.length }
}

export function getClientIp(headers: Headers): string {
  // Railway's edge sets x-real-ip to the client address; fall back to the
  // right-most x-forwarded-for entry (the one appended by the trusted proxy)
  const realIp = headers.get('x-real-ip')?.trim()
  if (realIp) return realIp
  const parts = headers.get('x-forwarded-for')?.split(',') ?? []
  return parts[parts.length - 1]?.trim() || 'local'
}

export function resetRateLimits(): void {
  hits.clear()
  lastSweep = 0
}
