const hits = new Map<string, number[]>()

export function rateLimit(
  key: string,
  opts: { max: number; windowMs: number },
  now = Date.now(),
): { ok: boolean; remaining: number } {
  // prune expired entries of every key so the map doesn't grow unbounded
  for (const [k, stamps] of hits) {
    if (stamps.every((t) => now - t >= opts.windowMs)) hits.delete(k)
  }
  const recent = (hits.get(key) ?? []).filter((t) => now - t < opts.windowMs)
  if (recent.length >= opts.max) {
    hits.set(key, recent)
    return { ok: false, remaining: 0 }
  }
  recent.push(now)
  hits.set(key, recent)
  return { ok: true, remaining: opts.max - recent.length }
}

export function getClientIp(headers: Headers): string {
  const first = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return first || 'local'
}

export function resetRateLimits(): void {
  hits.clear()
}
