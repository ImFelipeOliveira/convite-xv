# Fase 1 — Convite, RSVP e Painel de Convidados · Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Colocar em produção no Railway, até 30/11/2026, o convite com link por convidado (abertura com lacre/portas, hero, "O dia", RSVP, encerramento), prévia de carta no WhatsApp e o painel administrativo de convidados.

**Architecture:** Um app Next.js (App Router, TypeScript) é o monolito: Server Components leem o Postgres via Drizzle, Server Actions fazem as escritas (RSVP, painel), rotas de handler servem `.ics`, CSV e imagem OG. Lógica de domínio fica em `src/features/<área>/` como funções puras ou serviços testáveis com Vitest contra um Postgres de teste; a UI segue as pranchas do Claude Design.

**Tech Stack:** pino (logging), Next.js (última estável via `create-next-app@latest`), React, TypeScript strict, pnpm, Tailwind CSS v4, Motion (`motion`), Drizzle ORM + `postgres` (postgres-js) + drizzle-kit, Zod, `nanoid`, `jose` (sessão), `bcryptjs`, `libphonenumber-js`, `papaparse`, Vitest, Playwright, Docker Compose (Postgres local).

**Spec:** `docs/superpowers/specs/2026-10-17-convite-xv-design.md`
**Design visual:** https://claude.ai/artifact/4JNcfs7qugLuMcH3m84ZMp (pranchas 01–07 e 10 são escopo desta fase). Para ler uma prancha: Artifact tool, `action: "read"`, `path: "project/<Nome>.dc.html"`.

**Fora desta fase (planos próprios depois):** Fase 2 Presentes, Fase 3 Pix/Asaas, Fase 4 Lembretes/Evolution API/pg-boss. Nesta fase os links para "Presentes" e "Pix" no encerramento só aparecem se a flag correspondente estiver ligada (Task 8), e ficam desligadas.

## Global Constraints

- **All code in English** (identifiers, files, DB, CSS vars, routes, tests, comments, commits); user-facing copy in pt-BR. Names: `docs/superpowers/plans/naming-glossary.md`.
- Idioma único pt-BR; `<html lang="pt-BR">`.
- Evento: domingo, 27/12/2026, 10h, fuso `America/Boa_Vista` (UTC−4) = `2026-12-27T14:00:00Z`.
- Local: Sítio Lua Azul, Rodovia BR-401, Km 13, s/n, Zona Rural, Cantá–RR, 69390-000. Coordenadas `2.8350401,-60.6005423`. Links Maps/Waze exatamente como na prancha 06 (`Noite.dc.html`).
- Traje: "Livre — e com piscina. Não há traje definido: venha do jeito que se sentir bem. Traje de banho é indispensável."
- `plus_ones_limit` inteiro 0..6; acompanhantes são só quantidade.
- Token do convite: 22 caracteres base62 (`nanoid` `customAlphabet`), único.
- Prazo de confirmação padrão `2026-12-13`; válido até 23:59:59 `America/Boa_Vista` desse dia; configurável no painel.
- Sucesso de qualquer escrita só aparece depois da resposta do servidor (sem UI otimista).
- `prefers-reduced-motion` respeitado conforme a prancha 03; animação só com `transform`/`opacity`; nada bloqueia toque ou rolagem.
- Fontes: Bodoni Moda, Jost, Pinyon Script via `next/font/google`.
- Paleta e tokens: exatamente os da prancha 01/02/03 (ver Task 1).
- `robots: noindex, nofollow` no site inteiro.
- Segredos só por variáveis de ambiente; nada de segredo no repositório.
- Telefones guardados em E.164 (`+5595991234567`).

## Review Focus

1. **Token inexistente, malformado ou adivinhado** (`/c/abc`, `/c/../admin`, tokens em sequência) → página neutra "Convite não encontrado" com status 404, sem dizer se o token "quase" existe, e limite de taxa por IP. Teste na Task 3 e Task 6.
2. **RSVP enviado duas vezes ou reenviado depois de erro de rede** → a segunda chamada só sobrescreve com os mesmos dados; nada duplicado, `responded_at` atualizado. Teste na Task 4.
3. **Requisição adulterada** (acompanhantes negativos, acima do limite, ou limite reduzido pelo painel depois da resposta) → servidor rejeita com mensagem; a tela mostra o valor limitado ao limite atual. Teste na Task 4.
4. **Prazo atravessando fuso**: resposta às 23:30 de 13/12 em Boa Vista (03:30Z de 14/12) é aceita; às 00:01 de 14/12 local é recusada. Teste na Task 4.
5. **Telefone em formatos brasileiros variados** (`(95) 99123-4567`, `95991234567`, `+55 95 99123-4567`, fixo `(95) 3224-1234`, lixo `123`) → normaliza para E.164 ou recusa com "Telefone inválido"; e **CSV exportado do Excel BR** (separador `;`, BOM UTF-8, acentos) importa corretamente. Testes nas Tasks 3 e 12.

---

## File Structure

```
convite-xv/
  docker-compose.yml                 Postgres 17 local (dev + teste)
  Dockerfile                         build standalone para o Railway
  drizzle.config.ts
  .env.example
  vitest.config.ts  vitest.setup.ts  vitest.global-setup.ts  playwright.config.ts
  scripts/seed-admin.ts              cria/atualiza admin
  drizzle/                           migrações geradas
  src/
    app/
      layout.tsx                     fontes, metadata noindex, lang
      globals.css                    Tailwind + tokens CSS
      page.tsx                       raiz neutra
      not-found.tsx                  "Convite não encontrado"
      c/[token]/page.tsx             convite
      c/[token]/calendar.ics/route.ts
      c/[token]/opengraph-image.tsx  imagem da carta (estática, igual p/ todos)
      admin/login/page.tsx
      admin/(protected)/layout.tsx   guard + navegação
      admin/(protected)/page.tsx     resumo
      admin/(protected)/guests/page.tsx
      admin/(protected)/guests/[id]/page.tsx
      admin/(protected)/messages/page.tsx
      admin/(protected)/settings/page.tsx
      admin/(protected)/guests/export/route.ts
    server/db/{client.ts, schema.ts}
    features/
      event/{event.ts, ics.ts, flags.ts}
      settings/{repo.ts, schema.ts, actions.ts}
      guests/{token.ts, phone.ts, repo.ts, csv.ts, whatsapp.ts, actions.ts, schema.ts}
      rsvp/{deadline.ts, schema.ts, service.ts, actions.ts}
      admin-auth/{password.ts, session.ts, guard.ts, actions.ts}
    lib/rate-limit.ts
    components/
      ornaments/{Lily.tsx, WaxSeal.tsx, Monogram.tsx, Frame.tsx}
      invite/{Opening.tsx, Hero.tsx, TheDay.tsx, Countdown.tsx, Rsvp.tsx, Closing.tsx, Reveal.tsx}
      admin/*                        componentes simples do painel
  tests/
    helpers/db.ts                    truncate + fábricas (resetDatabase, makeGuest, reseedSettings)
    e2e/*.spec.ts
```

