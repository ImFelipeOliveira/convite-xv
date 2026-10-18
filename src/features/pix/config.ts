export type AsaasConfig = { apiKey: string; baseUrl: string; webhookToken: string | null }

export const ASAAS_BASE_URLS = {
  sandbox: 'https://api-sandbox.asaas.com/v3',
  production: 'https://api.asaas.com/v3',
} as const

/**
 * Asaas settings from the environment, or null when Pix is not configured (the build never needs them).
 * `ASAAS_BASE_URL` (tests / fake server) wins over the `ASAAS_ENV`-derived URL; anything but
 * `production` means sandbox.
 */
export function readAsaasConfig(): AsaasConfig | null {
  // Asaas keys start with "$": a dotenv-escaped "\$aact_..." is unescaped here
  const apiKey = process.env.ASAAS_API_KEY?.trim().replace(/^\\\$/, '$')
  if (!apiKey) return null
  const override = process.env.ASAAS_BASE_URL?.trim()
  const env = process.env.ASAAS_ENV?.trim() === 'production' ? 'production' : 'sandbox'
  return {
    apiKey,
    baseUrl: (override || ASAAS_BASE_URLS[env]).replace(/\/+$/, ''),
    webhookToken: process.env.ASAAS_WEBHOOK_TOKEN?.trim() || null,
  }
}

/**
 * Customer strategy. Default (sandbox-confirmed 2026-10-18: Asaas refuses PIX charges for a customer
 * without cpfCnpj): each payer gives a CPF and gets their own Asaas customer. `ASAAS_REQUIRE_PAYER_CPF=false`
 * switches to one generic customer without CPF (only if Asaas ever accepts it for this account).
 */
export function requirePayerCpf(): boolean {
  return process.env.ASAAS_REQUIRE_PAYER_CPF?.trim() !== 'false'
}
