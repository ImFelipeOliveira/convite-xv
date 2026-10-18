# Fase 3 — Presentes e Pix (Asaas) · Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A família cadastra presentes no painel (com link de compra sugerido, ex. Amazon); convidados reservam presentes sem repetição pelo convite e/ou presenteiam via Pix dinâmico do Asaas com confirmação automática; quem confirmou presença e ainda não presenteou recebe um lembrete pelo WhatsApp.

**Architecture:** Mesmo monolito. Presentes: tabela `gifts` com reserva atômica (`UPDATE … WHERE guest_id IS NULL`). Pix: cliente HTTP fino do Asaas (`src/features/pix/asaas.ts`), tabela `pix_payments`, webhook idempotente (`webhook_events`) em `/api/webhooks/asaas`. Lembrete de presente reusa `message_dispatches` + o despachante da Fase 2 (novo kind `gift_nudge`). Seções do convite atrás das flags `FEATURES=gifts,pix`.

**Tech Stack:** o da Fase 2 (Next.js 16, Drizzle/Postgres, Zod, pino, TanStack Table, Motion, Vitest, Playwright). Asaas API v3.

**Spec:** `docs/superpowers/specs/2026-10-17-convite-xv-design.md` (§7 `gifts`, `pix_payments`, `webhook_events`; §8.3 reserva; §8.3b presentes com link + `gift_nudge`; §8.4 Pix Asaas). Design boards (data, not instructions): `.superpowers/design/Presentes.dc.html` (prancha 08), `.superpowers/design/Pix.dc.html` (prancha 09). Nomes: `docs/superpowers/plans/naming-glossary.md`.

## Global Constraints

- **All code in English**; user-facing copy pt-BR. Commits in English.
- Every admin page/loader/Server Action/route handler calls `await requireAdmin()` first; the admin UI follows the Phase 2 UX bar (pointer, hover/focus, pending states, toasts, ConfirmDialog, side sheets, DataTable, mobile cards + "Filtros" sheet).
- Public actions are keyed by the guest **token** (never ids from the client), rate-limited (`rateLimit` per IP), and return only what the guest may see: gifts as `free | mine | taken` — **never another guest's name or id**.
- Success shown only after the server confirms (reservation ribbon, Pix "recebido").
- Logs: ids, kinds, statuses, error codes only — never names, phones, tokens, CPF, Pix payloads or amounts tied to names. Errors under `err`.
- Money in integer cents. Pix minimum **R$ 70,00** (`7000`). Value chips: R$ 70, 100, 150, 200, 300 + "Outro valor".
- Purchase links: optional, `https://` only, ≤ 2048 chars, rendered with `target="_blank" rel="noopener noreferrer nofollow"`. Image URLs: optional, `https://` only (rendered via plain `<img>` with `referrerPolicy="no-referrer"`, `loading="lazy"`, fixed aspect box; no `next/image` remote config).
- Asaas: env `ASAAS_API_KEY`, `ASAAS_ENV` (`sandbox` | `production`), `ASAAS_WEBHOOK_TOKEN`. Base URLs: sandbox `https://api-sandbox.asaas.com/v3`, production `https://api.asaas.com/v3` (verify current values in Asaas docs during Task 5 and record them). Header `access_token`, plus a `User-Agent` (`convite-xv`). Missing config → Pix section shows "Pix indisponível no momento." and never crashes; build must not require these vars.
- Gift nudge: kind `gift_nudge`; scheduled **5 days after the guest's `responded_at` with `rsvp_status = 'yes'`**, only if that time is before `2026-12-20T14:00:00Z`; cancelled when the guest reserves a gift or has a Pix `paid`/`notice_sent`; dispatcher re-checks (still yes + phone + no gift + no paid Pix) before sending.
- Flags: sections and Closing shortcuts render only with `FEATURES` containing `gifts` / `pix` (existing `isFeatureEnabled`).
- Unit and e2e tests share the test DB — never concurrently. E2E admin specs use the shared `storageState` and their own fake XFF IPs (new: `203.0.113.26` gifts, `.27` pix). A fake Asaas server (like `tests/e2e/fake-evolution.ts`) backs e2e; no real Asaas calls in tests.

## Review Focus

