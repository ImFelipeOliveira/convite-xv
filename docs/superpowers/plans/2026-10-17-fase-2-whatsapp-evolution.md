# Fase 2 — WhatsApp (Evolution API): envio do convite e lembretes · Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A família conecta um número de WhatsApp (chip dedicado) pelo painel, envia cada convite pela Evolution API com um clique e registro de envio, e os confirmados recebem lembretes automáticos 7 dias antes e na véspera.

**Architecture:** A Evolution API roda como serviço separado no Railway (rede privada) e o monolito Next.js fala com ela por HTTP através de um cliente fino (`src/features/whatsapp/evolution.ts`). Todo envio vira uma linha em `message_dispatches`. Convites são enviados de forma síncrona por uma Server Action; lembretes são linhas agendadas (`scheduled_for`) que um despachante dentro do processo Next (iniciado em `instrumentation.ts`) consome uma por vez, com `FOR UPDATE SKIP LOCKED` e intervalo aleatório entre mensagens.

**Tech Stack:** o da Fase 1 (Next.js 16, Drizzle/Postgres, Zod, pino, Vitest, Playwright) + Evolution API v2 (imagem Docker oficial) — sem novas dependências de runtime no app.

**Spec:** `docs/superpowers/specs/2026-10-17-convite-xv-design.md` (§7 `message_dispatches`, §8.5a envio do convite, §8.5 lembretes). Nomes: `docs/superpowers/plans/naming-glossary.md`.

## Global Constraints

- **All code in English**; user-facing copy pt-BR. Commits in English.
- Every admin page, loader, Server Action and route handler calls `await requireAdmin()` first (layout is not a boundary; `src/proxy.ts` 307-gates `/admin/*`).
- Never log phone numbers, message text, tokens or names — log `guestId`, `adminId`, `kind`, `status`, `errorCode` only (`src/lib/logger.ts`, err under the `err` key).
- Phone sent to Evolution as digits only from E.164 (`+5595991234567` → `5595991234567`).
- Evolution env: `EVOLUTION_URL` (e.g. `http://evolution.railway.internal:8080`), `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE` (default `convite-xv`). Missing config → features disabled with pt-BR notice, never a crash; build must not require them.
- Reminder times (America/Boa_Vista, UTC−4, no DST): **D-7 = `2026-12-20T14:00:00Z`**, **D-1 = `2026-12-26T14:00:00Z`**. Only for guests with `rsvpStatus = 'yes'` and a phone. A reminder whose time has passed when scheduling is not created.
- Spacing between automatic sends: random 20–60 s. Max 3 attempts per reminder; retry after 5 min, then 15 min; then `failed`.
- Invite send: one click = one synchronous send (timeout 15 s); blocked while a `sending` invite exists for that guest or a `sent` one in the last 60 s.
- Success shown only after the server confirms.
- WhatsApp placeholders in templates stay `{nome}` and `{link}` (family-edited copy).

## Review Focus

1. **Evolution offline, slow or misconfigured** (timeout, 401, 5xx, instance closed) → invite button shows "Não foi possível enviar agora." (or the specific not-connected message), dispatch row `failed` with `errorCode`, page keeps working; the dispatcher backs off instead of spinning. Tests in Tasks 1, 3, 5.
2. **Double click / two admins clicking "Enviar convite"** at once → exactly one Evolution call and one `sent` row. Test in Task 3.
3. **RSVP flips yes → no → yes** → reminders cancelled then rescheduled, never duplicated (unique per guest+kind). Test in Task 4.
4. **RSVP after a reminder time** (e.g. confirms on 2026-12-22) → no D-7 row, D-1 row only. Test in Task 4.
5. **Process restarts mid-send** → rows stuck in `sending` for > 10 min return to `scheduled`; two dispatcher ticks never send the same row (SKIP LOCKED). Test in Task 5.

---

## File Structure