---

### Task 1: Scaffold, tokens do design e ambiente de teste

**Files:**
- Create: projeto via `create-next-app`, `docker-compose.yml`, `.env.example`, `vitest.config.ts`, `vitest.setup.ts`, `src/app/globals.css`, `src/app/layout.tsx`, `src/app/page.tsx`
- Test: `src/app/__tests__/tokens.test.ts`

**Interfaces:**
- Produces: variáveis CSS e utilitários Tailwind com os nomes abaixo; scripts `pnpm dev | build | test | test:e2e | db:generate | db:migrate`; fontes expostas como `--font-bodoni`, `--font-jost`, `--font-pinyon`.

- [ ] **Step 1:** `git init` em `convite-xv/`; `pnpm create next-app@latest . --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-pnpm` (o diretório já tem `docs/`; aceitar). Instalar: `motion drizzle-orm postgres zod nanoid jose bcryptjs libphonenumber-js papaparse` e dev: `drizzle-kit vitest @vitejs/plugin-react vite-tsconfig-paths @playwright/test tsx @types/bcryptjs @types/papaparse`.
- [ ] **Step 2:** `docker-compose.yml` com serviço `postgres:17`, porta `5432`, usuário/senha `convite/convite`, bancos `convite` e `convite_test` (script init). `.env.example`: `DATABASE_URL`, `DATABASE_URL_TEST`, `AUTH_SECRET`, `APP_URL`, `FEATURES` (vazio).
- [ ] **Step 3: Write the failing test** `tokens.test.ts` — lê `src/app/globals.css` como texto e afirma que contém cada token:

```ts
const tokens = {
  '--blush': '#F7DEDB', '--paper': '#FFF8F6', '--petal': '#F0C7C6', '--lily': '#E07A9C',
  '--rose': '#C25578', '--seal': '#A8325E', '--deep-rose': '#8E3556', '--wine': '#5A2136',
  '--burgundy': '#2A1119', '--gold': '#B8955A', '--gold-light': '#E3C891', '--gold-text': '#7A5629',
  '--sage': '#2F6B4F', '--error': '#9B1C1C',
  '--ease-letter': 'cubic-bezier(.22, 1, .36, 1)', '--ease-doors': 'cubic-bezier(.65, 0, .35, 1)',
  '--ease-seal': 'cubic-bezier(.34, 1.56, .64, 1)', '--dur-micro': '160ms', '--dur-ui': '320ms',
  '--dur-reveal': '700ms', '--dur-scene': '1200ms', '--stagger': '80ms', '--reveal-y': '24px',
}
// expect(css).toContain(`${name}: ${value}`) para cada par
```

- [ ] **Step 4:** Rodar `pnpm vitest run src/app/__tests__/tokens.test.ts` → FAIL.
- [ ] **Step 5:** Escrever `globals.css` com `@import "tailwindcss"`, `:root` com os tokens acima, espaçamento base 4 (`--space-1:4px` … `--space-10:160px` conforme prancha 02), `@theme` mapeando as cores para utilitários (`bg-blush`, `text-wine`…), `body{background:var(--blush);color:var(--wine)}` e o bloco global `@media (prefers-reduced-motion: reduce)` da prancha 03. `layout.tsx`: `next/font/google` para as três fontes (Bodoni Moda com eixo `opsz` e itálico; Jost 300–600; Pinyon Script 400) como variáveis, `metadata.robots = { index: false, follow: false }`, `lang="pt-BR"`. `page.tsx`: página neutra com o monograma e "Este convite é pessoal. Use o link que você recebeu." `vitest.config.ts` com `vite-tsconfig-paths`, ambiente `node`, `setupFiles: ['vitest.setup.ts']`.
- [ ] **Step 6:** Rodar o teste → PASS; `pnpm build` → sucesso.
- [ ] **Step 7:** Commit `chore: scaffold Next.js with design tokens and test environment`.

---

### Task 2: Schema do banco, cliente e helper de testes

**Files:**
- Create: `src/server/db/schema.ts`, `src/server/db/client.ts`, `drizzle.config.ts`, `tests/helpers/db.ts`, `drizzle/0000_*.sql` (gerado)
- Modify: `vitest.setup.ts`
- Test: `src/server/db/__tests__/schema.test.ts`

**Interfaces:**
- Produces:
  - `db` (Drizzle sobre postgres-js), exportado de `@/server/db/client`; em `NODE_ENV=test` usa `DATABASE_URL_TEST`.
  - Tabelas (`schema.ts`): `guests`, `admins`, `settings`. Enum `rsvp_status` = `'pending' | 'yes' | 'no'`.
    - `guests`: `id uuid pk default random`, `token text unique not null`, `name text not null`, `phone text null`, `plusOnesLimit int not null default 0` (check `plus_ones_limit_range` 0..6), `rsvpStatus rsvp_status not null default 'pending'`, `plusOnes int not null default 0` (check ≥0), `message text null`, `respondedAt timestamptz null`, `openedAt timestamptz null`, `createdAt`, `updatedAt`.
    - `admins`: `id uuid`, `email text unique not null` (minúsculo), `passwordHash text not null`, `createdAt`.
    - `settings`: linha única `id int pk check (id = 1)`, `rsvpDeadline date not null default '2026-12-13'`, `contactInfo text null`, `closingMessage text null`, `whatsappInviteTemplate text not null` (default abaixo).
  - Tipos `Guest = typeof guests.$inferSelect`, `Settings = typeof settings.$inferSelect`, `NewGuest = typeof guests.$inferInsert`, `RsvpStatus = Guest['rsvpStatus']`.
  - `tests/helpers/db.ts`: `resetDatabase(): Promise<void>` (TRUNCATE ... RESTART IDENTITY CASCADE das três tabelas), `makeGuest(over?: Partial<NewGuest>): Promise<Guest>` (token aleatório, nome "Convidado Teste", limite 2) e `reseedSettings(): Promise<void>` (reinsere a linha única de `settings`).
- Default de `whatsappInviteTemplate` (texto exato, é copy pt-BR editável pela família): `Olá, {nome}! A Isabella vai fazer 15 anos e preparou um convite especial para você. Abra a carta: {link}`

- [ ] **Step 1: Write the failing test** `schema.test.ts`:
  - `inserts a guest with defaults` → `rsvpStatus === 'pending'`, `plusOnes === 0`.
  - `rejects limit 7` → insert com `plusOnesLimit: 7` lança erro de check.
  - `token is unique` → segundo insert com mesmo token lança.
  - `settings has a single row` → insert `{id: 2}` lança.
