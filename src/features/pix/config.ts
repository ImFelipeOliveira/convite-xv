export type AsaasConfig = { apiKey: string; baseUrl: string; webhookToken: string | null }

export const ASAAS_BASE_URLS = {
  sandbox: 'https://api-sandbox.asaas.com/v3',
  production: 'https://api.asaas.com/v3',
} as const

/**
 * Whether test-only overrides (`ASAAS_BASE_URL`, `PIX_POLL_AFTER_MS` / `PIX_POLL_EVERY_MS`) apply: always
 * outside production; in a production build only with `ALLOW_TEST_OVERRIDES=1`, which the Playwright
 * config sets for its `next start` server. Never set it on Railway: `ASAAS_BASE_URL` decides where the
 * Asaas API key is sent.
 */
export function testOverridesAllowed(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.ALLOW_TEST_OVERRIDES?.trim() === '1'
}

/**
 * Asaas settings from the environment, or null when Pix is not configured (the build never needs them).
 * `ASAAS_BASE_URL` (tests / fake server; see testOverridesAllowed) wins over the `ASAAS_ENV`-derived URL;
 * anything but `production` means sandbox.
 */
export function readAsaasConfig(): AsaasConfig | null {
  // Asaas keys start with "$": a dotenv-escaped "\$aact_..." is unescaped here
  const apiKey = process.env.ASAAS_API_KEY?.trim().replace(/^\\\$/, '$')
  if (!apiKey) return null
  const override = testOverridesAllowed() ? process.env.ASAAS_BASE_URL?.trim() : undefined
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