```
src/features/whatsapp/
  evolution.ts          HTTP client: getConnectionState, connectQr, logout, sendText; error mapping
  config.ts             readEvolutionConfig(): {url, apiKey, instance} | null
  message.ts            renderTemplate(template, {name, link}) + reminder text variants
  dispatches.ts         repo for message_dispatches (record, last invite per guest, list, schedule/cancel reminders, claim/mark)
  invite.ts             sendInvite(guestId, adminId) service
  reminders.ts          scheduleRemindersForGuest(guest, now), cancelRemindersForGuest(guestId)
  dispatcher.ts         runDispatcherTick(deps) + startDispatcher()
  actions.ts            'use server': sendInviteAction, connectWhatsappAction, logoutWhatsappAction, retryDispatchAction
  __tests__/...
src/instrumentation.ts  register(): start dispatcher in nodejs runtime (not test, not build)
src/app/admin/(protected)/whatsapp/page.tsx
src/components/admin/{SendInviteButton.tsx, WhatsappStatus.tsx, DispatchTable.tsx}
src/server/db/schema.ts (+ messageDispatches, settings.reminderD7Text, settings.reminderD1Text)
tests/e2e/fake-evolution.ts   tiny HTTP server mimicking the 4 Evolution endpoints for e2e
tests/e2e/admin-whatsapp.spec.ts
```

---

### Task 1: Evolution client and config

**Files:**
- Create: `src/features/whatsapp/config.ts`, `src/features/whatsapp/evolution.ts`
- Modify: `.env.example` (`EVOLUTION_URL=`, `EVOLUTION_API_KEY=`, `EVOLUTION_INSTANCE=convite-xv`)
- Test: `src/features/whatsapp/__tests__/evolution.test.ts`

**Interfaces:**
- Produces:
  - `readEvolutionConfig(): { url: string; apiKey: string; instance: string } | null` — null when URL or key missing; `instance` defaults to `convite-xv`; strips trailing `/` from url.
  - `type EvolutionError = 'not_configured' | 'not_connected' | 'invalid_number' | 'timeout' | 'unauthorized' | 'provider_error'`
  - `type EvolutionResult<T> = { ok: true; value: T } | { ok: false; error: EvolutionError }`
  - `getConnectionState(cfg, fetchImpl = fetch): Promise<EvolutionResult<'open' | 'connecting' | 'close'>>` — `GET {url}/instance/connectionState/{instance}` → `body.instance.state`; 404 (instance missing) → `ok: true, value: 'close'`.
  - `connectQr(cfg, fetchImpl = fetch): Promise<EvolutionResult<{ qrDataUrl: string | null }>>` — ensures the instance exists (`POST {url}/instance/create` with `{ instanceName, integration: 'WHATSAPP-BAILEYS', qrcode: true }`, treat 403/409 "already exists" as fine) then `GET {url}/instance/connect/{instance}` → `body.base64` (data URL) or null when already connected.
  - `logout(cfg, fetchImpl = fetch): Promise<EvolutionResult<void>>` — `DELETE {url}/instance/logout/{instance}`.
  - `sendText(cfg, { phoneE164, text }, fetchImpl = fetch): Promise<EvolutionResult<{ messageId: string | null }>>` — `POST {url}/message/sendText/{instance}` body `{ number: digits, text, linkPreview: true }` → `body.key.id`.
  - All calls: header `apikey: cfg.apiKey`, `content-type: application/json`, `AbortSignal.timeout(15_000)`. Mapping: AbortError/TimeoutError → `timeout`; 401/403 (except create) → `unauthorized`; 400 whose body mentions `exists: false` or "number" → `invalid_number`; sendText while state ≠ open (Evolution returns 400/500 "Connection Closed") → `not_connected`; other non-2xx or network error → `provider_error`. Never throw.

- [ ] **Step 1: Write the failing tests** with an injected `fetchImpl` (`vi.fn`):
  - `readEvolutionConfig` → null when `EVOLUTION_URL` missing; `{url:'http://e:8080', apiKey:'k', instance:'convite-xv'}` from `http://e:8080/` + `k`.
  - `sendText` posts to `http://e:8080/message/sendText/convite-xv` with header `apikey: k` and body `{"number":"5595991234567","text":"oi","linkPreview":true}`; returns `{ok:true, value:{messageId:'ABC'}}` for `{key:{id:'ABC'}}`.
  - fetch rejecting with `DOMException('t','TimeoutError')` → `{ok:false,error:'timeout'}`; 401 → `unauthorized`; 500 → `provider_error`; 400 `{"response":{"message":[{"exists":false}]}}` → `invalid_number`; 400 `{"response":{"message":["Connection Closed"]}}` → `not_connected`.
  - `getConnectionState` maps `{instance:{state:'open'}}` → `'open'`, 404 → `'close'`.
  - `connectQr` returns the `base64` data URL; create returning 403 "already in use" still proceeds to connect.
