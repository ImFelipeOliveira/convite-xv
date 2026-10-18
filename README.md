# Convite XV anos da Isabella

Convite digital com confirmação de presença (RSVP) e painel administrativo para a lista de convidados.

## Stack

- Next.js 16 (App Router, Cache Components) + React 19
- Postgres 17 + Drizzle ORM
- Tailwind CSS 4, Motion
- Vitest (unitários/integração) e Playwright (e2e)
- pino (logs em JSON no stdout)

## Setup local

```bash
docker compose up -d          # Postgres com os bancos `convite` e `convite_test`
cp .env.example .env.local    # preencha AUTH_SECRET (>= 32 caracteres)
pnpm install
pnpm db:migrate               # aplica as migrações no banco `convite`
pnpm seed:admin <email> <senha>
pnpm dev                      # http://localhost:3000
```

Gerar um `AUTH_SECRET`: `openssl rand -base64 32`.

## Testes

```bash
pnpm test        # unitários/integração (Vitest, usa DATABASE_URL_TEST)
pnpm test:e2e    # Playwright
```

Não rode `pnpm test` e `pnpm test:e2e` ao mesmo tempo: ambos usam o banco `convite_test` e se atrapalham.

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
| --- | --- | --- |
| `DATABASE_URL` | sim | String de conexão do Postgres. |
| `DATABASE_URL_TEST` | só em testes | Banco usado por Vitest/Playwright. |
| `APP_URL` | sim em produção | URL pública (ex.: `https://convite.example.com`). Usada em links, calendário e prévia do WhatsApp. Também é lida no **build** (veja Deploy). |
| `AUTH_SECRET` | sim | Segredo da sessão do admin, mínimo 32 caracteres. |
| `LOG_LEVEL` | não | Nível do pino (`info` por padrão). |
| `FEATURES` | não | Flags de funcionalidades separadas por vírgula; vazio por padrão. |

## Deploy (Railway)

Cada ambiente (`staging`, `production`) tem dois serviços: **Postgres** e **web** (build pelo `Dockerfile`).

- `DATABASE_URL`: referência ao Postgres do mesmo ambiente.
- `AUTH_SECRET`, `APP_URL`, `LOG_LEVEL`, `FEATURES`: variáveis do serviço `web`.
- **Build arg `APP_URL`**: o Next lê `APP_URL` durante o `next build` (metadados da prévia do convite), e o Railway repassa as variáveis do serviço como build args. Ela precisa estar definida no serviço e ser igual à usada em runtime; ao mudar o domínio, faça um novo deploy.
- Health check: `GET /api/health` → `200 {"ok":true}` (executa `SELECT 1`).
- Start: a imagem roda `node scripts/migrate.js && node server.js`, ou seja, migra o banco a cada start.
- Rate limit por IP lê `X-Forwarded-For` assumindo **um único proxy confiável** (o edge do Railway). Se colocar outro proxy/CDN na frente, ajuste `getClientIp`.

Teste local da imagem:

```bash
docker build --build-arg APP_URL=http://localhost:3000 -t convite-xv .
docker run --rm -p 3000:3000 \
  -e DATABASE_URL=postgres://convite:convite@host.docker.internal:5432/convite \
  -e APP_URL=http://localhost:3000 \
  -e AUTH_SECRET=<32+ caracteres> convite-xv
```

## Operação

- Criar/atualizar admin (aponte `DATABASE_URL` para o ambiente desejado):
  `DATABASE_URL=<url do ambiente> pnpm seed:admin <email> <senha>`
- Antes da festa, exporte o CSV da lista em **Painel > Convidados > Exportar CSV** e guarde como backup.
