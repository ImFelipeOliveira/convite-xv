export type FeatureName = 'gifts' | 'pix'

export function isFeatureEnabled(name: FeatureName): boolean {
  return (process.env.FEATURES ?? '')
    .split(',')
    .map((f) => f.trim())
    .includes(name)
}
