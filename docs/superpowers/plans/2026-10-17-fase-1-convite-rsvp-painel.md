# Fase 1 — Convite, RSVP e Painel de Convidados · Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Colocar em produção no Railway, até 30/11/2026, o convite com link por convidado (abertura com lacre/portas, hero, "O dia", RSVP, encerramento), prévia de carta no WhatsApp e o painel administrativo de convidados.

**Architecture:** Um app Next.js (App Router, TypeScript) é o monolito: Server Components leem o Postgres via Drizzle, Server Actions fazem as escritas (RSVP, painel), rotas de handler servem `.ics`, CSV e imagem OG. Lógica de domínio fica em `src/features/<área>/` como funções puras ou serviços testáveis com Vitest contra um Postgres de teste; a UI segue as pranchas do Claude Design.

**Tech Stack:** Next.js (última estável via `create-next-app@latest`), React, TypeScript strict, pnpm, Tailwind CSS v4, Motion (`motion`), Drizzle ORM + `postgres` (postgres-js) + drizzle-kit, Zod, `nanoid`, `jose` (sessão), `bcryptjs`, `libphonenumber-js`, `papaparse`, Vitest, Playwright, Docker Compose (Postgres local).

**Spec:** `docs/superpowers/specs/2026-10-17-convite-xv-design.md`
**Design visual:** https://claude.ai/artifact/4JNcfs7qugLuMcH3m84ZMp (pranchas 01–07 e 10 são escopo desta fase). Para ler uma prancha: Artifact tool, `action: "read"`, `path: "project/<Nome>.dc.html"`.

**Fora desta fase (planos próprios depois):** Fase 2 Presentes, Fase 3 Pix/Asaas, Fase 4 Lembretes/Evolution API/pg-boss. Nesta fase os links para "Presentes" e "Pix" no encerramento só aparecem se a flag correspondente estiver ligada (Task 8), e ficam desligadas.

## Global Constraints

