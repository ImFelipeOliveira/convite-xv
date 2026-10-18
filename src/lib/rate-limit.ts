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
  // the right-most entry is the one appended by our trusted proxy; earlier ones are client-controlled
  const parts = headers.get('x-forwarded-for')?.split(',') ?? []
  return parts[parts.length - 1]?.trim() || 'local'
}

export function resetRateLimits(): void {
  hits.clear()
  lastSweep = 0
}