- [ ] **Step 2:** `docker compose up -d`; rodar `pnpm vitest run src/server/db` → FAIL (módulo inexistente).
- [ ] **Step 3:** Escrever `schema.ts`, `client.ts`, `drizzle.config.ts`; `pnpm db:generate`; a migração deve incluir `INSERT INTO settings (id) VALUES (1) ON CONFLICT DO NOTHING` (adicionar à mão no SQL gerado). `vitest.setup.ts`: roda `migrate()` no banco de teste uma vez (globalSetup, em `vitest.global-setup.ts`) e `resetDatabase()` + `reseedSettings()` em `beforeEach`. Vitest com `fileParallelism: false`.
- [ ] **Step 4:** Rodar → PASS.
- [ ] **Step 5:** Commit `feat(db): guests, admins and settings schema`.

---

### Task 2b: Rename existing code to English

**Files:**
- Modify: `src/app/globals.css`, `src/app/__tests__/tokens.test.ts`, `src/app/page.tsx`/`layout.tsx` (se referenciarem tokens renomeados), `src/server/db/schema.ts`, `src/server/db/client.ts`, `tests/helpers/db.ts`, `vitest.setup.ts`, `vitest.global-setup.ts`, `src/server/db/__tests__/schema.test.ts`
- Delete: `drizzle/0000_*.sql` e `drizzle/meta/*`, e regenerar (nada foi ao ar ainda; recriar os bancos locais `convite`/`convite_test` ou usar `drizzle-kit drop`), readicionando à mão `INSERT INTO settings (id) VALUES (1) ON CONFLICT DO NOTHING` no SQL gerado.

**Interfaces:** nomes conforme `docs/superpowers/plans/naming-glossary.md`; nenhum valor muda (cores hex, datas, limites, textos).

- [ ] **Step 1 (RED):** atualizar os testes para os nomes em inglês (`tokens.test.ts` com `--paper`, `--petal`, `--lily`, `--seal`, `--wine`, `--burgundy`, `--gold*`, `--sage`, `--error`, `--ease-letter|doors|seal`, `--dur-reveal|scene`, `--reveal-y`; `schema.test.ts` com `guests`/`plusOnesLimit`/`rsvpStatus`/`settings`; helpers `resetDatabase`, `makeGuest`, `reseedSettings`). Rodar `pnpm test` → FAIL.
- [ ] **Step 2 (GREEN):** renomear o código: tokens em `globals.css` (e usos em `page.tsx`/`layout.tsx`), tabelas/colunas/enum/check em `schema.ts`, `client.ts`, helpers, `vitest.setup.ts`, `vitest.global-setup.ts`. Apagar `drizzle/0000_*.sql` e `drizzle/meta/*`, recriar os bancos locais, `pnpm db:generate` e readicionar o `INSERT INTO settings` à mão.
- [ ] **Step 3:** `grep -rniE "convidad|acompanhant|resposta|recado|prazo|config\b|papel|petala|lirio|lacre|vinho|bordo|ouro|salvia|erro\b|carta|portas|revelar|cena|limparBanco|fabricar" src tests vitest*.ts drizzle` deve retornar só textos de interface em pt-BR.
- [ ] **Step 4:** `pnpm test` e `pnpm build` passam.
- [ ] **Step 5:** Commit `refactor: rename code identifiers to English`.

---

### Task 3: Token, telefone e repositório de convidados

**Files:**
- Create: `src/features/guests/token.ts`, `phone.ts`, `repo.ts`
- Test: `src/features/guests/__tests__/token.test.ts`, `phone.test.ts`, `repo.test.ts`

**Interfaces:**
- Produces:
  - `generateToken(): string` — 22 chars de `[0-9A-Za-z]`.
  - `isValidToken(t: string): boolean` — regex `^[0-9A-Za-z]{22}$`.
  - `normalizePhone(input: string): string | null` — `libphonenumber-js`, país padrão `BR`, retorna E.164 se `isValid()`, senão `null`.
  - `formatPhone(e164: string): string` — formato nacional `(95) 99123-4567`.
  - `findGuestByToken(token: string): Promise<Guest | null>` — retorna `null` sem consultar o banco se `!isValidToken(token)`.
  - `markOpened(id: string): Promise<void>` — seta `openedAt = now()` só se for null.
  - `createGuest(d: {name; phone?: string | null; plusOnesLimit: number}): Promise<Guest>` (gera token; re-tenta 1× em colisão).
  - `updateGuest(id, d: Partial<{name; phone; plusOnesLimit}>): Promise<Guest>`
  - `deleteGuest(id): Promise<void>`
  - `listGuests(filter?: {status?: RsvpStatus; search?: string}): Promise<Guest[]>` — ordenado por nome, `search` em `name ILIKE`.
  - `getSummary(): Promise<{total: number; yes: number; no: number; pending: number; confirmedPeople: number}>` — `confirmedPeople = Σ(1 + plusOnes)` dos `yes`.

- [ ] **Step 1: Write the failing tests**
  - token: `generateToken()` casa `/^[0-9A-Za-z]{22}$/`; 1000 gerações sem repetição; `isValidToken('abc') === false`; `isValidToken('../admin' + 'x'.repeat(14)) === false`.
  - phone (Review Focus 5): `'(95) 99123-4567' → '+5595991234567'`; `'95991234567' → '+5595991234567'`; `'+55 95 99123-4567' → '+5595991234567'`; `'(95) 3224-1234' → '+559532241234'`; `'123' → null`; `'' → null`; `formatPhone('+5595991234567') === '(95) 99123-4567'`.
  - repo: `findGuestByToken` with a malformed token returns `null`; with a valid but nonexistent token returns `null`; `markOpened` twice keeps the first timestamp; `getSummary()` with 1 yes+2 plus-ones, 1 yes+0, 1 no, 1 pending → `{total:4, yes:2, no:1, pending:1, confirmedPeople:4}`.
- [ ] **Step 2:** Rodar `pnpm vitest run src/features/guests` → FAIL.
- [ ] **Step 3:** Implementar os três módulos.
- [ ] **Step 4:** Rodar → PASS.
- [ ] **Step 5:** Commit `feat(guests): token, phone and repository`.

---

### Task 4: Serviço de RSVP (prazo, validação, telefone opcional)

**Files:**
- Create: `src/features/rsvp/deadline.ts`, `schema.ts`, `service.ts`, `actions.ts`; `src/features/settings/repo.ts`
- Test: `src/features/rsvp/__tests__/deadline.test.ts`, `service.test.ts`