- Idioma único pt-BR; `<html lang="pt-BR">`.
- Evento: domingo, 27/12/2026, 10h, fuso `America/Boa_Vista` (UTC−4) = `2026-12-27T14:00:00Z`.
- Local: Sítio Lua Azul, Rodovia BR-401, Km 13, s/n, Zona Rural, Cantá–RR, 69390-000. Coordenadas `2.8350401,-60.6005423`. Links Maps/Waze exatamente como na prancha 06 (`Noite.dc.html`).
- Traje: "Livre — e com piscina. Não há traje definido: venha do jeito que se sentir bem. Traje de banho é indispensável."
- `limite_acompanhantes` inteiro 0..6; acompanhantes são só quantidade.
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
2. **RSVP enviado duas vezes ou reenviado depois de erro de rede** → a segunda chamada só sobrescreve com os mesmos dados; nada duplicado, `respondido_em` atualizado. Teste na Task 4.
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
  vitest.config.ts  vitest.setup.ts  playwright.config.ts
  scripts/seed-admin.ts              cria/atualiza admin
  drizzle/                           migrações geradas
  src/
    app/
      layout.tsx                     fontes, metadata noindex, lang
      globals.css                    Tailwind + tokens CSS
      page.tsx                       raiz neutra
      not-found.tsx                  "Convite não encontrado"
      c/[token]/page.tsx             convite
      c/[token]/agenda.ics/route.ts
      c/[token]/opengraph-image.tsx  imagem da carta (estática, igual p/ todos)
      admin/login/page.tsx
      admin/(protegido)/layout.tsx   guard + navegação
      admin/(protegido)/page.tsx     resumo
      admin/(protegido)/convidados/page.tsx
      admin/(protegido)/convidados/[id]/page.tsx
      admin/(protegido)/recados/page.tsx
      admin/(protegido)/config/page.tsx
      admin/(protegido)/convidados/exportar/route.ts
    server/db/{client.ts, schema.ts}
    features/
      evento/{evento.ts, ics.ts, flags.ts}
      config/{repo.ts, schema.ts}
      convidados/{token.ts, telefone.ts, repo.ts, csv.ts, whatsapp.ts, actions.ts, schema.ts}
      rsvp/{prazo.ts, schema.ts, service.ts, actions.ts}
      admin-auth/{senha.ts, sessao.ts, guard.ts, actions.ts}
    lib/rate-limit.ts
    components/
      ornamentos/{Lirio.tsx, Lacre.tsx, Monograma.tsx, Moldura.tsx}
      convite/{Abertura.tsx, Hero.tsx, ODia.tsx, Contagem.tsx, Rsvp.tsx, Encerramento.tsx, Revelar.tsx}
      admin/*                        componentes simples do painel
  tests/
    helpers/db.ts                    truncate + fábricas
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
  '--blush': '#F7DEDB', '--papel': '#FFF8F6', '--petala': '#F0C7C6', '--lirio': '#E07A9C',
  '--rosa': '#C25578', '--lacre': '#A8325E', '--rosa-profundo': '#8E3556', '--vinho': '#5A2136',
  '--bordo': '#2A1119', '--ouro': '#B8955A', '--ouro-claro': '#E3C891', '--ouro-texto': '#7A5629',
  '--salvia': '#2F6B4F', '--erro': '#9B1C1C',
  '--ease-carta': 'cubic-bezier(.22, 1, .36, 1)', '--ease-portas': 'cubic-bezier(.65, 0, .35, 1)',
  '--ease-lacre': 'cubic-bezier(.34, 1.56, .64, 1)', '--dur-micro': '160ms', '--dur-ui': '320ms',
  '--dur-revelar': '700ms', '--dur-cena': '1200ms', '--stagger': '80ms', '--revelar-y': '24px',
}
// expect(css).toContain(`${nome}: ${valor}`) para cada par
```

- [ ] **Step 4:** Rodar `pnpm vitest run src/app/__tests__/tokens.test.ts` → FAIL.
- [ ] **Step 5:** Escrever `globals.css` com `@import "tailwindcss"`, `:root` com os tokens acima, espaçamento base 4 (`--space-1:4px` … `--space-10:160px` conforme prancha 02), `@theme` mapeando as cores para utilitários (`bg-blush`, `text-vinho`…), `body{background:var(--blush);color:var(--vinho)}` e o bloco global `@media (prefers-reduced-motion: reduce)` da prancha 03. `layout.tsx`: `next/font/google` para as três fontes (Bodoni Moda com eixo `opsz` e itálico; Jost 300–600; Pinyon Script 400) como variáveis, `metadata.robots = { index: false, follow: false }`, `lang="pt-BR"`. `page.tsx`: página neutra com o monograma e "Este convite é pessoal. Use o link que você recebeu." `vitest.config.ts` com `vite-tsconfig-paths`, ambiente `node`, `setupFiles: ['vitest.setup.ts']`.
- [ ] **Step 6:** Rodar o teste → PASS; `pnpm build` → sucesso.
- [ ] **Step 7:** Commit `chore: scaffold Next.js com tokens do design e ambiente de teste`.

---

### Task 2: Schema do banco, cliente e helper de testes

**Files:**
- Create: `src/server/db/schema.ts`, `src/server/db/client.ts`, `drizzle.config.ts`, `tests/helpers/db.ts`, `drizzle/0000_*.sql` (gerado)
- Modify: `vitest.setup.ts`
- Test: `src/server/db/__tests__/schema.test.ts`

**Interfaces:**
- Produces:
  - `db` (Drizzle sobre postgres-js), exportado de `@/server/db/client`; em `NODE_ENV=test` usa `DATABASE_URL_TEST`.
  - Tabelas (`schema.ts`): `convidados`, `admins`, `config`. Enum `resposta` = `'pendente' | 'sim' | 'nao'`.
    - `convidados`: `id uuid pk default random`, `token text unique not null`, `nome text not null`, `telefone text null`, `limiteAcompanhantes int not null default 0` (check 0..6), `resposta resposta not null default 'pendente'`, `acompanhantes int not null default 0` (check ≥0), `recado text null`, `respondidoEm timestamptz null`, `abertoEm timestamptz null`, `criadoEm`, `atualizadoEm`.
    - `admins`: `id uuid`, `email text unique not null` (minúsculo), `senhaHash text not null`, `criadoEm`.
    - `config`: linha única `id int pk check (id = 1)`, `prazoConfirmacao date not null default '2026-12-13'`, `contatoDuvidas text null`, `msgEncerramento text null`, `msgConviteWhatsapp text not null` (default abaixo).
  - Tipos `Convidado = typeof convidados.$inferSelect`, `Config = typeof config.$inferSelect`.
  - `tests/helpers/db.ts`: `limparBanco(): Promise<void>` (TRUNCATE ... RESTART IDENTITY CASCADE das três tabelas) e `criarConvidado(over?: Partial<NovoConvidado>): Promise<Convidado>` (token aleatório, nome "Convidado Teste", limite 2).
- Default de `msgConviteWhatsapp` (texto exato): `Olá, {nome}! A Isabella vai fazer 15 anos e preparou um convite especial para você. Abra a carta: {link}`

- [ ] **Step 1: Write the failing test** `schema.test.ts`:
  - `insere convidado com defaults` → `resposta === 'pendente'`, `acompanhantes === 0`.
  - `rejeita limite 7` → insert com `limiteAcompanhantes: 7` lança erro de check.
  - `token é único` → segundo insert com mesmo token lança.
  - `config tem linha única` → insert `{id: 2}` lança.
- [ ] **Step 2:** `docker compose up -d`; rodar `pnpm vitest run src/server/db` → FAIL (módulo inexistente).
- [ ] **Step 3:** Escrever `schema.ts`, `client.ts`, `drizzle.config.ts`; `pnpm db:generate`; a migração deve incluir `INSERT INTO config (id) VALUES (1) ON CONFLICT DO NOTHING` (adicionar à mão no SQL gerado). `vitest.setup.ts`: roda `migrate()` no banco de teste uma vez (globalSetup) e `limparBanco()` + reinsere a linha de `config` em `beforeEach`. Vitest com `fileParallelism: false`.
- [ ] **Step 4:** Rodar → PASS.
- [ ] **Step 5:** Commit `feat(db): schema de convidados, admins e config`.

---

### Task 3: Token, telefone e repositório de convidados

**Files:**
- Create: `src/features/convidados/token.ts`, `telefone.ts`, `repo.ts`
- Test: `src/features/convidados/__tests__/token.test.ts`, `telefone.test.ts`, `repo.test.ts`

**Interfaces:**
- Produces:
  - `gerarToken(): string` — 22 chars de `[0-9A-Za-z]`.
  - `tokenValido(t: string): boolean` — regex `^[0-9A-Za-z]{22}$`.
  - `normalizarTelefone(entrada: string): string | null` — `libphonenumber-js`, país padrão `BR`, retorna E.164 se `isValid()`, senão `null`.
  - `formatarTelefone(e164: string): string` — formato nacional `(95) 99123-4567`.
  - `buscarPorToken(token: string): Promise<Convidado | null>` — retorna `null` sem consultar o banco se `!tokenValido(token)`.
  - `registrarAbertura(id: string): Promise<void>` — seta `abertoEm = now()` só se for null.
  - `criarConvidado(d: {nome; telefone?: string | null; limiteAcompanhantes: number}): Promise<Convidado>` (gera token; re-tenta 1× em colisão).
  - `atualizarConvidado(id, d: Partial<{nome; telefone; limiteAcompanhantes}>): Promise<Convidado>`
  - `removerConvidado(id): Promise<void>`
  - `listarConvidados(filtro?: {resposta?: Resposta; busca?: string}): Promise<Convidado[]>` — ordenado por nome, `busca` em `nome ILIKE`.
  - `resumo(): Promise<{convidados: number; sim: number; nao: number; pendente: number; pessoasConfirmadas: number}>` — `pessoasConfirmadas = Σ(1 + acompanhantes)` dos `sim`.

- [ ] **Step 1: Write the failing tests**
  - token: `gerarToken()` casa `/^[0-9A-Za-z]{22}$/`; 1000 gerações sem repetição; `tokenValido('abc') === false`; `tokenValido('../admin' + 'x'.repeat(14)) === false`.
  - telefone (Review Focus 5): `'(95) 99123-4567' → '+5595991234567'`; `'95991234567' → '+5595991234567'`; `'+55 95 99123-4567' → '+5595991234567'`; `'(95) 3224-1234' → '+559532241234'`; `'123' → null`; `'' → null`; `formatarTelefone('+5595991234567') === '(95) 99123-4567'`.
  - repo: `buscarPorToken` com token malformado retorna `null`; com token válido inexistente retorna `null`; `registrarAbertura` duas vezes mantém o primeiro timestamp; `resumo()` com 1 sim+2 acompanhantes, 1 sim+0, 1 nao, 1 pendente → `{convidados:4, sim:2, nao:1, pendente:1, pessoasConfirmadas:4}`.
- [ ] **Step 2:** Rodar `pnpm vitest run src/features/convidados` → FAIL.
- [ ] **Step 3:** Implementar os três módulos.
- [ ] **Step 4:** Rodar → PASS.
- [ ] **Step 5:** Commit `feat(convidados): token, telefone e repositório`.

---

### Task 4: Serviço de RSVP (prazo, validação, telefone opcional)

**Files:**
- Create: `src/features/rsvp/prazo.ts`, `schema.ts`, `service.ts`, `actions.ts`; `src/features/config/repo.ts`
- Test: `src/features/rsvp/__tests__/prazo.test.ts`, `service.test.ts`

**Interfaces:**
- Consumes: `buscarPorToken`, `normalizarTelefone` (Task 3); `db`, `config` (Task 2).
- Produces:
  - `obterConfig(): Promise<Config>`; `salvarConfig(d: Partial<Omit<Config,'id'>>): Promise<Config>` (em `config/repo.ts`).
  - `prazoEncerrado(prazo: string /* 'YYYY-MM-DD' */, agora: Date): boolean` — encerrado quando `agora > fim do dia em America/Boa_Vista` (fim = `${prazo}T23:59:59.999-04:00`; Roraima não tem horário de verão, offset fixo −04:00).
  - `rsvpSchema` (Zod): `{ token: string, resposta: 'sim'|'nao', acompanhantes: int ≥0 default 0, recado: string ≤500 trim opcional, telefone: string opcional }`.
  - `type RsvpResultado = { ok: true; convidado: Convidado } | { ok: false; erro: 'nao_encontrado' | 'prazo_encerrado' | 'acima_do_limite' | 'telefone_invalido' | 'invalido' }`
  - `responderRsvp(entrada: unknown, agora = new Date()): Promise<RsvpResultado>` — regras:
    - token inexistente → `nao_encontrado`; prazo encerrado → `prazo_encerrado`;
    - `resposta === 'nao'` força `acompanhantes = 0`, ignora telefone;
    - `acompanhantes > limiteAcompanhantes` → `acima_do_limite`;
    - telefone só é considerado se o convidado **não** tem telefone cadastrado e `resposta === 'sim'`; vazio = ignorado; não normalizável → `telefone_invalido`;
    - grava `resposta`, `acompanhantes`, `recado` (null se vazio), `respondidoEm = agora`, e `telefone` quando aplicável. Mesma entrada repetida = mesmo estado (idempotente).
  - Server Action `enviarRsvp(prev: RsvpResultado | null, formData: FormData): Promise<RsvpResultado>` em `actions.ts` (`'use server'`), aplica rate limit (Task 6 — até lá, sem limite) e chama `responderRsvp`.
  - `mensagemErroRsvp(erro): string` — textos: `nao_encontrado` "Convite não encontrado."; `prazo_encerrado` "O prazo para responder terminou. Fale com a família pelo contato abaixo."; `acima_do_limite` "Seu convite inclui até {n} acompanhantes."; `telefone_invalido` "Telefone inválido. Use DDD + número."; `invalido` "Não conseguimos enviar agora. Sua resposta não foi perdida — toque em enviar de novo."

- [ ] **Step 1: Write the failing tests**
  - prazo (Review Focus 4): `prazoEncerrado('2026-12-13', new Date('2026-12-14T03:30:00Z')) === false`; `prazoEncerrado('2026-12-13', new Date('2026-12-14T04:01:00Z')) === true`; `prazoEncerrado('2026-12-13', new Date('2026-12-01T12:00:00Z')) === false`.
  - service:
    - `sim com 2 acompanhantes dentro do limite 2` → ok, `resposta 'sim'`, `acompanhantes 2`, `respondidoEm` setado.
    - `acima do limite` (limite 1, envia 2) → `acima_do_limite`, banco inalterado (Review Focus 3).
    - `acompanhantes negativo` → `invalido`.
    - `nao zera acompanhantes` (envia `nao` com 3) → ok, `acompanhantes 0`.
    - `reenvio idêntico` duas vezes → ok nas duas, um só convidado, estado igual (Review Focus 2).
    - `alterar de sim para nao` → ok, estado atualizado.
    - `prazo encerrado` (config `prazoConfirmacao '2026-12-13'`, agora `2026-12-14T05:00Z`) → `prazo_encerrado`.
    - `telefone salvo quando ausente`: convidado sem telefone, `sim`, `telefone '(95) 99123-4567'` → `telefone '+5595991234567'`.
    - `telefone ignorado quando já cadastrado`: convidado com `+5595900000000`, envia outro → mantém o original.
    - `telefone inválido` → `telefone_invalido`.
    - `token inexistente` → `nao_encontrado`.
    - `recado com 501 chars` → `invalido`.
- [ ] **Step 2:** Rodar `pnpm vitest run src/features/rsvp` → FAIL.
- [ ] **Step 3:** Implementar `prazo.ts`, `config/repo.ts`, `schema.ts`, `service.ts`, `actions.ts`.
- [ ] **Step 4:** Rodar → PASS.
- [ ] **Step 5:** Commit `feat(rsvp): serviço com prazo, limite e telefone opcional`.

---

### Task 5: Dados do evento, flags e arquivo .ics

**Files:**
- Create: `src/features/evento/evento.ts`, `ics.ts`, `flags.ts`, `src/app/c/[token]/agenda.ics/route.ts`
- Test: `src/features/evento/__tests__/ics.test.ts`, `flags.test.ts`

**Interfaces:**
- Produces:
  - `EVENTO` (const): `{ aniversariante: 'Isabella', inicio: '2026-12-27T14:00:00Z', fuso: 'America/Boa_Vista', duracaoHoras: 8, local: { nome: 'Sítio Lua Azul', endereco: 'Rodovia BR-401, Km 13, s/n · Zona Rural', cidade: 'Cantá – RR · 69390-000', lat: 2.8350401, lng: -60.6005423, mapsUrl, wazeUrl }, traje: { titulo: 'Livre — e com piscina.', texto: 'Não há traje definido: venha do jeito que se sentir bem. Traje de banho é indispensável.' } }` — URLs copiadas da prancha 06. [decisão do plano: duração 8 h no .ics]
  - `gerarIcs(convite: { nome: string; link: string }): string` — VCALENDAR/VEVENT com `UID: xv-isabella-2026@convite`, `DTSTART:20261227T140000Z`, `DTEND:20261227T220000Z`, `SUMMARY:XV anos da Isabella`, `LOCATION` com nome + endereço + cidade (vírgulas escapadas `\,`), `DESCRIPTION` com o link, linhas CRLF, `VALARM` 1 dia antes.
  - `GET /c/[token]/agenda.ics` → 404 se token não existe; senão `text/calendar; charset=utf-8`, `Content-Disposition: attachment; filename="xv-isabella.ics"`.
  - `featureAtiva(nome: 'presentes' | 'pix'): boolean` — lê `process.env.FEATURES` (lista separada por vírgula).

- [ ] **Step 1: Write the failing tests** — `gerarIcs` contém `DTSTART:20261227T140000Z`, `DTEND:20261227T220000Z`, `SUMMARY:XV anos da Isabella`, `LOCATION:Sítio Lua Azul\, Rodovia BR-401`, `BEGIN:VALARM`, todas as quebras são `\r\n`; `featureAtiva('pix')` é `false` com `FEATURES=''` e `true` com `FEATURES='presentes,pix'`.
- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Rodar → PASS.
- [ ] **Step 5:** Commit `feat(evento): dados fixos, flags e .ics`.

---

### Task 6: Rate limit das rotas públicas

**Files:**
- Create: `src/lib/rate-limit.ts`
- Modify: `src/features/rsvp/actions.ts`, `src/app/c/[token]/agenda.ics/route.ts` (a página do convite aplica o limite na Task 7)
- Test: `src/lib/__tests__/rate-limit.test.ts`

**Interfaces:**
- Produces: `limitar(chave: string, opts: { max: number; janelaMs: number }, agora = Date.now()): { ok: boolean; restante: number }` — janela deslizante em memória (Map), poda entradas expiradas; `ipDaRequisicao(headers: Headers): string` (primeiro IP de `x-forwarded-for`, senão `'local'`).
- Limites: abrir convite/ics `60/min por IP`; `enviarRsvp` `10/min por IP+token`. Excedido no convite → `notFound()` (Review Focus 1: não revela nada); no RSVP → `{ ok:false, erro:'invalido' }`.

- [ ] **Step 1: Write the failing tests** — 3 chamadas com `max 3` ok, 4ª `ok:false`; após `janelaMs` volta a `ok:true`; chaves diferentes não interferem; `ipDaRequisicao` com `'1.1.1.1, 2.2.2.2'` → `'1.1.1.1'`.
- [ ] **Step 2:** Rodar → FAIL. **Step 3:** Implementar e aplicar em `enviarRsvp` e na rota `.ics`. **Step 4:** Rodar → PASS.
- [ ] **Step 5:** Commit `feat: rate limit nas rotas públicas`.

---

### Task 7: Ornamentos e Abertura (lacre e portas)

**Files:**
- Create: `src/components/ornamentos/{Lirio.tsx, Lacre.tsx, Monograma.tsx, Moldura.tsx}`, `src/components/convite/Abertura.tsx`, `src/app/c/[token]/page.tsx`, `src/app/not-found.tsx`
- Test: `tests/e2e/abertura.spec.ts`, `playwright.config.ts`

**Interfaces:**
- Consumes: `buscarPorToken`, `registrarAbertura` (Task 3), `limitar`, `ipDaRequisicao` (Task 6).
- Produces:
  - `<Lirio className? animar?: boolean atraso?: number />`, `<Lacre />`, `<Monograma letra="I" />`, `<Moldura dupla />` — SVG portados das pranchas 04/05 (paths e gradientes idênticos), com `aria-hidden` quando decorativos.
  - `<Abertura nome="Isabella" onAberto?: () => void>{children}</Abertura>` — client component; fases `closed → press (170 ms) → opening → open (1700 ms)` como em `Abertura.dc.html`; botão "Abrir o convite" (lacre, `aria-label`), botão "Entrar sem animação"; grava `localStorage['xv:aberto']='1'` (try/catch) e, em visitas seguintes, pula as portas e roda a versão curta de 900 ms; respeita reduced motion (crossfade 300 ms).
  - `page.tsx`: `params.token` → rate limit → `buscarPorToken` → `notFound()` se null → `registrarAbertura` → renderiza `<Abertura>` envolvendo as seções (Tasks 8–9 preenchem). `export const dynamic = 'force-dynamic'`.
  - `not-found.tsx`: "Convite não encontrado." + "Confira se o link está completo." no estilo do convite, status 404.

- [ ] **Step 1: Write the failing e2e test** `abertura.spec.ts` (viewport 390×844; um `globalSetup` do Playwright migra o banco de teste, cria um convidado com token fixo `TesteE2E00000000000001` e um admin `admin@teste.local` / `senha-teste`; o servidor de teste roda com `DATABASE_URL=$DATABASE_URL_TEST` e `APP_URL=http://localhost:3000`):
  - `mostra o lacre e abre ao tocar`: vê botão "Abrir o convite"; clica; em até 3 s vê heading "Isabella" e o botão do lacre some.
  - `entrar sem animação`: clica "Entrar sem animação" → conteúdo visível imediatamente.
  - `segunda visita pula as portas`: após abrir, recarrega → botão "Abrir o convite" não aparece.
  - `token inexistente dá 404`: `page.goto('/c/zzzzzzzzzzzzzzzzzzzzzz')` → status 404 e texto "Convite não encontrado."