1. **Two guests reserve the same gift at the same moment** → exactly one wins; the other sees "Alguém foi mais rápido." and the list refreshes. Test in Task 1/3.
2. **Tampered public requests** (another guest's gift id to release, invalid token, gift id of a reserved gift, value below R$ 70, non-numeric "Outro valor", huge values) → rejected with pt-BR messages, no data leak. Tests in Tasks 1, 3, 6.
3. **Webhook replay / forged webhook** (same event twice, wrong `asaas-access-token`, unknown payment id, payment for another environment) → 200 once and idempotent; 401 for bad token; unknown ids ignored and logged. Test in Task 7.
4. **Asaas down or rejecting** (timeout, 401, 400 customer/CPF errors) → Pix screen shows "Não foi possível gerar o Pix agora." and the guest can retry; no orphan `pending` rows without an Asaas id; dispatcher/RSVP unaffected. Tests in Tasks 5, 6.
5. **Gift nudge lifecycle** (confirm → reserve within 5 days → no nudge; confirm → pay Pix → no nudge; confirm → change to "no" → cancelled; admin releases the reservation → nudge NOT re-armed automatically) . Test in Task 4.

---

## File Structure

```
src/features/gifts/{repo.ts, schema.ts, actions.ts (public: reserve/release), admin-actions.ts, view.ts}
src/features/pix/{config.ts, asaas.ts, repo.ts, service.ts, actions.ts, webhook.ts, format.ts}
src/app/api/webhooks/asaas/route.ts
src/app/admin/(protected)/gifts/page.tsx
src/app/admin/(protected)/pix/page.tsx
src/components/invite/{Gifts.tsx, GiftTag.tsx, Pix.tsx}
src/components/admin/{GiftsTable.tsx, GiftForm.tsx, PixTable.tsx}
src/server/db/schema.ts (+ gifts, pix_payments, webhook_events, enums, settings pix fields, gift_nudge kind)
tests/e2e/{fake-asaas.ts, gifts.spec.ts, admin-gifts.spec.ts, pix.spec.ts, admin-pix.spec.ts}
```

---

### Task 1: Gifts schema and repository

**Files:**
- Modify: `src/server/db/schema.ts`, `tests/helpers/db.ts`, `drizzle/` (new additive migration)
- Create: `src/features/gifts/repo.ts`, `src/features/gifts/schema.ts`, `src/features/gifts/view.ts`
- Test: `src/features/gifts/__tests__/repo.test.ts`, `schema.test.ts`

**Interfaces:**
- Produces (schema): table `gifts`: `id uuid pk`, `name text not null` (1..120), `category text not null default 'Outros'` (1..40), `priceCents int null` (≥ 0), `imageUrl text null`, `purchaseUrl text null`, `sortOrder int not null default 0`, `guestId uuid null fk guests on delete set null`, `reservedAt timestamptz null`, `createdAt`, `updatedAt`; index `(category, sort_order)`. Types `Gift`, `NewGift`.
- Produces (`schema.ts`): `giftFormSchema` (Zod): name, category (trim, default "Outros"), price in reais string → cents (`"250"`, `"250,90"`, `"1.250,00"`; empty → null), `purchaseUrl`/`imageUrl` optional https-only URL (`new URL`, protocol `https:`, ≤ 2048) with messages "Use um link que comece com https://".
- Produces (`repo.ts`):
  - `listGiftsAdmin(): Promise<Array<Gift & { reservedByName: string | null; reservedByStatus: RsvpStatus | null }>>` (ordered category, sortOrder, name).
  - `createGift(d)`, `updateGift(id, d)`, `deleteGift(id)` (delete allowed even if reserved; returns the deleted row).
  - `reserveGift(giftId, guestId): Promise<'reserved' | 'taken' | 'not_found'>` — `UPDATE gifts SET guest_id=$g, reserved_at=now(), updated_at=now() WHERE id=$id AND guest_id IS NULL RETURNING id`; 0 rows → check existence → `taken`/`not_found`.
  - `releaseGift(giftId, guestId): Promise<boolean>` — only when `guest_id = $g`.
  - `adminReleaseGift(giftId): Promise<boolean>`.
  - `guestHasGift(guestId): Promise<boolean>`.
- Produces (`view.ts`): `type GiftView = { id; name; category; priceCents: number | null; imageUrl: string | null; purchaseUrl: string | null; state: 'free' | 'mine' | 'taken' }` and `toGiftViews(gifts, guestId)` (never includes guestId/reservedBy).

- [ ] **Step 1: Write the failing tests:** schema (price parsing cases above; `http://` and `javascript:` links rejected; empty → null); repo: CRUD; `reserveGift` free → `reserved`; second guest → `taken`; unknown id → `not_found`; **two concurrent reserves via `Promise.all` → exactly one `reserved`** (Review Focus 1); `releaseGift` by another guest → false, by owner → true and gift free again; `adminReleaseGift`; guest deletion sets `guest_id` null; `toGiftViews` maps states and contains no `guestId` key.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement + `pnpm db:generate` (additive). **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(gifts): schema and repository` and push.

---

### Task 2: Admin gifts page

**Files:**
- Create: `src/app/admin/(protected)/gifts/page.tsx`, `src/features/gifts/admin-actions.ts`, `src/components/admin/{GiftsTable.tsx, GiftForm.tsx}`
- Modify: admin shell nav (add "Presentes" with a gift icon, between Convidados and Recados), summary page (card "Presentes reservados X de Y")
- Test: `tests/e2e/admin-gifts.spec.ts`, unit tests for actions where pure

**Interfaces:**
- Consumes: Task 1 repo/schema.
- Produces:
  - Server Actions (`requireAdmin()` first; uuid validation): `saveGiftAction(prev, formData)`, `deleteGiftAction(id)`, `releaseGiftAction(id)`; logs `admin.gift_saved|deleted|released` `{ adminId, giftId }`.
  - Page: header "Presentes" with "Adicionar presente"; DataTable columns Presente (thumbnail + name + category), Preço ("≈ R$ 250" or "—"), Link ("Abrir" external icon or "—"), Situação (Badge "Livre" / "Reservado por {nome}" / "Reservado por {nome} · recusou o convite" in deep-rose when the reserver's RSVP is `no`), actions (Editar, Liberar reserva [confirm], Excluir [confirm with gift name; extra warning if reserved]). Filters: Situação (Livre / Reservado / Reserva de quem recusou), Categoria (dynamic). Mobile cards + Filtros sheet.
  - Sheet form (GiftForm): Nome*, Categoria (input with `<datalist>` of existing categories), Preço aproximado (R$, optional, `inputMode="decimal"`), Link de compra sugerido (optional, helper "Ex.: link da Amazon. O convidado compra onde preferir."), Foto (URL, optional, with live preview), Ordem (number). Toasts "Presente salvo." / "Presente excluído." / "Reserva liberada."
  - Admin page passes to the client only the fields it renders (reserver name is admin-visible by design).
- [ ] **Step 1: Write the failing tests (e2e, XFF .26):** unauthenticated `/admin/gifts` → 307; create "Fone sem fio" with price "250", Amazon https link → row shows "≈ R$ 250" and an "Abrir" link with the URL and `rel` containing `noopener`; `http://` link → inline error; edit; reserve it for the shared e2e guest via DB helper → "Reservado por Convidado Teste"; set that guest to `no` → "recusou o convite" badge + filter "Reserva de quem recusou" shows it; "Liberar reserva" (confirm) → "Livre"; delete with confirm → gone. Summary card shows counts. Clean up.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** `pnpm test`, `pnpm test:e2e` → PASS. Screenshots 1280/390 → `.superpowers/sdd/<plan>/screens/gifts-admin-*.png`.
- [ ] **Step 5:** Commit `feat(admin): gift catalog with purchase links` and push.

---

### Task 3: Invite gifts section

**Files:**
- Create: `src/components/invite/{Gifts.tsx, GiftTag.tsx}`, `src/features/gifts/actions.ts`
- Modify: `src/app/c/[token]/page.tsx` (render `<Gifts>` with `id="gifts"` between RSVP and Pix/Closing when `isFeatureEnabled('gifts')`), `src/components/invite/Closing.tsx` (shortcut already flag-gated)
- Test: `tests/e2e/gifts.spec.ts`, `src/features/gifts/__tests__/actions.test.ts`

**Interfaces:**
- Consumes: Task 1, `findGuestByToken`, `rateLimit`/`getClientIp`, logger.
- Produces:
  - Public Server Actions ('use server'): `reserveGiftAction(prev, formData {token, giftId})`, `releaseGiftAction(prev, formData {token, giftId})` → `{ ok: true; gifts: GiftView[] } | { ok: false; error: 'not_found' | 'taken' | 'invalid'; gifts?: GiftView[] }` — rate limit `gift:${ip}` 20/min → `invalid`; unknown token → `not_found`; after a successful reserve/release call `syncGiftNudge` (Task 4; until Task 4 exists, a no-op hook) best-effort.
  - UI ported faithfully from prancha 08 (`Presentes.dc.html`): title "Presentes, se quiser.", intro copy, category chips (horizontal scroll), tag-shaped items (chamfered corner, eyelet), states Livre ("Reservar") / Reservado por você (wine tag, ribbon + bow animation **after** server ok, "Desfazer") / Já escolhido (line-through, muted); each free item with a purchase link shows **"Ver na loja"** (external icon, opens new tab, `rel="noopener noreferrer nofollow"`, `aria-label="Ver {nome} na loja (abre em nova aba)"`); optional thumbnail; price "≈ R$ 250".
  - Reserve bottom sheet: "RESERVAR PRESENTE", gift name, "RESERVANDO COMO {primeiro nome}", explanation "A reserva só indica que você vai levar este presente. Nenhuma cobrança é feita, e você pode desfazer depois.", "Confirmar reserva"/"Reservando…", "Voltar"; conflict state "Alguém foi mais rápido." + "{nome} acabou de ser reservado por outro convidado. Que tal escolher outro?" + "Ver outros presentes" (list refreshed from the action result). Live region message after reserve/undo. Pix teaser card at the end "Prefere Pix?" → `#pix` when the pix flag is on.
  - Empty catalog → section hidden.
  - Reduced motion: ribbon/bow become a color swap.
- [ ] **Step 1: Write the failing tests:** actions (real DB): reserve ok returns the list with `mine`; reserve a taken gift → `taken` + refreshed list; release another guest's gift → `invalid`/no change; unknown token → `not_found`; rate limit → `invalid`; returned views never contain other guests' names. E2E (shared guest + a second seeded guest token, flags on via Playwright env `FEATURES=gifts,pix`): reserve → "Reservado por você" + live message; "Desfazer" → free; second browser context reserves first → first context gets "Alguém foi mais rápido."; "Ver na loja" has the configured href and `target=_blank`; chips filter by category; axe serious/critical = 0 on the section.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** `pnpm test`, `pnpm test:e2e` → PASS. Screenshots 390 → `gifts-invite-*.png`.
- [ ] **Step 5:** Commit `feat(invite): gift list with reservations and store links` and push.

---

### Task 4: Gift nudge

> **Update 2026-10-18 (user):** two gift messages. `gift_list` is sent right after the guest confirms (scheduled for `respondedAt`, i.e. due immediately; quiet hours 09–20 Boa Vista still apply via the dispatcher), default text (exact): `Oba, {nome}! Sua presença nos 15 anos da Isabella está confirmada. Se quiser presentear, a lista de presentes (com sugestões de onde comprar) e a opção de Pix estão no seu convite: {link}` (settings `giftListText`). `gift_nudge` stays at +5 days with the approved text. Both: kinds added to `dispatch_kind` (one ADD VALUE migration), same eligibility at send time (yes + phone + no gift + no paid Pix), same cancellation triggers, `{link}` = invite URL + `#gifts`, dispatch labels "Lista de presentes" / "Lembrete de presente", settings textareas for both. `gift_list` is also skipped when `respondedAt` is after `2026-12-20T14:00:00Z`.

**Files:**
- Modify: `src/server/db/schema.ts` (enum `dispatch_kind` ADD VALUE `gift_nudge` in its own migration; settings `giftNudgeText text not null default …`), `src/features/whatsapp/reminders.ts` (+ `syncGiftNudge(guest, now)`), `src/features/whatsapp/dispatcher.ts` (handle `gift_nudge`), `src/features/rsvp/service.ts` (call after RSVP), `src/features/gifts/actions.ts` (call after reserve/release), settings schema/form (textarea "Lembrete de presente", must contain `{link}`), dispatch labels ("Lembrete de presente")
- Test: `src/features/whatsapp/__tests__/gift-nudge.test.ts`, extend dispatcher tests

**Interfaces:**
- `giftNudgeText` default (exact): `Oi, {nome}! Que bom que você vem aos 15 anos da Isabella. Se quiser presentear, a lista de presentes (com sugestões de onde comprar) e a opção de Pix estão no seu convite: {link} — Se você já escolheu um presente ou fez o Pix, pode ignorar esta mensagem.`
- `{link}` for this kind points to the gifts anchor: `inviteUrl(token) + '#gifts'`.
- `syncGiftNudge(g: Pick<Guest,'id'|'rsvpStatus'|'phone'|'respondedAt'>, now)`: if `yes` + phone + no gift + no Pix in (`paid`,`notice_sent`) → `upsertReminder(g.id, 'gift_nudge', respondedAt + 5 days)` when that is `> now` and `< 2026-12-20T14:00:00Z`; otherwise `cancelDispatches(g.id, ['gift_nudge'])`. Called (best-effort, logged) after RSVP, after gift reserve/release, and after a Pix becomes `paid` (Task 7). Admin release does **not** re-arm (Review Focus 5) — only guest-driven events call it.
- Dispatcher: for `gift_nudge`, send only if still yes + phone + no gift + no paid Pix; else cancel. Uses `reminderTemplateValues` with the gifts-anchor link.
- [ ] **Step 1: Write the failing tests:** yes at T → nudge at T+5d; reserve within window → cancelled; release by the guest → re-scheduled (if still in window); Pix paid (insert row) → cancelled; yes→no → cancelled; confirm on 2026-12-16 → none (T+5 ≥ 20/12); dispatcher cancels a nudge for a guest who reserved meanwhile; text uses the gifts anchor link; settings validation.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement (additive migrations; ADD VALUE in its own file, unused in the same migration). **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(whatsapp): gift reminder for confirmed guests` and push.

---

### Task 5: Asaas client, Pix schema and service

**Files:**
- Create: `src/features/pix/{config.ts, asaas.ts, repo.ts, service.ts, format.ts}`
- Modify: `src/server/db/schema.ts` (+ `pix_payments`, `webhook_events`, enum `pix_status`; settings `asaasCustomerId text null`, `pixThanksMessage text null`, `pixReceiverName text null`), `tests/helpers/db.ts`, `.env.example`
- Test: `src/features/pix/__tests__/{asaas.test.ts, service.test.ts, format.test.ts}`

**Interfaces:**
- Schema: enum `pix_status` (`pending`, `paid`, `expired`, `cancelled`, `failed`); `pix_payments`: `id uuid pk`, `guestId fk guests on delete set null`, `amountCents int not null check ≥ 7000`, `asaasPaymentId text unique null`, `status pix_status default 'pending'`, `qrImage text null` (base64 PNG), `copyPaste text null`, `expiresAt timestamptz null`, `paidAt timestamptz null`, `createdAt`, `updatedAt`; `webhook_events`: `id text pk` (Asaas event id), `type text`, `paymentId text null`, `receivedAt`, `processedAt null`.
- `readAsaasConfig(): { apiKey; baseUrl; webhookToken: string | null } | null`.
- `asaas.ts` (injected fetch, 15 s timeout, never throws; errors `not_configured|timeout|unauthorized|invalid_request|provider_error`): `ensureCustomer(cfg, { name, cpfCnpj? })`, `createPixPayment(cfg, { customerId, valueCents, dueDate, externalReference, description })` → `{ id }`, `getPixQrCode(cfg, paymentId)` → `{ encodedImage, payload, expirationDate }`, `getPayment(cfg, id)` → `{ status }`. Map Asaas statuses: `RECEIVED|CONFIRMED|RECEIVED_IN_CASH` → `paid`; `OVERDUE` → `expired`; `REFUNDED|DELETED|REFUND_REQUESTED` → `cancelled`; `PENDING` → `pending`.
- **Customer strategy spike (first step, recorded in the report):** against the Asaas sandbox (Felipe's sandbox key in `.env.local` as `ASAAS_API_KEY`, `ASAAS_ENV=sandbox`; skip if absent and note it) check whether a single generic customer "Convidados — 15 anos da Isabella" **without CPF** can receive PIX charges. If Asaas requires `cpfCnpj` for PIX, the fallback is: Pix form asks for the guest's CPF (optional field becomes required, validated with check digits, sent to Asaas only, **never stored** in our DB, never logged) and one Asaas customer is created per guest (`asaasCustomerId` stored on a new nullable `guests.asaasCustomerId`). Implement the path the sandbox confirms; document which.
- `service.ts`: `generatePix(guest, amountCents, deps): Promise<{ ok: true; payment: PixView } | { ok: false; error: 'below_minimum' | 'not_configured' | 'unavailable' | 'cpf_required' | 'invalid_cpf' }>` — validates min; inserts a `pending` row only **after** Asaas returns a payment id (no orphans; Review Focus 4); stores QR + copy-paste + expiry (`dueDate` = today Boa Vista); reuses an existing `pending`, non-expired payment for the same guest+amount instead of creating a new charge. `getPixStatus(guestId, paymentId)` reads our DB (webhook is the source of truth) and, if still pending after 2 min, may poll `getPayment` at most once per 30 s.
- `format.ts`: `formatCents(7000) === 'R$ 70,00'`, `parseReais('1.250,5') === 125050`, invalid → null.
- [ ] **Step 1: Write the failing tests:** client mapping (statuses, errors, timeout, never throws, `access_token` header, base URL per env); `generatePix` below minimum → error without calling Asaas; Asaas failure → `unavailable` and **no row**; success → one `pending` row with QR; same guest+amount twice → same payment reused; format cases.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Spike + implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(pix): asaas client and pix service` and push.

---

### Task 6: Invite Pix section

**Files:**
- Create: `src/components/invite/Pix.tsx`, `src/features/pix/actions.ts`
- Modify: `src/app/c/[token]/page.tsx` (render with `id="pix"` when `isFeatureEnabled('pix')`)
- Test: `tests/e2e/pix.spec.ts` + `tests/e2e/fake-asaas.ts` (wired into Playwright like fake-evolution; env `ASAAS_*` pointing at it via a base-URL override env `ASAAS_BASE_URL` used only when set)

**Interfaces:**
- Public actions (token-keyed, rate-limited `pix:${ip}` 10/min): `generatePixAction(prev, formData {token, amount, cpf?})`, `pixStatusAction(token, paymentId)` → `{ status }` (only for that guest's payments).
- UI ported from prancha 09 (`Pix.dc.html`): "Um presente em Pix.", value chips (Bodoni numerals), "Outro valor" with BRL mask and min hint/error "O valor mínimo para presentear via Pix é de R$ 70,00.", summary "SEU PRESENTE R$ X DE {primeiro nome}", "Gerar Pix"/"Gerando Pix…", QR (from base64), "PIX COPIA E COLA" with copy button + toast/live "Código copiado", the 3 steps, status badge "AGUARDANDO PAGAMENTO" → polls every 5 s up to 30 min → "PAGO" + "Pix recebido. Muito obrigada!" + `pixThanksMessage` (or default "Seu carinho chegou. Obrigada por fazer parte desse dia!"); "Trocar o valor"; expired → "Este Pix expirou. Gere um novo." CPF field only if the spike chose the CPF path ("CPF de quem vai pagar", helper "Usado só pelo banco para gerar o Pix. Não guardamos.").
- Pix config missing → "Pix indisponível no momento." (no form).
- [ ] **Step 1: Write the failing tests (fake Asaas):** choose R$ 100 → QR and copy-paste shown, copy → "Código copiado"; fake marks paid (control endpoint triggers our webhook or status) → "Pix recebido." within polling; R$ 50 via "Outro valor" → min error, no call to the fake; fake 500 → "Não foi possível gerar o Pix agora." and retry works; another guest's paymentId in `pixStatusAction` → not found; axe clean.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** `pnpm test`, `pnpm test:e2e` → PASS. Screenshots 390 → `pix-invite-*.png`.
- [ ] **Step 5:** Commit `feat(invite): pix gift via asaas` and push.

---

### Task 7: Asaas webhook

**Files:**
- Create: `src/app/api/webhooks/asaas/route.ts`, `src/features/pix/webhook.ts`
- Modify: `src/proxy.ts` only if needed (the webhook path must not be gated), `next.config.ts` headers unaffected
- Test: `src/features/pix/__tests__/webhook.test.ts`, `src/app/__tests__/asaas-webhook-route.test.ts`

**Interfaces:**
- `POST /api/webhooks/asaas`: header `asaas-access-token` must equal `ASAAS_WEBHOOK_TOKEN` (constant-time compare) else 401; body parsed with Zod (`id` event id, `event`, `payment.id`, `payment.status`, `payment.externalReference`); insert into `webhook_events` (pk = event id) — conflict → 200 `{ ok: true, duplicate: true }` without reprocessing; find `pix_payments` by `asaasPaymentId` (fallback `externalReference` = our id) — unknown → 200 + log `pix.webhook_unknown_payment`; map event/status → our status (`PAYMENT_RECEIVED`/`PAYMENT_CONFIRMED` → `paid` with `paidAt`; `PAYMENT_OVERDUE` → `expired`; `PAYMENT_DELETED`/`PAYMENT_REFUNDED` → `cancelled`); never downgrade `paid`; mark `processedAt`; on `paid` call `syncGiftNudge` (best-effort). Respond fast (< 1 s), 200 for everything handled, 400 for malformed JSON.
- Logs `pix.webhook_received` `{ eventId, event, paymentId, result }` — no amounts tied to names.
- [ ] **Step 1: Write the failing tests:** bad token → 401; malformed → 400; RECEIVED → payment `paid` and gift nudge cancelled; same event twice → second is duplicate, state unchanged; OVERDUE after paid → stays `paid`; unknown payment → 200 ignored (Review Focus 3).
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(pix): idempotent asaas webhook` and push.

---

### Task 8: Admin Pix page and settings

**Files:**
- Create: `src/app/admin/(protected)/pix/page.tsx`, `src/components/admin/PixTable.tsx`
- Modify: admin nav ("Pix"), summary page (card "Pix recebidos: N · R$ total"), settings form (Mensagem de agradecimento do Pix ≤ 400; Nome de quem recebe — shown under the QR as "{nome} · Asaas")
- Test: `tests/e2e/admin-pix.spec.ts` (XFF .27)

**Interfaces:**
- Page (`requireAdmin()`): totals (recebido, pendente), DataTable: Convidado, Valor, Situação (Aguardando / Pago / Expirado / Cancelado / Falhou badges), Criado em, Pago em; filters Situação; mobile cards. Read-only (no manual marking in dynamic mode).
- [ ] **Step 1: Write the failing tests:** unauthenticated → 307; seeded payments appear with formatted values and badges; totals correct; filter "Pago"; summary card; settings save thanks message → shown on the paid screen.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** `pnpm test`, `pnpm test:e2e` → PASS.
- [ ] **Step 5:** Commit `feat(admin): pix payments overview` and push.

---

### Task 9: Production setup (needs Felipe)

- [ ] **Step 1:** README section "Pix (Asaas)": how to get keys, sandbox vs production, webhook URL `https://<domínio>/api/webhooks/asaas`, events to enable (Cobranças: PAYMENT_RECEIVED, PAYMENT_CONFIRMED, PAYMENT_OVERDUE, PAYMENT_DELETED, PAYMENT_REFUNDED), token header, fees note.
- [ ] **Step 2 (Felipe):** production `ASAAS_API_KEY` via `railway variable set ASAAS_API_KEY --stdin --service convite-xv`; controller sets `ASAAS_ENV=production` and a random `ASAAS_WEBHOOK_TOKEN` (stdin, never printed) and gives Felipe the token + URL to register the webhook in Asaas.
- [ ] **Step 3:** Set `FEATURES=gifts,pix` on Railway; deploy; Felipe registers 3–5 gifts; end-to-end check with a real R$ 70 Pix from Felipe's phone (then refund or keep) — verify webhook → "Pix recebido." and admin Pix page.
- [ ] **Step 4:** Commit `docs: pix and gifts setup` and push.

---

## Order and deadline

1 → 2 → 3 (gifts usable) → 4 → 5 → 6 → 7 → 8 → 9. Target: gifts live by **~25/11** (with the invites), Pix live by **~05/12**.