**Interfaces:**
- Consumes: `findGuestByToken`, `normalizePhone` (Task 3); `db`, `settings` (Task 2).
- Produces:
  - `getSettings(): Promise<Settings>`; `saveSettings(d: Partial<Omit<Settings,'id'>>): Promise<Settings>` (em `settings/repo.ts`).
  - `isDeadlinePassed(deadline: string /* 'YYYY-MM-DD' */, now: Date): boolean` — encerrado quando `now > fim do dia em America/Boa_Vista` (fim = `${deadline}T23:59:59.999-04:00`; Roraima não tem horário de verão, offset fixo −04:00).
  - `rsvpSchema` (Zod): `{ token: string, status: 'yes'|'no', plusOnes: int ≥0 default 0, message: string ≤500 trim opcional, phone: string opcional }`.
  - `type RsvpResult = { ok: true; guest: Guest } | { ok: false; error: 'not_found' | 'deadline_passed' | 'over_limit' | 'invalid_phone' | 'invalid' }`
  - `submitRsvp(input: unknown, now = new Date()): Promise<RsvpResult>` — regras:
    - token inexistente → `not_found`; prazo encerrado → `deadline_passed`;
    - `status === 'no'` força `plusOnes = 0`, ignora telefone;
    - `plusOnes > plusOnesLimit` → `over_limit`;
    - telefone só é considerado se o convidado **não** tem telefone cadastrado e `status === 'yes'`; vazio = ignorado; não normalizável → `invalid_phone`;
    - grava `rsvpStatus`, `plusOnes`, `message` (null se vazio), `respondedAt = now`, e `phone` quando aplicável. Mesma entrada repetida = mesmo estado (idempotente).
  - Server Action `submitRsvpAction(prev: RsvpResult | null, formData: FormData): Promise<RsvpResult>` em `actions.ts` (`'use server'`), aplica rate limit (Task 6 — até lá, sem limite) e chama `submitRsvp`.
  - `rsvpErrorMessage(error): string` — textos (copy pt-BR): `not_found` "Convite não encontrado."; `deadline_passed` "O prazo para responder terminou. Fale com a família pelo contato abaixo."; `over_limit` "Seu convite inclui até {n} acompanhantes."; `invalid_phone` "Telefone inválido. Use DDD + número."; `invalid` "Não conseguimos enviar agora. Sua resposta não foi perdida — toque em enviar de novo."

- [ ] **Step 1: Write the failing tests**
  - deadline (Review Focus 4): `isDeadlinePassed('2026-12-13', new Date('2026-12-14T03:30:00Z')) === false`; `isDeadlinePassed('2026-12-13', new Date('2026-12-14T04:01:00Z')) === true`; `isDeadlinePassed('2026-12-13', new Date('2026-12-01T12:00:00Z')) === false`.
  - service:
    - `yes with 2 plus-ones within limit 2` → ok, `rsvpStatus 'yes'`, `plusOnes 2`, `respondedAt` setado.
    - `over limit` (limite 1, envia 2) → `over_limit`, banco inalterado (Review Focus 3).
    - `negative plus-ones` → `invalid`.
    - `no zeroes plus-ones` (envia `no` com 3) → ok, `plusOnes 0`.
    - `identical resubmission` duas vezes → ok nas duas, um só convidado, estado igual (Review Focus 2).
    - `changing from yes to no` → ok, estado atualizado.
    - `deadline passed` (settings `rsvpDeadline '2026-12-13'`, now `2026-12-14T05:00Z`) → `deadline_passed`.
    - `phone saved when missing`: convidado sem telefone, `yes`, `phone '(95) 99123-4567'` → `phone '+5595991234567'`.
    - `phone ignored when already registered`: convidado com `+5595900000000`, envia outro → mantém o original.
    - `invalid phone` → `invalid_phone`.
    - `unknown token` → `not_found`.
    - `message with 501 chars` → `invalid`.
- [ ] **Step 2:** Rodar `pnpm vitest run src/features/rsvp` → FAIL.
- [ ] **Step 3:** Implementar `deadline.ts`, `settings/repo.ts`, `schema.ts`, `service.ts`, `actions.ts`.
- [ ] **Step 4:** Rodar → PASS.
- [ ] **Step 5:** Commit `feat(rsvp): service with deadline, limit and optional phone`.

---

### Task 5: Dados do evento, flags e arquivo .ics

**Files:**
- Create: `src/features/event/event.ts`, `ics.ts`, `flags.ts`, `src/app/c/[token]/calendar.ics/route.ts`
- Test: `src/features/event/__tests__/ics.test.ts`, `flags.test.ts`

**Interfaces:**
- Produces:
  - `EVENT` (const): `{ celebrant: 'Isabella', startsAt: '2026-12-27T14:00:00Z', timeZone: 'America/Boa_Vista', durationHours: 8, venue: { name: 'Sítio Lua Azul', address: 'Rodovia BR-401, Km 13, s/n · Zona Rural', city: 'Cantá – RR · 69390-000', lat: 2.8350401, lng: -60.6005423, mapsUrl, wazeUrl }, dressCode: { title: 'Livre — e com piscina.', text: 'Não há traje definido: venha do jeito que se sentir bem. Traje de banho é indispensável.' } }` — URLs copiadas da prancha 06. [decisão do plano: duração 8 h no .ics]
  - `generateIcs(invite: { name: string; link: string }): string` — VCALENDAR/VEVENT com `UID: xv-isabella-2026@convite`, `DTSTART:20261227T140000Z`, `DTEND:20261227T220000Z`, `SUMMARY:XV anos da Isabella`, `LOCATION` com nome + endereço + cidade (vírgulas escapadas `\,`), `DESCRIPTION` com o link, linhas CRLF, `VALARM` 1 dia antes.
  - `GET /c/[token]/calendar.ics` → 404 se token não existe; senão `text/calendar; charset=utf-8`, `Content-Disposition: attachment; filename="xv-isabella.ics"`.
  - `isFeatureEnabled(name: 'gifts' | 'pix'): boolean` — lê `process.env.FEATURES` (lista separada por vírgula).

- [ ] **Step 1: Write the failing tests** — `generateIcs` contém `DTSTART:20261227T140000Z`, `DTEND:20261227T220000Z`, `SUMMARY:XV anos da Isabella`, `LOCATION:Sítio Lua Azul\, Rodovia BR-401`, `BEGIN:VALARM`, todas as quebras são `\r\n`; `isFeatureEnabled('pix')` é `false` com `FEATURES=''` e `true` com `FEATURES='gifts,pix'`.
- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Rodar → PASS.
- [ ] **Step 5:** Commit `feat(event): fixed event data, flags and .ics`.

---

### Task 6: Rate limit das rotas públicas

**Files:**
- Create: `src/lib/rate-limit.ts`
- Modify: `src/features/rsvp/actions.ts`, `src/app/c/[token]/calendar.ics/route.ts` (a página do convite aplica o limite na Task 7)
- Test: `src/lib/__tests__/rate-limit.test.ts`