- [ ] **Step 2:** `pnpm test:e2e abertura` → FAIL.
- [ ] **Step 3:** Ler `project/Abertura.dc.html` e `project/Hero.dc.html` da prancha (instruções no cabeçalho) e portar os SVG e as classes CSS (`door`, `half`, `ring`, `petal`) para componentes; transições de portas/lacre em CSS como na prancha; Motion só onde a prancha 03 indica.
- [ ] **Step 4:** Rodar → PASS.
- [ ] **Step 5:** Commit `feat(convite): abertura com lacre e portas`.

---

### Task 8: Hero, O dia (contagem e local) e Encerramento

**Files:**
- Create: `src/components/convite/{Hero.tsx, ODia.tsx, Contagem.tsx, Encerramento.tsx, Revelar.tsx}`
- Modify: `src/app/c/[token]/page.tsx`
- Test: `src/components/convite/__tests__/contagem.test.ts`, `tests/e2e/convite.spec.ts`

**Interfaces:**
- Consumes: `EVENTO`, `featureAtiva` (Task 5); `obterConfig` (Task 4); ornamentos (Task 7).
- Produces:
  - `partesContagem(alvoIso: string, agora: number): { dias: number; horas: number; min: number; seg: number; encerrado: boolean }` — exportada de `Contagem.tsx` (ou módulo irmão), `dias` limitado a 99, como na prancha 06.
  - `<Revelar>` — wrapper Motion `whileInView` (20% visível, uma vez, sobe `--revelar-y`, stagger 80 ms, máx. 6 itens).
  - `<Hero nome visual="lirio">` — prancha 05 (coreografia 0–3 s da prancha 03); CTA "Confirmar presença" ancora em `#rsvp`, link "O dia" em `#o-dia`.
  - `<ODia>` — prancha 06: data, odômetro, "É hoje" quando encerrado, "Adicionar à agenda" → `/c/{token}/agenda.ics`, local, botões Google Maps/Waze, traje, contato de `config.contatoDuvidas` (oculta o bloco se null).
  - `<Encerramento mensagem={config.msgEncerramento}>` — prancha 10 com faixa animada pausável; atalhos "Presença IV · Local III" sempre; "Presentes V · Pix VI" só se `featureAtiva`.

