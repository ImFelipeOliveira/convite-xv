// Usage: ASAAS_API_KEY=... ASAAS_ENV=sandbox pnpm tsx scripts/asaas-sandbox-check.ts
// Checks, against the Asaas SANDBOX only, whether one generic customer WITHOUT CPF can receive a
// R$ 70 PIX charge (default path) and, for comparison, the per-guest CPF path. Cleans up after itself.
// Never prints the API key; Asaas error descriptions are printed for diagnosis.
import { createPixPayment, deletePayment, ensureCustomer, getPixQrCode } from '../src/features/pix/asaas'
import { ASAAS_BASE_URLS, readAsaasConfig, type AsaasConfig } from '../src/features/pix/config'
import { pixDueDate } from '../src/features/pix/due-date'

try {
  process.loadEnvFile('.env.local')
} catch {
  // no .env.local: fall back to the process environment
}

const TEST_CPF = '52998224725' // well-known valid test CPF used in docs/examples

/**
 * Asaas rejected the request (4xx): nothing was created, so repeating it is safe and shows why.
 * Timeouts / 5xx / network errors are never repeated (the first call may have created something).
 */
const REJECTED = new Set(['invalid_request', 'unauthorized'])
async function whyRejected(cfg: AsaasConfig, error: string, method: string, path: string, body?: unknown) {
  return REJECTED.has(error) ? explain(cfg, method, path, body) : '(not repeated: transient or unknown outcome)'
}

/** Raw call for diagnostics only: status + Asaas `errors[].description`. */
async function explain(cfg: AsaasConfig, method: string, path: string, body?: unknown): Promise<string> {
  try {
    const res = await fetch(`${cfg.baseUrl}${path}`, {
      method,
      headers: { access_token: cfg.apiKey, 'user-agent': 'convite-xv', 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const json = (await res.json().catch(() => null)) as { errors?: { code?: string; description?: string }[] } | null
    const errors = json?.errors?.map((e) => `${e.code}: ${e.description}`).join(' | ') ?? ''
    return `HTTP ${res.status} ${errors}`
  } catch (err) {
    return `network error: ${(err as Error).name}`
  }
}

/** 'customer' | 'payment' | 'qr' = the stage that failed; 'ok' = QR code obtained. */
async function tryPath(
  cfg: AsaasConfig,
  label: string,
  customer: { name: string; cpfCnpj?: string },
): Promise<'customer' | 'payment' | 'qr' | 'ok'> {
  console.log(`\n== ${label} ==`)
  const c = await ensureCustomer(cfg, customer)
  if (!c.ok) {
    console.log(`customer: FAILED (${c.error}) ->`, await whyRejected(cfg, c.error, 'POST', '/customers', customer))
    return 'customer'
  }
  console.log(`customer: ok ${c.value.id}`)
  let stage: 'payment' | 'qr' | 'ok' = 'payment'
  const input = {
    customerId: c.value.id,
    valueCents: 7000,
    dueDate: pixDueDate(new Date()),
    externalReference: `sandbox-check-${Date.now()}`,
    description: 'Teste sandbox — presente Pix',
  }
  const p = await createPixPayment(cfg, input)
  if (!p.ok) {
    const body = { customer: input.customerId, billingType: 'PIX', value: 70, dueDate: input.dueDate }
    console.log(`payment: FAILED (${p.error}) ->`, await whyRejected(cfg, p.error, 'POST', '/payments', body))
  } else {
    console.log(`payment: ok ${p.value.id}`)
    stage = 'qr'
    const q = await getPixQrCode(cfg, p.value.id)
    if (!q.ok) {
      console.log(`qr: FAILED (${q.error}) ->`, await whyRejected(cfg, q.error, 'GET', `/payments/${p.value.id}/pixQrCode`))
    } else {
      console.log(
        `qr: ok (image ${q.value.encodedImage.length} b64 chars, payload ${q.value.payload.length} chars, expirationDate ${q.value.expirationDate})`,
      )
      stage = 'ok'
    }
    const d = await deletePayment(cfg, p.value.id)
    console.log(`cleanup payment: ${d.ok ? 'deleted' : d.error}`)
  }
  console.log(`cleanup customer: ${await explain(cfg, 'DELETE', `/customers/${c.value.id}`)}`)
  return stage
}

async function main() {
  const cfg = readAsaasConfig()
  if (!cfg) {
    console.error('ASAAS_API_KEY is not set')
    process.exit(1)
  }
  if (process.env.ASAAS_ENV?.trim() !== 'sandbox' || cfg.baseUrl === ASAAS_BASE_URLS.production) {
    console.error('Refusing to run: set ASAAS_ENV=sandbox (this script never touches production)')
    process.exit(1)
  }
  console.log(`base url: ${cfg.baseUrl}`)
  const generic = await tryPath(cfg, 'generic customer without CPF', {
    name: 'Convidados — 15 anos da Isabella',
  })
  const perGuest = await tryPath(cfg, 'per-guest customer with CPF', {
    name: 'Teste Sandbox',
    cpfCnpj: TEST_CPF,
  })
  console.log('\n== result ==')
  console.log(`generic customer without CPF: ${generic}`)
  console.log(`per-guest customer with CPF:  ${perGuest}`)
  if (generic === 'ok') console.log('-> the generic path works: ASAAS_REQUIRE_PAYER_CPF=false is an option')
  else if (perGuest === 'ok' || (generic === 'payment' && perGuest === 'qr')) console.log('-> CPF is required: keep the default (ASAAS_REQUIRE_PAYER_CPF unset)')
  else console.log('-> no path reached a QR code: read the Asaas errors above (e.g. no Pix key on the account)')
}

main().catch((err) => {
  console.error('unexpected failure:', (err as Error).name)
  process.exit(1)
})