**Interfaces:**
- Produces: `rateLimit(key: string, opts: { max: number; windowMs: number }, now = Date.now()): { ok: boolean; remaining: number }` — janela deslizante em memória (Map), poda entradas expiradas; `getClientIp(headers: Headers): string` (primeiro IP de `x-forwarded-for`, senão `'local'`).
- Limites: abrir convite/ics `60/min por IP`; `submitRsvpAction` `10/min por IP+token`. Excedido no convite → `notFound()` (Review Focus 1: não revela nada); no RSVP → `{ ok:false, error:'invalid' }`.

- [ ] **Step 1: Write the failing tests** — 3 chamadas com `max 3` ok, 4ª `ok:false`; após `windowMs` volta a `ok:true`; chaves diferentes não interferem; `getClientIp` com `'1.1.1.1, 2.2.2.2'` → `'1.1.1.1'`.
- [ ] **Step 2:** Rodar → FAIL. **Step 3:** Implementar e aplicar em `submitRsvpAction` e na rota `.ics`. **Step 4:** Rodar → PASS.
- [ ] **Step 5:** Commit `feat: rate limit on public routes`.

---

### Task 7: Ornamentos e Abertura (lacre e portas)

**Files:**
- Create: `src/components/ornaments/{Lily.tsx, WaxSeal.tsx, Monogram.tsx, Frame.tsx}`, `src/components/invite/Opening.tsx`, `src/app/c/[token]/page.tsx`, `src/app/not-found.tsx`
- Test: `tests/e2e/opening.spec.ts`, `playwright.config.ts`

**Interfaces:**
- Consumes: `findGuestByToken`, `markOpened` (Task 3), `rateLimit`, `getClientIp` (Task 6).
- Produces:
  - `<Lily className? animate?: boolean delay?: number />`, `<WaxSeal />`, `<Monogram letter="I" />`, `<Frame double />` — SVG portados das pranchas 04/05 (paths e gradientes idênticos), com `aria-hidden` quando decorativos.
  - `<Opening name="Isabella" onOpened?: () => void>{children}</Opening>` — client component; fases `closed → press (170 ms) → opening → open (1700 ms)` como em `Abertura.dc.html`; botão "Abrir o convite" (lacre, `aria-label`), botão "Entrar sem animação"; grava `localStorage['xv:opened']='1'` (try/catch) e, em visitas seguintes, pula as portas e roda a versão curta de 900 ms; respeita reduced motion (crossfade 300 ms).
  - `page.tsx`: `params.token` → rate limit → `findGuestByToken` → `notFound()` se null → `markOpened` → renderiza `<Opening>` envolvendo as seções (Tasks 8–9 preenchem). `export const dynamic = 'force-dynamic'`.
  - `not-found.tsx`: "Convite não encontrado." + "Confira se o link está completo." no estilo do convite, status 404.

- [ ] **Step 1: Write the failing e2e test** `opening.spec.ts` (viewport 390×844; um `globalSetup` do Playwright migra o banco de teste, cria um convidado com token fixo `TesteE2E00000000000001` e um admin `admin@teste.local` / `senha-teste`; o servidor de teste roda com `DATABASE_URL=$DATABASE_URL_TEST` e `APP_URL=http://localhost:3000`):
  - `shows the seal and opens on tap`: vê botão "Abrir o convite"; clica; em até 3 s vê heading "Isabella" e o botão do lacre some.
  - `enter without animation`: clica "Entrar sem animação" → conteúdo visível imediatamente.
  - `second visit skips the doors`: após abrir, recarrega → botão "Abrir o convite" não aparece.
  - `unknown token returns 404`: `page.goto('/c/zzzzzzzzzzzzzzzzzzzzzz')` → status 404 e texto "Convite não encontrado."
- [ ] **Step 2:** `pnpm test:e2e opening` → FAIL.
- [ ] **Step 3:** Ler `project/Abertura.dc.html` e `project/Hero.dc.html` da prancha (instruções no cabeçalho) e portar os SVG e as classes CSS (`door`, `half`, `ring`, `petal`) para componentes; transições de portas/lacre em CSS como na prancha; Motion só onde a prancha 03 indica.
- [ ] **Step 4:** Rodar → PASS.
- [ ] **Step 5:** Commit `feat(invite): opening with seal and doors`.

---

### Task 8: Hero, O dia (contagem e local) e Encerramento

**Files:**
- Create: `src/components/invite/{Hero.tsx, TheDay.tsx, Countdown.tsx, Closing.tsx, Reveal.tsx}`
- Modify: `src/app/c/[token]/page.tsx`
- Test: `src/components/invite/__tests__/countdown.test.ts`, `tests/e2e/invite.spec.ts`

**Interfaces:**
- Consumes: `EVENT`, `isFeatureEnabled` (Task 5); `getSettings` (Task 4); ornamentos (Task 7).
- Produces:
  - `countdownParts(targetIso: string, now: number): { days: number; hours: number; minutes: number; seconds: number; finished: boolean }` — exportada de `Countdown.tsx` (ou módulo irmão), `days` limitado a 99, como na prancha 06.
  - `<Reveal>` — wrapper Motion `whileInView` (20% visível, uma vez, sobe `--reveal-y`, stagger 80 ms, máx. 6 itens).
  - `<Hero name visual="lily">` — prancha 05 (coreografia 0–3 s da prancha 03); CTA "Confirmar presença" ancora em `#rsvp`, link "O dia" em `#the-day`.
  - `<TheDay>` — prancha 06: data, odômetro, "É hoje" quando `finished`, "Adicionar à agenda" → `/c/{token}/calendar.ics`, local, botões Google Maps/Waze, traje, contato de `settings.contactInfo` (oculta o bloco se null).
  - `<Closing message={settings.closingMessage}>` — prancha 10 com faixa animada pausável; atalhos "Presença IV · Local III" sempre; "Presentes V · Pix VI" só se `isFeatureEnabled`.

- [ ] **Step 1: Write the failing tests**
  - `countdownParts('2026-12-27T14:00:00Z', Date.parse('2026-12-26T13:00:00Z'))` → `{days:1, hours:1, minutes:0, seconds:0, finished:false}`; com `now` depois do alvo → `finished:true` e zeros; 200 dias antes → `days:99`.
  - e2e `invite.spec.ts`: após entrar sem animação vê "Sítio Lua Azul", link "Google Maps" com `href` contendo `2.8350401`, link "Adicionar à agenda" que baixa um arquivo `.ics`, texto "Traje de banho é indispensável." e **não** vê "Presentes" no encerramento (flags desligadas).
- [ ] **Step 2:** Rodar → FAIL. **Step 3:** Implementar portando `Hero.dc.html`, `Noite.dc.html`, `Final.dc.html`. **Step 4:** Rodar → PASS.
- [ ] **Step 5:** Commit `feat(invite): hero, the day and closing`.