- [ ] **Step 1: Write the failing tests**
  - `partesContagem('2026-12-27T14:00:00Z', Date.parse('2026-12-26T13:00:00Z'))` → `{dias:1, horas:1, min:0, seg:0, encerrado:false}`; com `agora` depois do alvo → `encerrado:true` e zeros; 200 dias antes → `dias:99`.
  - e2e `convite.spec.ts`: após entrar sem animação vê "Sítio Lua Azul", link "Google Maps" com `href` contendo `2.8350401`, link "Adicionar à agenda" que baixa um arquivo `.ics`, texto "Traje de banho é indispensável." e **não** vê "Presentes" no encerramento (flags desligadas).
- [ ] **Step 2:** Rodar → FAIL. **Step 3:** Implementar portando `Hero.dc.html`, `Noite.dc.html`, `Final.dc.html`. **Step 4:** Rodar → PASS.
- [ ] **Step 5:** Commit `feat(convite): hero, o dia e encerramento`.

---

### Task 9: Tela de RSVP

**Files:**
- Create: `src/components/convite/Rsvp.tsx`
- Modify: `src/app/c/[token]/page.tsx`
- Test: `tests/e2e/rsvp.spec.ts`

**Interfaces:**
- Consumes: `enviarRsvp`, `mensagemErroRsvp`, `prazoEncerrado` (Task 4); `formatarTelefone` (Task 3).
- Produces: `<Rsvp convidado={{nome, resposta, acompanhantes, recado, limiteAcompanhantes, temTelefone, respondidoEm}} token prazo encerrado contato />` — client component com `useActionState(enviarRsvp)`; seção `id="rsvp"`. Estados e textos da prancha 07: badge AGUARDANDO RESPOSTA / CONFIRMADA / RECUSADA; "Olá, {nome}. Este convite é só seu — responda até {prazo dd/mm}."; opções "Vou com certeza" / "Não poderei ir"; contador de acompanhantes com texto de limite (`Este convite é individual.` quando 0); recado opcional; campo **"Seu WhatsApp para lembretes (opcional)"** só quando `resposta escolhida === 'sim' && !temTelefone`, com a frase "Usaremos só para lembrar você da festa." (estilo CAMPOS da prancha 02); botão "Confirmar presença"/"Enviar resposta"/"Enviando…"; telas finais "Presença confirmada. Até lá!" (com "Resposta registrada em dd/mm às HHhMM", "Adicionar à agenda", "Alterar resposta") e "Que pena. Obrigada por avisar."; erro com mensagem de `mensagemErroRsvp` mantendo o formulário preenchido; animação de confirmação (prancha 03, primitiva 12) só após `ok:true`; depois do prazo, mostra a resposta atual só leitura + contato. Valores iniciais vêm do convidado (resposta já dada abre direto na tela final). Acompanhantes exibidos com `min(acompanhantes, limite)`.

