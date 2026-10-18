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
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | recomendada em produção | Chave fixa das Server Actions: base64 de 32 bytes (`openssl rand -base64 32`). Lida no **build**; sem ela o build funciona, mas cada deploy gera uma chave nova. Veja Deploy. |
| `LOG_LEVEL` | não | Nível do pino (`info` por padrão). |
| `FEATURES` | não | Flags de funcionalidades separadas por vírgula (`gifts`, `pix`); vazio por padrão = convite sem lista de presentes e sem Pix. |
| `EVOLUTION_URL` | para WhatsApp | URL da Evolution API (produção: `http://evolution.railway.internal:8080`; local: `http://localhost:8080`). Sem ela, o painel mostra o WhatsApp como não configurado. |
| `EVOLUTION_API_KEY` | para WhatsApp | Mesma chave definida em `AUTHENTICATION_API_KEY` na Evolution. Segredo, nunca versionar. |
| `EVOLUTION_INSTANCE` | para WhatsApp | Nome da instância (`convite-xv`). |
| `DISPATCHER_ENABLED` | não | Dispatcher dos lembretes automáticos; ligado por padrão, `false` desliga (usado nos testes e2e). |
| `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION`, `S3_ENDPOINT` | só em produção | Bucket das fotos dos presentes (Railway bucket `fotos`, via referências). Com as cinco definidas, as fotos vão para o bucket; sem elas, ficam em `.data/media/` (dev/testes, fora do git). Segredos, nunca versionar nem logar. |
| `MEDIA_DIR` | não | Pasta das fotos sem S3 (padrão `.data/media`). |
| `ASAAS_API_KEY` | para Pix | Chave da API Asaas (começa com `$`; no `.env` use aspas simples). Sem ela, a seção Pix mostra "Pix indisponível no momento.". Segredo. |
| `ASAAS_ENV` | para Pix | `sandbox` (padrão) ou `production`. |
| `ASAAS_WEBHOOK_TOKEN` | para Pix | Token do webhook Asaas (veja abaixo). Sem ele, `/api/webhooks/asaas` responde 503. Segredo. |
| `ASAAS_REQUIRE_PAYER_CPF` | não | Padrão: pede o CPF do pagador (o Asaas recusa Pix sem CPF). `false` usa um cliente genérico sem CPF. |
| `ASAAS_BASE_URL` | só em testes | Sobrescreve a URL do `ASAAS_ENV` (fake Asaas do e2e). Ignorada com `NODE_ENV=production`, a não ser com `ALLOW_TEST_OVERRIDES=1`. |
| `PIX_POLL_AFTER_MS`, `PIX_POLL_EVERY_MS` | só em testes | Encurtam a consulta de status do Pix ao Asaas (e2e). Ignoradas em produção, como a anterior. |
| `ALLOW_TEST_OVERRIDES` | **nunca em produção** | `1` libera `ASAAS_BASE_URL` e `PIX_POLL_*` num build de produção. Só o `playwright.config.ts` define (o `next start` do e2e roda com `NODE_ENV=production`). **Nunca defina no Railway**: `ASAAS_BASE_URL` decide para onde vai a chave do Asaas. |

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

## Pix (Asaas)

O convidado gera um QR Code Pix no convite (seção Pix, mínimo R$ 70,00, máximo R$ 10.000,00) e a tela vira “Pix recebido.” quando o Asaas confirma. O Asaas exige CPF do pagador para cobranças Pix: o convidado informa o nome completo de quem paga (já preenchido com o nome do convidado, editável) e o CPF dessa pessoa, que pode ser outro familiar. O cliente no Asaas é criado com esse nome e CPF; os dois vão só para o Asaas (nunca são gravados nem logados). Um Pix pago conta como presente: os lembretes de presente pelo WhatsApp desse convidado são cancelados.

### Chaves e ambientes