---

### Task 9: Tela de RSVP

**Files:**
- Create: `src/components/invite/Rsvp.tsx`
- Modify: `src/app/c/[token]/page.tsx`
- Test: `tests/e2e/rsvp.spec.ts`

**Interfaces:**
- Consumes: `submitRsvpAction`, `rsvpErrorMessage`, `isDeadlinePassed` (Task 4); `formatPhone` (Task 3).
- Produces: `<Rsvp guest={{name, rsvpStatus, plusOnes, message, plusOnesLimit, hasPhone, respondedAt}} token deadline closed contact />` — client component com `useActionState(submitRsvpAction)`; seção `id="rsvp"`. Estados e textos da prancha 07: badge AGUARDANDO RESPOSTA / CONFIRMADA / RECUSADA; "Olá, {nome}. Este convite é só seu — responda até {prazo dd/mm}."; opções "Vou com certeza" / "Não poderei ir"; contador de acompanhantes com texto de limite (`Este convite é individual.` quando 0); recado opcional; campo **"Seu WhatsApp para lembretes (opcional)"** só quando `status escolhido === 'yes' && !hasPhone`, com a frase "Usaremos só para lembrar você da festa." (estilo CAMPOS da prancha 02); botão "Confirmar presença"/"Enviar resposta"/"Enviando…"; telas finais "Presença confirmada. Até lá!" (com "Resposta registrada em dd/mm às HHhMM", "Adicionar à agenda", "Alterar resposta") e "Que pena. Obrigada por avisar."; erro com mensagem de `rsvpErrorMessage` mantendo o formulário preenchido; animação de confirmação (prancha 03, primitiva 12) só após `ok:true`; depois do prazo (`closed`), mostra a resposta atual só leitura + contato. Valores iniciais vêm do convidado (resposta já dada abre direto na tela final). Acompanhantes exibidos com `min(plusOnes, plusOnesLimit)`.

- [ ] **Step 1: Write the failing e2e test** `rsvp.spec.ts` (convidado de teste com limite 2, sem telefone; banco limpo a cada teste):
  - `confirms with plus-ones and phone`: escolhe "Vou com certeza", clica "+" duas vezes (o "+" fica desabilitado), preenche WhatsApp `(95) 99123-4567`, envia → vê "Presença confirmada. Até lá!" e "Você + 2"; recarrega a página → continua na tela confirmada.
  - `declines`: escolhe "Não poderei ir" → campo de WhatsApp não aparece; envia → "Que pena. Obrigada por avisar."
  - `changes the answer`: depois de confirmar, "Alterar resposta" → formulário com a escolha anterior marcada.
  - `invalid phone`: WhatsApp `123` → mensagem "Telefone inválido. Use DDD + número." e campos preservados.
- [ ] **Step 2:** Rodar → FAIL. **Step 3:** Implementar portando `RSVP.dc.html`. **Step 4:** Rodar → PASS.
- [ ] **Step 5:** Commit `feat(invite): RSVP screen`.

---

### Task 10: Prévia do link (carta) e metadados

**Files:**
- Create: `src/app/c/[token]/opengraph-image.tsx`, `public/og/` (se usar asset estático)
- Modify: `src/app/c/[token]/page.tsx` (`generateMetadata`)
- Test: `tests/e2e/og.spec.ts`

**Interfaces:**
- Consumes: `EVENT`.
- Produces: imagem 1200×630 PNG via `ImageResponse`, **igual para todos os tokens** e **sem nome do convidado**: envelope fechado em blush com moldura dourada dupla, lacre "I" no centro, "Isabella" em Pinyon Script e "XV ANOS · 27.12.2026" em Bodoni (fontes carregadas como ArrayBuffer de `public/fonts/` ou Google Fonts no build). `generateMetadata`: `title: 'Isabella · XV anos'`, `description: 'Você recebeu um convite. Toque para abrir a carta.'`, `openGraph.type 'website'`, `metadataBase = new URL(process.env.APP_URL)`. Arquivo final < 300 KB.

- [ ] **Step 1: Write the failing test** — request a `/c/TesteE2E00000000000001` → HTML contém `<meta property="og:image"` com URL absoluta começando por `APP_URL`, `og:title` "Isabella · XV anos"; request à URL da imagem → status 200, `content-type: image/png`, tamanho < 300 000 bytes; HTML não contém o nome do convidado de teste em nenhuma tag `og:`.
- [ ] **Step 2:** Rodar → FAIL. **Step 3:** Implementar. **Step 4:** Rodar → PASS.
- [ ] **Step 5:** Commit `feat(invite): letter preview for WhatsApp`.

---

### Task 10b: Structured logging with pino (user request)

**Files:**
- Create: `src/lib/logger.ts`, `src/lib/__tests__/logger.test.ts`
- Modify: `package.json` (deps `pino`; dev dep `pino-pretty`; `dev` script pipes through pino-pretty or uses its sync destination), `next.config.ts` (`serverExternalPackages: ['pino', 'pino-pretty']` if needed for Next 16 bundling — check node_modules/next/dist/docs), `.env.example` (`LOG_LEVEL=info`), `src/features/rsvp/actions.ts`, `src/proxy.ts`, `src/app/c/[token]/calendar.ics/route.ts`, `src/app/c/[token]/page.tsx`

**Interfaces:**
- Produces: `logger` (pino instance) and `childLogger(bindings: Record<string, unknown>)` from `@/lib/logger`.
  - Level from `LOG_LEVEL` (default `info`; `silent` when `NODE_ENV=test` unless LOG_LEVEL is set).
  - Production: plain JSON to stdout (no worker-thread transports — Railway collects stdout). Development: human-readable via pino-pretty (prefer piping the dev server output or `pino-pretty` as a sync stream; avoid `transport` worker threads inside Next).
  - `base: { service: 'convite-xv' }`, ISO timestamps (`pino.stdTimeFunctions.isoTime`).
  - `redact` with `censor: '[redacted]'` for paths: `phone`, `*.phone`, `token`, `*.token`, `password`, `*.password`, `passwordHash`, `*.passwordHash`, `cookie`, `*.cookie`, `headers.cookie`, `req.headers.cookie`, `authorization`, `*.authorization`, `message`, `*.message` (guest messages are private) — but keep pino's own log `msg`.