- [ ] **Step 1: Write the failing e2e test** `rsvp.spec.ts` (convidado de teste com limite 2, sem telefone; banco limpo a cada teste):
  - `confirma com acompanhantes e telefone`: escolhe "Vou com certeza", clica "+" duas vezes (o "+" fica desabilitado), preenche WhatsApp `(95) 99123-4567`, envia → vê "Presença confirmada. Até lá!" e "Você + 2"; recarrega a página → continua na tela confirmada.
  - `recusa`: escolhe "Não poderei ir" → campo de WhatsApp não aparece; envia → "Que pena. Obrigada por avisar."
  - `alterar resposta`: depois de confirmar, "Alterar resposta" → formulário com a escolha anterior marcada.
  - `telefone inválido`: WhatsApp `123` → mensagem "Telefone inválido. Use DDD + número." e campos preservados.
- [ ] **Step 2:** Rodar → FAIL. **Step 3:** Implementar portando `RSVP.dc.html`. **Step 4:** Rodar → PASS.
- [ ] **Step 5:** Commit `feat(convite): tela de confirmação de presença`.

---

### Task 10: Prévia do link (carta) e metadados

**Files:**
- Create: `src/app/c/[token]/opengraph-image.tsx`, `public/og/` (se usar asset estático)
- Modify: `src/app/c/[token]/page.tsx` (`generateMetadata`)
- Test: `tests/e2e/og.spec.ts`