| | Sandbox (testes) | Produção |
| --- | --- | --- |
| Conta | [sandbox.asaas.com](https://sandbox.asaas.com) (conta separada, dinheiro fictício) | [www.asaas.com](https://www.asaas.com) (conta aprovada, com chave Pix cadastrada) |
| URL da API | `https://api-sandbox.asaas.com/v3` | `https://api.asaas.com/v3` |
| `ASAAS_ENV` | `sandbox` (padrão) | `production` |

1. Em cada conta, cadastre uma chave Pix (Pix › Minhas chaves): sem ela o Asaas não devolve o QR Code.
2. Gere a chave da API em Integrações › Chaves de API. Ela começa com `$aact_` e só aparece uma vez: guarde-a num cofre. As chaves de sandbox e de produção são diferentes e não se misturam com o ambiente errado.
3. No Railway, defina no serviço `web` sem imprimir o valor: `railway variable set ASAAS_API_KEY --stdin --service <serviço>` (cole a chave e Ctrl-D), `ASAAS_ENV=production` e `ASAAS_WEBHOOK_TOKEN` (abaixo).
4. Teste local contra o sandbox: `pnpm exec tsx scripts/asaas-sandbox-check.ts` (só sandbox; usa `ASAAS_API_KEY` do `.env.local`, cria cobranças de teste de R$ 70, apaga em seguida e nunca imprime a chave).

Variáveis (veja a tabela em Variáveis de ambiente): `ASAAS_API_KEY`, `ASAAS_ENV`, `ASAAS_WEBHOOK_TOKEN` e `FEATURES`. A seção Pix do convite só aparece com `pix` em `FEATURES` (ex.: `FEATURES=gifts,pix`); sem a flag, o convite não mostra Pix nem a lista de presentes (`gifts`), e as ações públicas de Pix recusam. Sem `ASAAS_API_KEY`, com a flag ligada, o convite mostra “Pix indisponível no momento.”. Nunca versione nem logue a chave ou o token.

### Webhook

Em Asaas › Integrações › Webhooks, crie um webhook:

- **URL**: `https://isabella15.usefachada.com.br/api/webhooks/asaas`
- **Token de autenticação**: um valor aleatório longo (ex.: `openssl rand -hex 32`); o mesmo valor vai em `ASAAS_WEBHOOK_TOKEN` no serviço `web`. O Asaas o envia no header `asaas-access-token`; requisições sem ele (ou com outro valor) recebem 401.
- **Versão da API**: v3. **Tipo de envio**: sequencial. **Fila**: ativada.
- **Eventos**: `PAYMENT_RECEIVED`, `PAYMENT_CONFIRMED`, `PAYMENT_OVERDUE`, `PAYMENT_DELETED`, `PAYMENT_REFUNDED` (e, se quiser, `PAYMENT_PARTIALLY_REFUNDED`). Outros eventos são aceitos e ignorados.

Comportamento: cada evento é gravado pelo seu `id` (`webhook_events`), então reentregas não reprocessam nada. Pago nunca volta atrás: `OVERDUE`/`DELETED` depois de pago são ignorados, e um estorno de um Pix pago mantém `paid` e registra `pix.refund_after_paid` no log; no Painel › Pix ele aparece como “Estornado” e sai do total recebido. Defesa em profundidade: antes de marcar pago, o servidor confirma o pagamento no próprio Asaas (`GET /payments/:id`, até 8 s; precisa de `ASAAS_API_KEY`): só vale se o Asaas disser pago e o valor bater; senão o evento é ignorado (`pix.webhook_unconfirmed`), e se o Asaas não responder o webhook devolve 500 (o Asaas reenvia). Requisições recusadas (token errado, corpo inválido) são limitadas a 30/min por IP (depois, 429 sem log). Se o webhook falhar, a tela do convidado ainda consulta o Asaas depois de 2 min (fallback). Fila pausada no Asaas: veja Integrações › Logs de Webhook.

### Tarifas

O Asaas cobra uma tarifa por Pix recebido (e pode cobrar pela transferência do saldo para a conta bancária); confira os valores atuais em Minha conta › Taxas antes de ligar o Pix. A tarifa sai do valor recebido: o convidado paga exatamente o valor que digitou, e o painel (Painel › Pix) mostra o valor bruto de cada Pix, não o líquido. No sandbox nada é cobrado.

## Deploy (Railway)

Cada ambiente (`staging`, `production`) tem dois serviços: **Postgres** e **web** (build pelo `Dockerfile`).

- `DATABASE_URL`: referência ao Postgres do mesmo ambiente.
- `AUTH_SECRET`, `APP_URL`, `LOG_LEVEL`, `FEATURES`: variáveis do serviço `web`.
- **Build arg `APP_URL`**: o Next lê `APP_URL` durante o `next build` (metadados da prévia do convite), e o Railway repassa as variáveis do serviço como build args. Ela precisa estar definida no serviço e ser igual à usada em runtime; ao mudar o domínio, faça um novo deploy.
- Fotos dos presentes: o admin envia a foto em **Painel > Presentes** (`POST /admin/api/gift-image`, até 8 MB; JPG, PNG, WEBP ou AVIF). O servidor gira pela orientação EXIF, remove metadados (inclusive GPS), reduz para caber em 1200×1200 e grava WEBP como `gifts/<uuid>.webp` no bucket. O bucket do Railway é privado: as fotos são servidas pelo app em `GET /media/gifts/<uuid>.webp` (cache imutável de 1 ano; cada foto nova ganha uma chave nova). Trocar ou remover a foto, ou excluir o presente, apaga o objeto antigo. Fotos enviadas e não salvas (formulário cancelado) ficam órfãs no bucket.
- **`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`** (serviço `web`, chega ao build como build arg): gere uma vez com `openssl rand -base64 32` e **não troque** a cada deploy. Mantém estáveis as referências das Server Actions entre builds e réplicas. Se faltar, o build não falha (o Next gera uma chave por build).
- **Version skew**: o `next.config.ts` usa `RAILWAY_DEPLOYMENT_ID` (ou `RAILWAY_GIT_COMMIT_SHA`) como `deploymentId`, então uma aba aberta de um deploy anterior recarrega sozinha na próxima navegação. Se uma ação do painel cair numa versão nova (“Failed to find Server Action”), o painel mostra “O painel foi atualizado. Recarregando…”, guarda o rascunho do formulário aberto no `sessionStorage` e o restaura depois de recarregar.
- Sessão do admin: cookie `xv_admin` de 30 dias, renovado (novos 30 dias) quando tem mais de 24 h e o admin usa o painel.
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