- Log events (event name in `event` field, message in pt-free English):
  - `rsvp.submitted` info `{ guestId, status, plusOnes, phoneAdded: boolean }` on ok; `rsvp.rejected` warn `{ error }` (+ guestId when known) on ok:false; unexpected exceptions → `rsvp.error` error `{ err }` and still return `{ ok:false, error:'invalid' }` (this also resolves the deferred Task 4 minor that DB errors weren't mapped).
  - `rate_limit.exceeded` warn `{ route: 'invite'|'calendar'|'rsvp', ip }` in proxy, calendar route, rsvp action.
  - `invite.opened` info `{ guestId, firstOpen: boolean }` when markOpened runs for a non-bot; `invite.preview_bot` debug `{ ua }` when skipped.
  - Never log guest names, phones, tokens or messages.

- [ ] **Step 1: Write the failing test** `logger.test.ts`: build a logger via an exported `createLogger(destination)` writing to an in-memory stream; log `{ phone: '+5595991234567', token: 'abc', guest: { phone: 'x', message: 'oi' }, guestId: 'g1' }` and assert the JSON line has `phone: '[redacted]'`, `token: '[redacted]'`, `guest.phone: '[redacted]'`, `guest.message: '[redacted]'`, `guestId: 'g1'`, `service: 'convite-xv'`, and an ISO `time`. Assert level comes from `LOG_LEVEL` (stub env `LOG_LEVEL=warn` → `info` lines not written).
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement and wire the events. **Step 4:** `pnpm test`, `pnpm build`, and full `pnpm test:e2e` (not concurrently) pass; `pnpm dev` shows pretty logs (paste a sample line in the report); `NODE_ENV=production` sample shows JSON with redaction.
- [ ] **Step 5:** Commit `feat: structured logging with pino` and push.

---

### Task 11: Autenticação do painel

**Files:**
- Create: `src/features/admin-auth/{password.ts, session.ts, guard.ts, actions.ts}`, `scripts/seed-admin.ts`, `src/app/admin/login/page.tsx`, `src/app/admin/(protected)/layout.tsx`
- Test: `src/features/admin-auth/__tests__/auth.test.ts`, `tests/e2e/admin-login.spec.ts`

**Interfaces:**
- Produces:
  - `hashPassword(s: string): Promise<string>` (bcryptjs, custo 12); `verifyPassword(s, hash): Promise<boolean>`.
  - `createSession(adminId: string): Promise<void>` — JWT HS256 (`jose`, segredo `AUTH_SECRET`), expira em 30 dias, cookie `xv_admin` httpOnly, `secure` em produção, `sameSite: 'lax'`, `path: '/'`.
  - `getSession(): Promise<{ adminId: string } | null>`; `destroySession(): Promise<void>`.
  - `requireAdmin(): Promise<{ adminId: string }>` — `redirect('/admin/login')` se sem sessão. Chamado no `layout.tsx` protegido **e** no início de toda Server Action/route handler do painel.
  - `signIn(prev, formData)` Server Action: e-mail (minúsculo) + senha; erro genérico "E-mail ou senha incorretos."; limite `5/15 min por IP`; sucesso → `redirect('/admin')`. `signOut()` Server Action.
  - `scripts/seed-admin.ts`: `pnpm seed:admin <email> <senha>` cria ou atualiza a senha (upsert por e-mail).

- [ ] **Step 1: Write the failing tests**
  - unit: `verifyPassword('abc', await hashPassword('abc')) === true`, senha errada `false`; JWT adulterado → `getSession` retorna `null` (testar a função de verificação pura, ex. `verifySessionToken(jwt)`, exportada de `session.ts`).
  - e2e: `/admin` sem sessão redireciona para `/admin/login`; login errado mostra "E-mail ou senha incorretos."; login certo (admin criado no globalSetup) chega em `/admin`; "Sair" volta ao login.
- [ ] **Step 2:** Rodar → FAIL. **Step 3:** Implementar. **Step 4:** Rodar → PASS.
- [ ] **Step 5:** Commit `feat(admin): login and panel session`.

---

### Task 12: Painel de convidados (CRUD, link, WhatsApp, CSV)

**Files:**
- Create: `src/features/guests/{schema.ts, csv.ts, whatsapp.ts, actions.ts}`, `src/app/admin/(protected)/guests/page.tsx`, `[id]/page.tsx`, `export/route.ts`, componentes em `src/components/admin/`
- Test: `src/features/guests/__tests__/csv.test.ts`, `whatsapp.test.ts`, `tests/e2e/admin-guests.spec.ts`

**Interfaces:**
- Consumes: repo (Task 3), `requireAdmin` (Task 11), `getSettings` (Task 4).
- Produces:
  - `guestFormSchema` (Zod): `name` 1..120 trim; `phone` opcional → `normalizePhone` ou erro "Telefone inválido"; `plusOnesLimit` int 0..6.
  - `inviteUrl(token: string): string` → `${APP_URL}/c/${token}`.
  - `whatsappUrl(g: {name: string; phone: string | null; token: string}, template: string): string` — substitui `{nome}` (primeiro nome) e `{link}`; com telefone → `https://wa.me/<dígitos sem +>?text=<encodeURIComponent>`; sem telefone → `https://wa.me/?text=...`.
  - `parseGuestsCsv(text: string): { valid: Array<{name; phone: string | null; plusOnesLimit: number}>; errors: Array<{line: number; reason: string}> }` — remove BOM, detecta separador `;` ou `,` (papaparse `delimitersToGuess`), cabeçalho obrigatório `nome`, opcionais `telefone`, `limite_acompanhantes` (default 0) — cabeçalhos do CSV ficam em pt-BR porque a família os edita —, ignora linhas vazias; telefone inválido vira erro da linha (não importa a linha). Os textos de `reason` são copy pt-BR.
  - `buildGuestsCsv(list: Guest[]): string` — separador `;`, BOM, colunas (cabeçalhos pt-BR) `nome;telefone;limite_acompanhantes;resposta;acompanhantes;recado;respondido_em;link` (data em `dd/mm/aaaa HH:mm` Boa Vista).
  - Server Actions (todas chamam `requireAdmin()`): `saveGuestAction(prev, formData)`, `deleteGuestAction(id)`, `importGuestsAction(prev, formData /* file */)` → `{ imported: number; errors }`.
  - `GET /admin/guests/export` → `text/csv; charset=utf-8`, `guests.csv`, exige admin.
  - UI: tabela com busca e filtro por resposta (Pendente/Sim/Não), colunas nome, telefone formatado, limite, resposta, pessoas, aberto?, ações "Copiar link", "Enviar pelo WhatsApp" (abre `whatsappUrl` em nova aba), "Editar", "Excluir" (confirmação inline, sem `window.confirm`). Formulário de novo/editar. Upload de CSV com relatório de erros por linha. Estilo simples com a paleta do convite (Jost para UI).

- [ ] **Step 1: Write the failing tests**
  - csv (Review Focus 5): texto `'﻿nome;telefone;limite_acompanhantes\nJoão Ávila;(95) 99123-4567;2\nMaria;;0\n\nPedro;123;1\n'` → `valid` = João (`+5595991234567`, 2) e Maria (null, 0); `errors = [{line: 5, reason: 'Telefone inválido'}]`; mesmo conteúdo com `,` dá o mesmo resultado; sem coluna `nome` → erro `{line: 1, reason: 'Cabeçalho "nome" obrigatório'}`; limite `9` → erro da linha "Limite deve ser de 0 a 6".
  - `buildGuestsCsv` starts with a BOM, uses `;`, and a message containing `;` and a line break comes out quoted.
  - whatsapp: `whatsappUrl({name:'João Ávila', phone:'+5595991234567', token:'abc'}, 'Olá, {nome}! {link}')` → começa com `https://wa.me/5595991234567?text=` e o texto decodificado é `Olá, João! https://<APP_URL>/c/abc`.
  - e2e: logado, cria "Ana Teste" com telefone e limite 1 → aparece na lista; "Copiar link" copia URL `/c/` (usar permissão de clipboard do Playwright); edita limite para 3; importa o CSV do teste acima → "2 importados, 1 erro (linha 5: Telefone inválido)"; exclui "Maria".
- [ ] **Step 2:** Rodar → FAIL. **Step 3:** Implementar. **Step 4:** Rodar → PASS.
- [ ] **Step 5:** Commit `feat(admin): guest management with CSV and WhatsApp`.

---

### Task 13: Resumo, recados e configurações do painel

**Files:**
- Create: `src/app/admin/(protected)/page.tsx`, `messages/page.tsx`, `settings/page.tsx`, `src/features/settings/schema.ts`, `src/features/settings/actions.ts`
- Test: `src/features/settings/__tests__/settings.test.ts`, `tests/e2e/admin-summary.spec.ts`

**Interfaces:**
- Consumes: `getSummary`, `listGuests` (Task 3); `getSettings`, `saveSettings` (Task 4); `requireAdmin` (Task 11).
- Produces:
  - Resumo: cartões "Convidados", "Confirmados", "Recusados", "Pendentes", "Pessoas confirmadas" (de `getSummary()`), lista "Abriram e não responderam" (`openedAt` não nulo e `rsvpStatus 'pending'`).
  - Recados (`/admin/messages`): lista de convidados com `message` não nulo, ordem `respondedAt desc`, mostrando nome, resposta e data.
  - `settingsFormSchema` (Zod): `rsvpDeadline` data `YYYY-MM-DD` entre hoje e `2026-12-26`; `contactInfo` ≤200; `closingMessage` ≤600; `whatsappInviteTemplate` ≤600 e deve conter `{link}`.
  - Server Action `saveSettingsAction(prev, formData)` com `requireAdmin()`.

- [ ] **Step 1: Write the failing tests**
  - settings: `whatsappInviteTemplate` sem `{link}` → erro "A mensagem precisa conter {link}."; `rsvpDeadline '2026-12-27'` → erro "O prazo deve ser antes da festa."; válido salva e `getSettings()` reflete.
  - e2e: com 2 sim (1 com 2 acompanhantes) e 1 pendente aberto, resumo mostra "Pessoas confirmadas 4" e o pendente em "Abriram e não responderam"; recado enviado via RSVP aparece em Recados; mudar prazo para 10/12 → página do convite mostra "responda até 10/12".
- [ ] **Step 2:** Rodar → FAIL. **Step 3:** Implementar. **Step 4:** Rodar → PASS.
- [ ] **Step 5:** Commit `feat(admin): summary, messages and settings`.

---
### Task 14: Deploy no Railway (staging e produção)

**Files:**
- Create: `Dockerfile`, `.dockerignore`, `scripts/migrate.ts`, `README.md` (seção "Deploy" e "Operação")
- Modify: `next.config.ts` (`output: 'standalone'`), `package.json` (`start` roda migração antes)

**Interfaces:**
- Consumes: tudo acima.
- Produces: imagem que no start executa `node scripts/migrate.js && node server.js`; health check `GET /api/health` → `200 {"ok":true}` após `SELECT 1`.

- [ ] **Step 1: Write the failing test** `src/app/api/health/__tests__/health.test.ts` — handler retorna 200 e `{ ok: true }` com banco de teste.
- [ ] **Step 2:** Rodar → FAIL. **Step 3:** Implementar rota de health, Dockerfile multi-stage (`node:22-alpine`, pnpm, `standalone`, copia `drizzle/` e `scripts/migrate`), `migrate.ts` usando `drizzle-orm/postgres-js/migrator`. **Step 4:** Rodar → PASS; `docker build .` → sucesso; `docker run` com `DATABASE_URL` local → `/api/health` 200.
- [ ] **Step 5:** No Railway (skill `railway:use-railway`; **pedir confirmação ao Felipe antes de criar recursos**): projeto `convite-xv`, ambientes `staging` e `production`, cada um com serviço Postgres e serviço `web` a partir do repositório/Dockerfile; variáveis `DATABASE_URL` (referência ao Postgres), `AUTH_SECRET` (aleatório 32 bytes), `APP_URL` (domínio do ambiente), `FEATURES=` vazio; health check `/api/health`. Rodar `pnpm seed:admin` contra cada ambiente com os e-mails que o Felipe informar.
- [ ] **Step 6:** Verificar em staging: abrir um convite criado pelo painel no celular, confirmar presença, ver no resumo; colar o link no WhatsApp (ou no depurador de prévias) e conferir a imagem da carta.
- [ ] **Step 7:** Commit `chore: Railway deploy with migration on start and health check`.

---

### Task 15: Passada final de qualidade (acessibilidade, movimento reduzido, performance)

**Files:**
- Create: `tests/e2e/a11y.spec.ts`
- Modify: componentes conforme o que os testes apontarem

**Interfaces:**
- Consumes: telas das Tasks 7–13.

- [ ] **Step 1: Write the failing test** `a11y.spec.ts` com `@axe-core/playwright` (instalar): convite (após entrar sem animação), RSVP e `/admin/convidados` sem violações `serious`/`critical`; com `reducedMotion: 'reduce'` o convite mostra conteúdo sem esperar animação (heading visível em < 500 ms após "Abrir o convite"); todos os botões de ação têm altura ≥ 44 px (medir com `boundingBox()` nos botões do RSVP e da abertura).
- [ ] **Step 2:** Rodar → anotar falhas. **Step 3:** Corrigir. **Step 4:** Rodar suíte completa `pnpm test && pnpm test:e2e` → tudo PASS; Lighthouse mobile no staging com Performance ≥ 85 e Acessibilidade ≥ 95 (registrar números no PR).
- [ ] **Step 5:** Commit `test: accessibility and reduced motion`.

---

## Ordem e prazo

Tasks 1–6 (fundação e domínio) → 7–10 (convite) → 11–13 (painel) → 14 (deploy em staging cedo: pode ser feito logo após a Task 7 para testar no celular) → 15. Meta: produção pronta e convidados cadastrados até **~25/11/2026**, deixando margem para enviar os convites até **30/11/2026**.