**Interfaces:**
- Consumes: `EVENTO`.
- Produces: imagem 1200×630 PNG via `ImageResponse`, **igual para todos os tokens** e **sem nome do convidado**: envelope fechado em blush com moldura dourada dupla, lacre "I" no centro, "Isabella" em Pinyon Script e "XV ANOS · 27.12.2026" em Bodoni (fontes carregadas como ArrayBuffer de `public/fonts/` ou Google Fonts no build). `generateMetadata`: `title: 'Isabella · XV anos'`, `description: 'Você recebeu um convite. Toque para abrir a carta.'`, `openGraph.type 'website'`, `metadataBase = new URL(process.env.APP_URL)`. Arquivo final < 300 KB.

- [ ] **Step 1: Write the failing test** — request a `/c/TesteE2E00000000000001` → HTML contém `<meta property="og:image"` com URL absoluta começando por `APP_URL`, `og:title` "Isabella · XV anos"; request à URL da imagem → status 200, `content-type: image/png`, tamanho < 300 000 bytes; HTML não contém o nome do convidado de teste em nenhuma tag `og:`.
- [ ] **Step 2:** Rodar → FAIL. **Step 3:** Implementar. **Step 4:** Rodar → PASS.
- [ ] **Step 5:** Commit `feat(convite): prévia de carta para WhatsApp`.

