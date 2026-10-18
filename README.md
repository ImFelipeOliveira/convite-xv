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
| `EVOLUTION_URL` | para WhatsApp | URL da Evolution API (produção: `http://evolution.railway.internal:8080`; local: `http://localhost:8080`). Sem ela, o painel mostra o WhatsApp como não configurado. |
| `EVOLUTION_API_KEY` | para WhatsApp | Mesma chave definida em `AUTHENTICATION_API_KEY` na Evolution. Segredo, nunca versionar. |
| `EVOLUTION_INSTANCE` | para WhatsApp | Nome da instância (`convite-xv`). |
| `DISPATCHER_ENABLED` | não | Dispatcher dos lembretes automáticos; ligado por padrão, `false` desliga (usado nos testes e2e). |

## WhatsApp (Evolution API)

O envio usa a [Evolution API](https://doc.evolution-api.com) v2, um serviço separado que fala com o WhatsApp Web. Ele permite:

- enviar o convite **um por um** pelo painel (Painel › Convidados);
- lembretes automáticos **D-7** e **D-1** da festa;
- **lembrete de confirmação** (5 dias após o convite) e **aviso final** para quem ainda não respondeu o RSVP.

### Conectar o número

1. Use um **chip dedicado** ao convite.
2. Abra **Painel › WhatsApp › Conectar número**.
3. No celular do chip, vá em WhatsApp › Aparelhos conectados › Conectar um aparelho e leia o QR code **a partir de outro dispositivo** (o QR aparece na tela do computador).

### Boas práticas anti-banimento

- Chip dedicado; **nunca** use o número pessoal.
- Volume baixo: só a lista de convidados, sem mensagens em massa para desconhecidos.
- O intervalo aleatório de 20 a 60 s entre envios já é aplicado pelo sistema.
- Aqueça o número com algumas conversas reais (com amigos/família) antes do primeiro envio.
- Mesmo assim, existe risco de banimento: mantenha o link do convite como alternativa (copiar/compartilhar manualmente).

### Serviço no Railway

Serviço `evolution` no mesmo projeto/ambiente, **sem domínio público** (só rede privada), imagem `evoapicloud/evolution-api:v2.3.7`:

| Variável | Valor |
| --- | --- |
| `SERVER_PORT` | `8080` |
| `SERVER_URL` | `http://evolution.railway.internal:8080` |
| `DATABASE_ENABLED` | `true` |
| `DATABASE_PROVIDER` | `postgresql` |
| `DATABASE_CONNECTION_URI` | `${{Postgres.DATABASE_URL}}?schema=evolution_api` |
| `DATABASE_CONNECTION_CLIENT_NAME` | `convite_xv` |
| `DATABASE_SAVE_DATA_INSTANCE` | `true` (necessário para manter a sessão) |
| demais `DATABASE_SAVE_*` | `false` (privacidade: não guarda mensagens, contatos nem chats) |
| `CACHE_REDIS_ENABLED` / `CACHE_LOCAL_ENABLED` | `false` / `true` |
| `DEL_INSTANCE` | `false` |
| `TELEMETRY_ENABLED` | `false` |
| `LOG_LEVEL` | `ERROR,WARN,INFO` |
| `LANGUAGE` | `pt-BR` |
| `AUTHENTICATION_API_KEY` | segredo (32+ caracteres) |

No serviço `web`: `EVOLUTION_URL=http://evolution.railway.internal:8080`, `EVOLUTION_API_KEY` (o mesmo segredo), `EVOLUTION_INSTANCE=convite-xv`.

### Lembretes automáticos

Os lembretes ficam agendados no banco. Um dispatcher **dentro do processo web** roda a cada 60 s, envia o que venceu e respeita o intervalo de 20 a 60 s entre envios. Só envia **entre 9h e 20h (horário de Boa Vista)**; o que vencer fora desse horário fica para as 9h seguintes, sem gastar tentativa. Antes de cada envio confere se a mensagem ainda faz sentido: depois do prazo não sai lembrete de confirmação, depois do horário do lembrete da véspera não sai o de 7 dias, e nada sai depois do início da festa (esses ficam como cancelados no histórico).

Se o WhatsApp não responder a tempo (15 s), o envio fica como **falhou** e não é repetido sozinho — a mensagem pode ter chegado; confira no celular antes de usar **Tentar de novo**.

O ideal é **uma única réplica** do `web`. Com mais de uma, o `FOR UPDATE SKIP LOCKED` impede que o mesmo lembrete seja enviado duas vezes, mas cada réplica envia no seu ritmo e o intervalo de 20 a 60 s entre mensagens deixa de valer; num deploy com troca gradual, as duas versões podem rodar juntas por alguns instantes (sem envio duplicado). Para desligar, use `DISPATCHER_ENABLED=false`.

### Desenvolvimento local

```bash
docker compose --profile whatsapp up -d
```

Sobe a Evolution em `http://localhost:8080`, usando o Postgres do compose (`?schema=evolution_api`). Defina `EVOLUTION_URL=http://localhost:8080` e `EVOLUTION_API_KEY` (padrão de dev: `dev-evolution-key`, ou o valor de `EVOLUTION_API_KEY` no seu ambiente) no `.env.local`.

### Problemas comuns

- **Desconectado**: reconecte em Painel › WhatsApp lendo o QR code de novo.
- **Mensagem não chegou**: veja o histórico de envios do convidado e use **Tentar de novo** nas falhas.

## Deploy (Railway)

Cada ambiente (`staging`, `production`) tem dois serviços: **Postgres** e **web** (build pelo `Dockerfile`).

- `DATABASE_URL`: referência ao Postgres do mesmo ambiente.
- `AUTH_SECRET`, `APP_URL`, `LOG_LEVEL`, `FEATURES`: variáveis do serviço `web`.
- **Build arg `APP_URL`**: o Next lê `APP_URL` durante o `next build` (metadados da prévia do convite), e o Railway repassa as variáveis do serviço como build args. Ela precisa estar definida no serviço e ser igual à usada em runtime; ao mudar o domínio, faça um novo deploy.
- Health check: `GET /api/health` → `200 {"ok":true}` (executa `SELECT 1`).
- Start: a imagem roda `node scripts/migrate.js && node server.js`, ou seja, migra o banco a cada start.
- Rate limit por IP lê `X-Real-IP` (definido pelo edge do Railway) e, na falta dele, a entrada mais à direita do `X-Forwarded-For`. Se colocar outro proxy/CDN na frente, ajuste `getClientIp`.

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