- [ ] **Step 2:** `pnpm vitest run src/features/whatsapp` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(whatsapp): evolution api client` and push.

---

### Task 2: `message_dispatches` table, reminder settings and dispatch repo

**Files:**
- Modify: `src/server/db/schema.ts`, `tests/helpers/db.ts` (truncate new table), `drizzle/` (generated migration)
- Create: `src/features/whatsapp/dispatches.ts`, `src/features/whatsapp/message.ts`
- Test: `src/features/whatsapp/__tests__/dispatches.test.ts`, `message.test.ts`

**Interfaces:**
- Produces (schema):
  - enum `dispatch_kind` (`invite`, `reminder_d7`, `reminder_d1`); enum `dispatch_status` (`scheduled`, `sending`, `sent`, `failed`, `cancelled`).
  - table `message_dispatches`: `id uuid pk`, `guestId uuid not null fk guests on delete cascade`, `kind`, `status`, `attempts int default 0`, `errorCode text null`, `providerMessageId text null`, `adminId uuid null fk admins on delete set null`, `scheduledFor timestamptz null`, `sentAt timestamptz null`, `createdAt`, `updatedAt`; index `(status, scheduled_for)`; **partial unique index** `(guest_id, kind) where kind <> 'invite'`.
  - `settings.reminderD7Text text not null` default (exact): `Olá, {nome}! Falta uma semana para os 15 anos da Isabella. Domingo, 27/12, às 10h, no Sítio Lua Azul (Cantá–RR). Traje livre e roupa de banho para a piscina. Seu convite: {link}`
  - `settings.reminderD1Text text not null` default (exact): `Olá, {nome}! É amanhã: 15 anos da Isabella, domingo às 10h no Sítio Lua Azul. Como chegar e todos os detalhes: {link}`
  - Types `MessageDispatch`, `DispatchKind`, `DispatchStatus`.
- Produces (`message.ts`):
  - `renderTemplate(template: string, v: { name: string; link: string }): string` — single-pass `/\{(nome|link)\}/g` replace; `{nome}` = first name. Refactor `whatsappUrl` (src/features/guests/whatsapp.ts) to use it.
  - `varyGreeting(text: string, seed: number): string` — replaces a leading `Olá,` with one of `['Olá,', 'Oi,', 'Olá!']`-style variants by `seed % 3` (keeps the rest identical).
- Produces (`dispatches.ts`):
  - `createInviteDispatch(guestId, adminId): Promise<{ id: string } | { blocked: true }>` — inside one transaction: `SELECT ... FROM message_dispatches WHERE guest_id = $1 AND kind = 'invite' AND (status = 'sending' OR (status = 'sent' AND sent_at > now() - interval '60 seconds')) FOR UPDATE` on the guest row (`SELECT id FROM guests WHERE id=$1 FOR UPDATE`) to serialize; if found → `{blocked:true}`; else insert `status='sending'`, `attempts=1`.
  - `markDispatchSent(id, providerMessageId)`, `markDispatchFailed(id, errorCode)`.
  - `lastInvitePerGuest(): Promise<Map<string, { status: DispatchStatus; at: Date }>>` — latest invite row per guest (`DISTINCT ON (guest_id) ... ORDER BY guest_id, created_at DESC`); `at` = `sentAt ?? createdAt`.
  - `listDispatches(filter?: { kind?: DispatchKind; status?: DispatchStatus }): Promise<Array<MessageDispatch & { guestName: string }>>` — newest first, limit 500.
  - `upsertReminder(guestId, kind: 'reminder_d7' | 'reminder_d1', scheduledFor: Date)` — insert or, on conflict (guest_id, kind), set `status='scheduled', scheduledFor, attempts=0, errorCode=null` **only if current status is `cancelled` or `scheduled`** (never resurrect a `sent`).
  - `cancelReminders(guestId)` — `scheduled` → `cancelled`.
  - `claimDueReminder(now: Date): Promise<MessageDispatch | null>` — `UPDATE message_dispatches SET status='sending', attempts=attempts+1, updated_at=now() WHERE id = (SELECT id FROM message_dispatches WHERE status='scheduled' AND kind <> 'invite' AND scheduled_for <= $now ORDER BY scheduled_for LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *`.
  - `rescheduleReminder(id, at: Date, errorCode)` (back to `scheduled`), `recoverStuckSending(now)` — `sending` with `updated_at < now - 10 min` → `scheduled` (reminders) / `failed` with `errorCode='interrupted'` (invites). Returns count.

- [ ] **Step 1: Write the failing tests:**
  - message: `renderTemplate('Olá, {nome}! {link} {nome}', {name:'João Ávila', link:'https://x/c/t'})` → `'Olá, João! https://x/c/t João'`; a name containing `{link}` is not re-substituted; `varyGreeting('Olá, Ana!...', 0..2)` yields 3 different prefixes and identical tails.
  - dispatches: invite blocked while a `sending` exists and within 60 s after `sent`, allowed after 61 s (set `sent_at` explicitly); concurrent `createInviteDispatch` ×2 via `Promise.all` → exactly one `{id}` and one `{blocked:true}` (Review Focus 2); `upsertReminder` twice → one row; after `cancelReminders` + `upsertReminder` → `scheduled` again; `upsertReminder` on a `sent` row leaves it `sent`; `claimDueReminder` returns null before `scheduled_for`, the row after; two concurrent claims return two different rows or one row + null, never the same id twice (Review Focus 5); `recoverStuckSending` moves an 11-min-old reminder `sending` → `scheduled` and an invite → `failed/interrupted`; deleting a guest cascades its dispatches.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Schema + `pnpm db:generate` + implement. **Step 4:** Run → PASS (full `pnpm test` too).
- [ ] **Step 5:** Commit `feat(whatsapp): message dispatch log and reminder settings` and push.

---

### Task 3: Send invite (service, action, button)

**Files:**
- Create: `src/features/whatsapp/invite.ts`, `src/features/whatsapp/actions.ts`, `src/components/admin/SendInviteButton.tsx`
- Modify: `src/app/admin/(protected)/guests/page.tsx` (column "WhatsApp" with button + last status), `src/components/admin/GuestRowActions.tsx` if the button lives there
- Test: `src/features/whatsapp/__tests__/invite.test.ts`, `tests/e2e/fake-evolution.ts`, `tests/e2e/admin-whatsapp.spec.ts`, `playwright.config.ts` (start fake server, set `EVOLUTION_URL=http://127.0.0.1:4010`, `EVOLUTION_API_KEY=test-key`)

**Interfaces:**
- Consumes: Task 1 client/config, Task 2 dispatch repo + `renderTemplate`, `findGuestById`, `getSettings`, `inviteUrl`, `requireAdmin`, `logger`.
- Produces:
  - `type SendInviteResult = { ok: true; sentAt: string } | { ok: false; error: 'not_configured' | 'not_connected' | 'no_phone' | 'not_found' | 'blocked' | 'invalid_number' | 'failed' }`
  - `sendInvite(guestId: string, adminId: string, deps = { sendText, readEvolutionConfig }): Promise<SendInviteResult>` — order: config → guest (not_found) → phone (no_phone) → `createInviteDispatch` (blocked) → render `whatsappInviteTemplate` with guest name + `inviteUrl(token)` → `sendText` → mark sent/failed → log `whatsapp.invite_sent` / `whatsapp.invite_failed` `{ guestId, adminId, errorCode }`. Map client errors: `not_connected`/`invalid_number` pass through; `timeout`/`unauthorized`/`provider_error` → `failed`.
  - `sendInviteAction(prev, formData /* guestId */): Promise<SendInviteResult>` — `requireAdmin()` first, uuid validation, then `sendInvite`, then `revalidatePath('/admin/guests')`.
  - `inviteErrorMessage(e)` (pt-BR): `not_configured` "WhatsApp não configurado."; `not_connected` "Conecte o WhatsApp na aba WhatsApp do painel."; `no_phone` "Cadastre o telefone do convidado."; `not_found` "Convidado não encontrado."; `blocked` "Envio em andamento. Aguarde um minuto."; `invalid_number` "Este número não tem WhatsApp."; `failed` "Não foi possível enviar agora. Tente de novo."
  - UI: per guest — no phone: muted "Sem telefone"; never sent: button "Enviar convite"; last sent: text "Enviado em dd/mm às HH:MM" (Boa Vista) + small button "Reenviar" that first shows inline "Já enviado em … — enviar de novo?" with "Enviar de novo" / "Cancelar"; last failed: "Falhou" + "Tentar de novo". Button shows "Enviando…" and is disabled while pending. The wa.me link stays as "Abrir no WhatsApp" (manual alternative).
  - `tests/e2e/fake-evolution.ts`: `startFakeEvolution(port = 4010)` HTTP server implementing `POST /instance/create`, `GET /instance/connect/:i` (returns a tiny PNG data URL first time, then `{}` once "connected"), `GET /instance/connectionState/:i`, `DELETE /instance/logout/:i`, `POST /message/sendText/:i` (records calls; returns `{key:{id:'FAKE-n'}}`; number `5500000000000` → 400 `exists:false`); checks `apikey: test-key` (401 otherwise); control endpoints `POST /__state {state}` and `GET /__calls` for tests. Started/stopped in Playwright globalSetup/teardown.

- [ ] **Step 1: Write the failing tests:**
  - unit (`invite.test.ts`, injected deps): sends rendered text (`Olá, Ana! https://…/c/<token>` with the default template) to the guest's phone and records `sent` with messageId; `not_configured` when config null (no DB row created); `no_phone`; `invalid_number` → row `failed` with `errorCode='invalid_number'`; timeout → `failed`; second call within 60 s → `blocked` and `sendText` called once (Review Focus 2); unknown guest → `not_found`.
  - e2e (`admin-whatsapp.spec.ts`, own fake XFF IP `203.0.113.24`): with fake state `open`, create guest "Zé Teste" with phone, click "Enviar convite" → "Enviado em" appears and `/__calls` has one call whose `number` is the guest digits and whose text contains `/c/`; "Reenviar" asks confirmation; with fake state `close` → "Conecte o WhatsApp na aba…" message; guest without phone shows "Sem telefone". Clean up its guests.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** `pnpm test`, `pnpm test:e2e` (sequentially) → PASS.
- [ ] **Step 5:** Commit `feat(whatsapp): send invite one by one with dispatch log` and push.

---

### Task 4: Schedule and cancel reminders from RSVP and admin edits

**Files:**
- Create: `src/features/whatsapp/reminders.ts`
- Modify: `src/features/rsvp/service.ts` (after a successful write), `src/features/guests/actions.ts` (`saveGuestAction`: phone added/changed on a `yes` guest)
- Test: `src/features/whatsapp/__tests__/reminders.test.ts`, extend `src/features/rsvp/__tests__/service.test.ts`

**Interfaces:**
- Consumes: Task 2 `upsertReminder`, `cancelReminders`.
- Produces:
  - `REMINDER_TIMES = { reminder_d7: new Date('2026-12-20T14:00:00Z'), reminder_d1: new Date('2026-12-26T14:00:00Z') } as const`
  - `syncRemindersForGuest(g: Pick<Guest, 'id' | 'rsvpStatus' | 'phone'>, now: Date): Promise<void>` — `yes` + phone → `upsertReminder` for each time `> now`; otherwise `cancelReminders`.
  - `submitRsvp` calls `syncRemindersForGuest(updatedGuest, now)` after the update; failure to schedule is logged (`whatsapp.reminder_sync_failed`, `{ guestId, err }`) and does NOT fail the RSVP.

- [ ] **Step 1: Write the failing tests:**
  - yes + phone at 2026-11-01 → two `scheduled` rows at the exact times; yes without phone → none; yes at 2026-12-22T00:00Z → only `reminder_d1` (Review Focus 4); after 2026-12-26T14:00Z → none.
  - yes → no → yes (service-level via `submitRsvp`) → final state two `scheduled` rows, no duplicates (Review Focus 3); no → rows `cancelled`.
  - `saveGuestAction` adding a phone to a `yes` guest schedules reminders (unit-test `syncRemindersForGuest` call path via the repo state).
  - RSVP still returns `ok:true` when scheduling throws (stub `upsertReminder` to throw with `vi.spyOn`).
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(whatsapp): schedule reminders on rsvp` and push.

---

### Task 5: Reminder dispatcher

**Files:**
- Create: `src/features/whatsapp/dispatcher.ts`, `src/instrumentation.ts`
- Test: `src/features/whatsapp/__tests__/dispatcher.test.ts`

**Interfaces:**
- Consumes: Task 1 `sendText`/`getConnectionState`/`readEvolutionConfig`, Task 2 claim/mark/reschedule/recover + `renderTemplate`/`varyGreeting`, `findGuestById`, `getSettings`, `inviteUrl`, `logger`.
- Produces:
  - `type DispatcherDeps = { now: () => Date; sleep: (ms: number) => Promise<void>; random: () => number; sendText; getConnectionState; readEvolutionConfig }`
  - `runDispatcherTick(deps): Promise<{ sent: number; failed: number; skipped: 'not_configured' | 'not_connected' | null }>` — config null → skip; state ≠ `open` → skip (log `whatsapp.dispatcher_paused` once per state change); `recoverStuckSending(now)`; loop: `claimDueReminder(now)` → none → return; guest gone, status ≠ `yes` or no phone → mark `cancelled`; else render `reminderD7Text`/`reminderD1Text` with `varyGreeting(text, attempts+guest-id hash)`, `sendText`; ok → `markDispatchSent`; error → if `attempts < 3` `rescheduleReminder(id, now + (attempts===1 ? 5 : 15) min, code)` else `markDispatchFailed`; `not_connected` stops the tick (row rescheduled +5 min, not counted as attempt — decrement or don't increment); between sends `await sleep(20_000 + random()*40_000)`. Max 30 sends per tick.
  - `startDispatcher(): void` — idempotent (global flag), `setInterval(tick, 60_000)` with a `running` guard; never throws (catch + log `whatsapp.dispatcher_error` with `err`).
  - `src/instrumentation.ts` `export async function register()` — only when `process.env.NEXT_RUNTIME === 'nodejs'` and `NODE_ENV !== 'test'` and not during build (`process.env.NEXT_PHASE !== 'phase-production-build'`): dynamic-import and call `startDispatcher()`. Check node_modules/next/dist/docs for instrumentation in Next 16.

- [ ] **Step 1: Write the failing tests** (real DB, injected deps, fake `sleep` recording ms):
  - two due reminders → both sent in order with one sleep between of 20 000–60 000 ms; rows `sent` with `providerMessageId`.
  - text uses the settings template with first name and invite link; greeting varies.
  - `timeout` on first attempt → rescheduled `+5 min`, `attempts=1`; third failure → `failed`.
  - state `close` → `skipped:'not_connected'`, no claim made, rows untouched (Review Focus 1).
  - guest switched to `no` after scheduling → row `cancelled`, nothing sent.
  - stuck `sending` 11 min old is recovered and sent in the same tick (Review Focus 5).
  - config null → `skipped:'not_configured'`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** `pnpm test`, `pnpm build` (instrumentation compiles, dispatcher not started at build) → PASS.
- [ ] **Step 5:** Commit `feat(whatsapp): reminder dispatcher` and push.

---

### Task 6: Admin WhatsApp page and reminder texts in settings

**Files:**
- Create: `src/app/admin/(protected)/whatsapp/page.tsx`, `src/components/admin/WhatsappStatus.tsx`, `src/components/admin/DispatchTable.tsx`
- Modify: `src/features/whatsapp/actions.ts` (`connectWhatsappAction`, `logoutWhatsappAction`, `retryDispatchAction`), admin layout nav (add "WhatsApp" → `/admin/whatsapp`), `src/features/settings/schema.ts` + `SettingsForm.tsx` + `actions.ts` (fields `reminderD7Text`, `reminderD1Text`, ≤600 chars, must contain `{link}`)
- Test: extend `tests/e2e/admin-whatsapp.spec.ts`, `src/features/settings/__tests__/settings.test.ts`

**Interfaces:**
- Consumes: Tasks 1–2, `requireAdmin`.
- Produces:
  - Page (all loaders call `requireAdmin()`): status card — "Conectado" (sage) / "Desconectado" / "Conectando…" / "WhatsApp não configurado" (when env missing, with a one-line hint for the family to contact Felipe); when disconnected a button "Conectar número" → `connectWhatsappAction` returns the QR data URL, shown as `<img alt="QR Code para conectar o WhatsApp">` with "Abra o WhatsApp no celular › Aparelhos conectados › Conectar aparelho" and a "Já escaneei" button that refreshes status; when connected "Desconectar" (inline confirmation). A short warning: "Use um chip dedicado, não o número pessoal da família."
  - Dispatch table: columns Convidado, Tipo (Convite / Lembrete 7 dias / Lembrete véspera), Situação (Agendado / Enviando / Enviado / Falhou / Cancelado), Quando (scheduled or sent time, Boa Vista), Erro (pt-BR label of `errorCode`); filters by tipo and situação (query params); on failed reminders a "Tentar de novo" button (`retryDispatchAction(id)` → `scheduled` now, attempts reset) — failed invites link to the guest list instead.
  - Settings: two textareas "Lembrete 7 dias antes" and "Lembrete na véspera"; validation "A mensagem precisa conter {link}."
  - Log `admin.whatsapp_connect_requested`, `admin.whatsapp_logout`, `admin.dispatch_retry` `{ adminId, dispatchId? }`.

- [ ] **Step 1: Write the failing tests:**
  - e2e: unauthenticated `GET /admin/whatsapp` → 307; fake state `close` → "Desconectado", click "Conectar número" → QR `<img>` visible; set fake state `open` + "Já escaneei" → "Conectado"; dispatch table lists the invite sent in Task 3's spec flow (seed a dispatch directly via test DB helper if independent) and filters by "Lembrete véspera"; failed reminder → "Tentar de novo" → row becomes "Agendado".
  - unit: settings rejects reminder text without `{link}`; saves valid texts.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** `pnpm test`, `pnpm test:e2e` → PASS.
- [ ] **Step 5:** Commit `feat(admin): whatsapp connection and dispatch history` and push.

---

### Task 7: Evolution API service on Railway and docs

**Files:**
- Modify: `docker-compose.yml` (optional `evolution` service for local dev, profile `whatsapp`, using the same Postgres with `?schema=evolution`), `README.md` (WhatsApp section: chip dedicado, como conectar, variáveis, riscos de banimento e boas práticas), `.env.example`

**Steps:**
- [ ] **Step 1:** Look up the current official Evolution API v2 Docker image and its required env vars (docs at doc.evolution-api.com): at least `AUTHENTICATION_API_KEY`, `SERVER_URL`, `DATABASE_ENABLED=true`, `DATABASE_PROVIDER=postgresql`, `DATABASE_CONNECTION_URI` (Railway Postgres private URL + `?schema=evolution`), `CACHE_REDIS_ENABLED=false`, `CACHE_LOCAL_ENABLED=true`, `DEL_INSTANCE=false`, and persistence for instance sessions (DB-backed in v2; add a volume at the instances path only if the docs require it). Record the chosen image tag in the README.
- [ ] **Step 2 (needs Felipe's confirmation before running — outward side effect):** create Railway service `evolution` from that image in project `convite-xv` (production), **no public domain** (private network only), set its variables; set on `convite-xv` web service `EVOLUTION_URL=http://evolution.railway.internal:<port>`, `EVOLUTION_API_KEY` (random 32+ chars, shared, never printed), `EVOLUTION_INSTANCE=convite-xv`; redeploy web; verify `/admin/whatsapp` shows "Desconectado" (reachable) rather than "não configurado".
- [ ] **Step 3:** Felipe scans the QR with the dedicated chip; send one invite to Felipe's own test guest; confirm it arrives with the letter preview; check `message_dispatches` row and logs (no phone/text in logs).
- [ ] **Step 4:** Commit `docs: whatsapp setup and evolution service` and push.

---

## Order and deadline

Tasks 1 → 2 → 3 (invite sending usable) → 7 (deploy Evolution, connect the chip) → 4 → 5 → 6. Goal: invite sending live and tested with a real phone by **~25/11/2026**; reminders live before **20/12/2026** (first D-7 send).