---

### Task 11: Autenticação do painel

**Files:**
- Create: `src/features/admin-auth/{senha.ts, sessao.ts, guard.ts, actions.ts}`, `scripts/seed-admin.ts`, `src/app/admin/login/page.tsx`, `src/app/admin/(protegido)/layout.tsx`
- Test: `src/features/admin-auth/__tests__/auth.test.ts`, `tests/e2e/admin-login.spec.ts`

**Interfaces:**
- Produces:
  - `hashSenha(s: string): Promise<string>` (bcryptjs, custo 12); `conferirSenha(s, hash): Promise<boolean>`.
  - `criarSessao(adminId: string): Promise<void>` — JWT HS256 (`jose`, segredo `AUTH_SECRET`), expira em 30 dias, cookie `xv_admin` httpOnly, `secure` em produção, `sameSite: 'lax'`, `path: '/'`.
  - `lerSessao(): Promise<{ adminId: string } | null>`; `encerrarSessao(): Promise<void>`.
  - `exigirAdmin(): Promise<{ adminId: string }>` — `redirect('/admin/login')` se sem sessão. Chamado no `layout.tsx` protegido **e** no início de toda Server Action/route handler do painel.
  - `entrar(prev, formData)` Server Action: e-mail (minúsculo) + senha; erro genérico "E-mail ou senha incorretos."; limite `5/15 min por IP`; sucesso → `redirect('/admin')`. `sair()` Server Action.
  - `scripts/seed-admin.ts`: `pnpm seed:admin <email> <senha>` cria ou atualiza a senha (upsert por e-mail).

- [ ] **Step 1: Write the failing tests**
  - unit: `conferirSenha('abc', await hashSenha('abc')) === true`, senha errada `false`; JWT adulterado → `lerSessao` retorna `null` (testar a função de verificação pura, ex. `verificarToken(jwt)`, exportada de `sessao.ts`).
  - e2e: `/admin` sem sessão redireciona para `/admin/login`; login errado mostra "E-mail ou senha incorretos."; login certo (admin criado no globalSetup) chega em `/admin`; "Sair" volta ao login.
- [ ] **Step 2:** Rodar → FAIL. **Step 3:** Implementar. **Step 4:** Rodar → PASS.
- [ ] **Step 5:** Commit `feat(admin): login e sessão do painel`.

---

### Task 12: Painel de convidados (CRUD, link, WhatsApp, CSV)

**Files:**
- Create: `src/features/convidados/{schema.ts, csv.ts, whatsapp.ts, actions.ts}`, `src/app/admin/(protegido)/convidados/page.tsx`, `[id]/page.tsx`, `exportar/route.ts`, componentes em `src/components/admin/`
- Test: `src/features/convidados/__tests__/csv.test.ts`, `whatsapp.test.ts`, `tests/e2e/admin-convidados.spec.ts`

**Interfaces:**
- Consumes: repo (Task 3), `exigirAdmin` (Task 11), `obterConfig` (Task 4).
- Produces:
  - `convidadoFormSchema` (Zod): `nome` 1..120 trim; `telefone` opcional → `normalizarTelefone` ou erro "Telefone inválido"; `limiteAcompanhantes` int 0..6.
  - `linkConvite(token: string): string` → `${APP_URL}/c/${token}`.
  - `linkWhatsApp(c: {nome: string; telefone: string | null; token: string}, modelo: string): string` — substitui `{nome}` (primeiro nome) e `{link}`; com telefone → `https://wa.me/<dígitos sem +>?text=<encodeURIComponent>`; sem telefone → `https://wa.me/?text=...`.
  - `lerCsvConvidados(texto: string): { validos: Array<{nome; telefone: string | null; limiteAcompanhantes: number}>; erros: Array<{linha: number; motivo: string}> }` — remove BOM, detecta separador `;` ou `,` (papaparse `delimitersToGuess`), cabeçalho obrigatório `nome`, opcionais `telefone`, `limite_acompanhantes` (default 0), ignora linhas vazias; telefone inválido vira erro da linha (não importa a linha).
  - `gerarCsvConvidados(lista: Convidado[]): string` — separador `;`, BOM, colunas `nome;telefone;limite_acompanhantes;resposta;acompanhantes;recado;respondido_em;link` (data em `dd/mm/aaaa HH:mm` Boa Vista).
  - Server Actions (todas chamam `exigirAdmin()`): `salvarConvidado(prev, formData)`, `excluirConvidado(id)`, `importarConvidados(prev, formData /* file */)` → `{ importados: number; erros }`.
  - `GET /admin/convidados/exportar` → `text/csv; charset=utf-8`, `convidados.csv`, exige admin.
  - UI: tabela com busca e filtro por resposta (Pendente/Sim/Não), colunas nome, telefone formatado, limite, resposta, pessoas, aberto?, ações "Copiar link", "Enviar pelo WhatsApp" (abre `linkWhatsApp` em nova aba), "Editar", "Excluir" (confirmação inline, sem `window.confirm`). Formulário de novo/editar. Upload de CSV com relatório de erros por linha. Estilo simples com a paleta do convite (Jost para UI).

