export type EvolutionConfig = { url: string; apiKey: string; instance: string }

export function readEvolutionConfig(): EvolutionConfig | null {
  const url = process.env.EVOLUTION_URL?.trim()
  const apiKey = process.env.EVOLUTION_API_KEY?.trim()
  if (!url || !apiKey) return null
  return {
    url: url.replace(/\/+$/, ''),
    apiKey,
    instance: process.env.EVOLUTION_INSTANCE?.trim() || 'convite-xv',
  }
}