- [ ] **Step 1: Write the failing tests**
  - csv (Review Focus 5): texto `'﻿nome;telefone;limite_acompanhantes\nJoão Ávila;(95) 99123-4567;2\nMaria;;0\n\nPedro;123;1\n'` → `validos` = João (`+5595991234567`, 2) e Maria (null, 0); `erros = [{linha: 5, motivo: 'Telefone inválido'}]`; mesmo conteúdo com `,` dá o mesmo resultado; sem coluna `nome` → erro `{linha: 1, motivo: 'Cabeçalho "nome" obrigatório'}`; limite `9` → erro da linha "Limite deve ser de 0 a 6".
  - `gerarCsvConvidados` começa com BOM, usa `;`, e um recado com `;` e quebra de linha sai entre aspas.
  - whatsapp: `linkWhatsApp({nome:'João Ávila', telefone:'+5595991234567', token:'abc'}, 'Olá, {nome}! {link}')` → começa com `https://wa.me/5595991234567?text=` e o texto decodificado é `Olá, João! https://<APP_URL>/c/abc`.
  - e2e: logado, cria "Ana Teste" com telefone e limite 1 → aparece na lista; "Copiar link" copia URL `/c/` (usar permissão de clipboard do Playwright); edita limite para 3; importa o CSV do teste acima → "2 importados, 1 erro (linha 5: Telefone inválido)"; exclui "Maria".
- [ ] **Step 2:** Rodar → FAIL. **Step 3:** Implementar. **Step 4:** Rodar → PASS.
- [ ] **Step 5:** Commit `feat(admin): gestão de convidados com CSV e WhatsApp`.

---

### Task 13: Resumo, recados e configurações do painel

**Files:**
- Create: `src/app/admin/(protegido)/page.tsx`, `recados/page.tsx`, `config/page.tsx`, `src/features/config/schema.ts`, `src/features/config/actions.ts`
- Test: `src/features/config/__tests__/config.test.ts`, `tests/e2e/admin-resumo.spec.ts`

**Interfaces:**
- Consumes: `resumo`, `listarConvidados` (Task 3); `obterConfig`, `salvarConfig` (Task 4); `exigirAdmin` (Task 11).
- Produces:
  - Resumo: cartões "Convidados", "Confirmados", "Recusados", "Pendentes", "Pessoas confirmadas" (de `resumo()`), lista "Abriram e não responderam" (`abertoEm` não nulo e `resposta 'pendente'`).
  - Recados: lista de convidados com `recado` não nulo, ordem `respondidoEm desc`, mostrando nome, resposta e data.
  - `configFormSchema` (Zod): `prazoConfirmacao` data `YYYY-MM-DD` entre hoje e `2026-12-26`; `contatoDuvidas` ≤200; `msgEncerramento` ≤600; `msgConviteWhatsapp` ≤600 e deve conter `{link}`.
  - Server Action `salvarConfiguracoes(prev, formData)` com `exigirAdmin()`.

- [ ] **Step 1: Write the failing tests**
  - config: `msgConviteWhatsapp` sem `{link}` → erro "A mensagem precisa conter {link}."; `prazoConfirmacao '2026-12-27'` → erro "O prazo deve ser antes da festa."; válido salva e `obterConfig()` reflete.
  - e2e: com 2 sim (1 com 2 acompanhantes) e 1 pendente aberto, resumo mostra "Pessoas confirmadas 4" e o pendente em "Abriram e não responderam"; recado enviado via RSVP aparece em Recados; mudar prazo para 10/12 → página do convite mostra "responda até 10/12".
- [ ] **Step 2:** Rodar → FAIL. **Step 3:** Implementar. **Step 4:** Rodar → PASS.
- [ ] **Step 5:** Commit `feat(admin): resumo, recados e configurações`.

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
- [ ] **Step 7:** Commit `chore: deploy Railway com migração no start e health check`.

---

### Task 15: Passada final de qualidade (acessibilidade, movimento reduzido, performance)

**Files:**
- Create: `tests/e2e/a11y.spec.ts`
- Modify: componentes conforme o que os testes apontarem

**Interfaces:**
- Consumes: telas das Tasks 7–13.

- [ ] **Step 1: Write the failing test** `a11y.spec.ts` com `@axe-core/playwright` (instalar): convite (após entrar sem animação), RSVP e `/admin/convidados` sem violações `serious`/`critical`; com `reducedMotion: 'reduce'` o convite mostra conteúdo sem esperar animação (heading visível em < 500 ms após "Abrir o convite"); todos os botões de ação têm altura ≥ 44 px (medir com `boundingBox()` nos botões do RSVP e da abertura).
- [ ] **Step 2:** Rodar → anotar falhas. **Step 3:** Corrigir. **Step 4:** Rodar suíte completa `pnpm test && pnpm test:e2e` → tudo PASS; Lighthouse mobile no staging com Performance ≥ 85 e Acessibilidade ≥ 95 (registrar números no PR).
- [ ] **Step 5:** Commit `test: acessibilidade e movimento reduzido`.

---

## Ordem e prazo

Tasks 1–6 (fundação e domínio) → 7–10 (convite) → 11–13 (painel) → 14 (deploy em staging cedo: pode ser feito logo após a Task 7 para testar no celular) → 15. Meta: produção pronta e convidados cadastrados até **~25/11/2026**, deixando margem para enviar os convites até **30/11/2026**.
