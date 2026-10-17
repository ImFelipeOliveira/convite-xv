# Convite XV Anos da Isabella — Documento de design

**Data:** 17/10/2026 · **Autor:** Felipe Souza (com Claude) · **Status:** revisado, aguardando aprovação

**Design visual (fonte da verdade da interface):** Claude Design — "XV Anos — Direção de Arte & Motion"
https://claude.ai/artifact/4JNcfs7qugLuMcH3m84ZMp — 10 pranchas: 01 Direção de arte, 02 Sistema visual, 03 Linguagem de movimento, 04 Abertura, 05 Hero, 06 O dia, 07 RSVP, 08 Presentes, 09 Pix, 10 Encerramento.

Legenda: **[decidido]** = escolha do Felipe · **[design]** = já definido nas pranchas · **[call]** = decisão minha (Claude), pode ser revista.

---

## 1. Intenção

Um site-convite para **uma única festa**: os 15 anos da Isabella, domingo, **27/12/2026 às 10h (horário de Roraima, America/Boa_Vista, UTC−4)**, no **Sítio Lua Azul**, Rodovia BR-401, Km 13, s/n, Zona Rural, Cantá–RR, 69390-000. Traje livre, com piscina (traje de banho indispensável).

O convidado recebe **um link próprio** pelo WhatsApp. A prévia do link mostra **a imagem de uma carta** [decidido]. Ao abrir, ele rompe o lacre, as portas se abrem e o convite é contado em capítulos [design]. O site se comporta como uma carta selada: "o movimento sempre abre, revela ou floresce — nunca pisca, quica ou distrai" [design].

A família administra tudo por um painel: convidados, presentes, mensagens, acompanhamento de confirmações e Pix, e lembretes por WhatsApp.

## 2. Objetivos

1. Cada convidado confirma presença pelo seu link, com quantidade de acompanhantes dentro do limite do convite.
2. A família sabe a qualquer momento quantas pessoas vêm (convidados + acompanhantes).
3. Lista de presentes sem repetição: reserva atômica, sem expor quem reservou para outros convidados.
4. Presente em dinheiro via Pix dinâmico (Asaas), com confirmação automática de pagamento.
5. Lembretes automáticos por WhatsApp para quem confirmou.
6. Experiência fiel ao design, rápida em celular aberto pelo WhatsApp.

## 3. Não-objetivos

- Não é plataforma multi-festa / multi-tenant. Um evento, dados do evento podem ser configuração.
- Sem cadastro público de usuários; convidado não cria conta.
- Acompanhantes são **apenas quantidade**, sem nomes [decidido].
- Sem lembretes para quem não respondeu ou recusou [decidido: lembretes só para confirmados].
- Sem pagamento de presentes da lista: reservar não cobra nada [design].
- Sem galeria de fotos, sem app nativo, sem i18n (só pt-BR).

## 4. Anti-objetivos (falharia mesmo "funcionando")

- Mostrar o nome de quem reservou um presente para outro convidado [design].
- Mostrar sucesso (RSVP, reserva, Pix pago) antes da resposta do servidor [design: "estados de sucesso só depois da resposta do servidor"].
- Animações que bloqueiam toque/rolagem, scroll-jacking, ou que ignoram `prefers-reduced-motion` [design].
- Marcar um Pix como pago duas vezes ou sem confirmação do Asaas.
- Banir o número pessoal da família no WhatsApp.
- Link de um convidado permitir ver/alterar dados de outro.

## 5. Restrições

- **Prazo:** festa em 27/12/2026. **Convites saem até 30/11/2026 — data firme** [decidido]. A fase 1 (convite com abertura + RSVP + painel de convidados) precisa estar em produção antes disso; presentes, Pix e lembretes entram em seguida, sem bloquear o envio. Prazo de confirmação padrão: [call] 13/12/2026, configurável.
- **Hospedagem:** Railway [decidido].
- **Pix:** Asaas, conta **pessoa física (CPF)** no nome do responsável que recebe [decidido]. Exige verificação de conta antes da API de produção.
- **WhatsApp:** API não oficial [decidido].
- **Stack frontend:** Next.js, monolito frontend + backend [decidido]; Motion (motion.dev) [design].
- **Tráfego:** baixo (dezenas a poucas centenas de convidados). Não otimizar para escala.

## 6. Arquitetura

### 6.1 Visão geral

Projeto Railway com **3 serviços** [call, decorrente de Railway + WhatsApp não oficial]:

```
                 WhatsApp (convidado)
                        │ link /c/<token>
                        ▼
┌──────────────────────────────────────────┐       ┌──────────────┐
│ Next.js (monolito)                        │──────▶│  Asaas API   │
│ • páginas do convite (RSC)                │◀──────│  (webhook)   │
│ • painel /admin                           │       └──────────────┘
│ • Server Actions (RSVP, reserva, Pix)     │
│ • /api/webhooks/asaas                     │       ┌──────────────┐
│ • worker pg-boss (lembretes) no mesmo     │──────▶│ Evolution API│──▶ WhatsApp
│   processo                                │ HTTP  │ (serviço)    │
└───────────────┬──────────────────────────┘       └──────────────┘
                ▼
        PostgreSQL (Railway)
```

### 6.2 Tecnologias

| Camada | Escolha | Origem |
|---|---|---|
| Framework | Next.js (App Router, versão estável atual), TypeScript, `output: "standalone"` | [decidido] Next.js / [call] detalhes |
| Banco | PostgreSQL gerenciado do Railway | [call] |
| ORM / migrações | Drizzle ORM + drizzle-kit | [call] |
| Validação | Zod (Server Actions e webhook) | [call] |
| Estilo | Tailwind CSS com tokens do design como variáveis CSS | [call] |
| Animação | Motion (motion.dev): `whileInView`, `AnimatePresence` nos passos de RSVP/Pix, `layout` nas etiquetas; loops ambientes e fios em CSS/SVG puro | [design] |
| Fontes | `next/font/google`: Bodoni Moda, Jost, Pinyon Script | [design] fontes / [call] next/font |
| Imagens | `next/image`, AVIF/WebP, larguras 480/960/1600, placeholder blush; arquivos em `public/` | [design] / [call] sem bucket |
| Prévia do link | `opengraph-image` do Next (imagem de carta, 1200×630) | [decidido] carta / [call] implementação |
| Auth do painel | Auth.js (Credentials) ou sessão própria com cookie httpOnly assinado; usuários admin semeados via script, senha com argon2/bcrypt | [call] |
| Fila / agendamento | pg-boss (fila sobre o próprio Postgres), worker iniciado no processo Next via `instrumentation.ts` | [call] |
| Pix | Asaas API v3 (sandbox em dev) | [decidido] |
| WhatsApp | Evolution API (self-hosted, imagem Docker oficial) | [call] |
| Testes | Vitest (lógica/servidor), Playwright (fluxos críticos: abrir convite, RSVP, reserva, Pix em sandbox) | [call] |

### 6.3 Rotas

Público:
- `/c/[token]` — convite do convidado (Abertura → Hero → O dia → RSVP → Presentes → Pix → Encerramento, em uma página com âncoras/seções). Token inválido → página neutra "Convite não encontrado".
- `/c/[token]/opengraph-image` — imagem da carta. [call] Mesma imagem para todos (sem nome), para não vazar nomes em prévias encaminhadas.
- `/c/[token]/agenda.ics` — evento para "Adicionar à agenda" [design].
- `/` — página genérica sem dados (ou redireciona para nada). Não lista convidados.

Admin (autenticado):
- `/admin` — resumo: confirmados, recusados, pendentes, total de pessoas, Pix recebidos (soma).
- `/admin/convidados` — CRUD, import CSV, copiar link, botão "Enviar pelo WhatsApp" (`wa.me` com mensagem pronta), status de resposta.
- `/admin/presentes` — CRUD com categoria, preço opcional, foto opcional; ver quem reservou; liberar reserva.
- `/admin/pix` — cobranças e status.
- `/admin/recados` — recados para a Isabella.
- `/admin/lembretes` — modelos, agenda (D-7, D-1), histórico de envios, status da conexão WhatsApp.
- `/admin/config` — prazo de confirmação, mensagens (agradecimento Pix, encerramento), contato de dúvidas, nome/instituição do recebedor exibidos no Pix.
- Exportação CSV de convidados e presentes [call].

API:
- `POST /api/webhooks/asaas` — eventos de pagamento.

## 7. Modelo de dados (rascunho)

```
convidados
  id uuid pk
  token text unique          -- 22+ chars aleatórios (base62, ≥128 bits)
  nome text
  telefone text null         -- E.164, para lembretes e wa.me
  limite_acompanhantes int   -- 0..6 [design]
  resposta enum(pendente, sim, nao) default pendente
  acompanhantes int default 0  -- 0..limite
  recado text null
  respondido_em timestamptz null
  aberto_em timestamptz null   -- primeiro acesso (útil no painel)
  criado_em, atualizado_em

presentes
  id uuid pk
  nome text, categoria text, preco_aprox_centavos int null, foto_url text null, ordem int
  convidado_id uuid null fk -> convidados   -- null = livre
  reservado_em timestamptz null

pagamentos_pix
  id uuid pk
  convidado_id fk
  valor_centavos int check (valor_centavos >= 7000)   -- mínimo R$ 70 [design]
  modo enum(dinamico, estatico)
  asaas_payment_id text unique null   -- null no modo estático
  status enum(aguardando, pago, expirado, cancelado, falha, aviso_enviado)   -- [design] status; aviso_enviado = modo estático
  qr_code_base64 text, copia_e_cola text, expira_em timestamptz
  pago_em timestamptz null
  criado_em

eventos_webhook             -- idempotência e auditoria
  id text pk (id do evento Asaas), tipo, payload jsonb, recebido_em, processado_em

lembretes_envios
  id, convidado_id, tipo (d7, d1), status (agendado, enviado, falhou, cancelado), tentativas, erro, enviado_em
  unique (convidado_id, tipo)

admins
  id, email unique, senha_hash, criado_em

config (linha única, chave/valor ou colunas)
  prazo_confirmacao, msg_agradecimento_pix, msg_encerramento, contato_duvidas,
  recebedor_nome, recebedor_instituicao, lembrete_d7_texto, lembrete_d1_texto
```

Dados fixos do evento (data, local, coordenadas, links Maps/Waze, traje) ficam em um módulo de constantes [call]; se a família quiser editá-los no painel, migram para `config`.

## 8. Fluxos

### 8.1 Abrir o convite
1. Convidado abre `/c/<token>`. Server Component carrega o convidado; registra `aberto_em` na primeira visita.
2. Abertura com lacre e portas [design 04]; botão "Entrar sem animação"; quem já abriu (cookie/localStorage) entra direto no hero com versão curta de 900 ms [design 03].
3. Saudação com o nome; contagem regressiva calculada para 27/12/2026 14:00 UTC [design 06].

### 8.2 RSVP [design 07]
- Server Action `responderRsvp(token, resposta, acompanhantes, recado, telefone?)`; valida `acompanhantes ≤ limite`, recado ≤ 500 chars [call].
- Telefone [decidido: "os dois"]: a família cadastra telefones no painel; **se o convidado não tiver telefone cadastrado e responder "sim"**, o RSVP mostra um campo opcional "Seu WhatsApp para lembretes" (máscara BR, normalizado para E.164). Com telefone cadastrado, o campo não aparece. Texto curto de consentimento junto ao campo (LGPD). Esse campo não existe nas pranchas: seguir o estilo de "CAMPOS" da prancha 02.
- Permitido alterar até o prazo de confirmação; depois do prazo, mostra a resposta atual, só leitura, com o contato de dúvidas [call].
- Erro de rede: mensagem "Não conseguimos enviar agora…" e reenvio, sem perder o preenchido [design].
- Mudar para "sim" agenda lembretes; mudar para "não" cancela os pendentes.
- [call] Presentes e Pix continuam acessíveis a qualquer convidado com link válido, independentemente da resposta ou do prazo (quem não vai pode querer presentear). Mudar para "não" **não** libera reservas automaticamente; o painel destaca "reservas de quem recusou" para a família decidir.

### 8.3 Reserva de presente [design 08]
- `reservarPresente(token, presenteId)`:
  `UPDATE presentes SET convidado_id = $c, reservado_em = now() WHERE id = $p AND convidado_id IS NULL RETURNING id`
  → 0 linhas = conflito → tela "Alguém foi mais rápido".
- `desfazerReserva(token, presenteId)`: só se `convidado_id = $c`.
- Lista enviada ao cliente expõe só `livre | meu | ja_escolhido`; nunca nome/id de outro convidado.
- Animação da fita só após resposta do servidor [design].
- [call] Sem limite de reservas por convidado.

### 8.4 Pix via Asaas [design 09, decidido Asaas]
1. Convidado escolhe valor (R$ 70/100/150/200/300 ou outro ≥ R$ 70).
2. Server Action `gerarPix(token, valor)`:
   - garante um *customer* Asaas. [call] Um único customer genérico "Convidados XV" (com CPF do responsável ou conforme exigência do Asaas) reutilizado em todas as cobranças, guardando o convidado em `externalReference`; evita pedir CPF do convidado. **Validar no sandbox se o Asaas aceita isso; se exigir CPF do pagador, pedir CPF opcional no formulário.**
   - cria cobrança `billingType: PIX`, `value`, `dueDate` = hoje, `externalReference` = id do `pagamentos_pix`;
   - busca QR Code (`/payments/{id}/pixQrCode`) → salva `qr_code_base64`, `copia_e_cola`, `expira_em`.
3. Tela mostra QR e copia-e-cola; cliente faz polling leve (a cada 5 s, por até 30 min) [call] numa Server Action/rota que lê o status do banco.
4. Webhook `PAYMENT_RECEIVED` / `PAYMENT_CONFIRMED`:
   - valida header `asaas-access-token` contra segredo configurado;
   - grava em `eventos_webhook` (pk = id do evento) → se já existe, retorna 200 sem reprocessar;
   - atualiza `pagamentos_pix` para `pago`; responde 200 rápido.
   - Eventos de expiração/cancelamento/estorno mapeiam para `expirado`/`cancelado`.
5. Tela muda para "Pix recebido. Muito obrigada!" com a mensagem configurada [design].
- Plano B (conta não aprovada a tempo): modo **estático** já previsto no design. Controlado por `PIX_MODO=dinamico|estatico`. [call] Comportamento:
  - convidado escolhe o valor (mesmas regras, mínimo R$ 70); o servidor gera o BR Code estático "copia e cola" + QR a partir da chave Pix configurada (`PIX_CHAVE`, `PIX_NOME`, `PIX_CIDADE`) e do valor, sem chamar o Asaas;
  - "Já fiz o Pix" cria uma linha em `pagamentos_pix` com `modo = estatico`, `status = aviso_enviado`, valor e convidado;
  - o "aviso" é **só uma lista no painel** (`/admin/pix`, com filtro "a conferir"), onde a família marca como `pago` após conferir o extrato. Sem WhatsApp/e-mail — não depende da fase 4.

### 8.5 Lembretes WhatsApp [decidido: só confirmados]
- Ao confirmar "sim" (com telefone), agenda jobs pg-boss com `singletonKey` por (convidado, tipo):
  - **D-7** (20/12/2026, [call] 10h local): data, local, traje de banho, link do convite.
  - **D-1** (26/12/2026, [call] 10h local): horário, links Maps/Waze.
  - Se a confirmação acontecer depois do horário de um lembrete, aquele lembrete não é enviado [call].
- Worker envia via Evolution API (`POST /message/sendText/{instance}`), com intervalo aleatório de 20–60 s entre mensagens [call] e texto com pequenas variações; retry até 3× com backoff; resultado em `lembretes_envios`.
- Mudou para "não" → cancela jobs pendentes.
- Painel mostra status da instância (conectado/desconectado), histórico e falhas; botão "reenviar".
- Mitigação de banimento: **chip dedicado**, não o número pessoal; volume baixo. Fallback: botão `wa.me` manual no painel.

### 8.6 Painel
- Login e-mail/senha; 1–2 admins criados por script (`pnpm seed:admin`). Sem "esqueci a senha" [call] (reset via script).
- Import CSV de convidados: colunas `nome, telefone, limite_acompanhantes` [call].
- Mensagem `wa.me` de convite com texto configurável contendo o link.

## 9. Segurança e privacidade

- Token do convite: aleatório criptográfico, ≥128 bits; não sequencial; rotas públicas só acessam dados do próprio token.
- Rate limiting simples por IP nas Server Actions públicas e em `/c/*` (proteção contra enumeração) [call], em memória (um único processo).
- Painel: cookie httpOnly/secure/SameSite=Lax, CSRF protegido por Server Actions, todas as rotas `/admin` checadas no servidor (não só em middleware).
- Webhook Asaas: token no header + idempotência; nunca confiar no corpo para valores sem conferir `asaas_payment_id` no banco.
- Segredos só em variáveis de ambiente do Railway: `DATABASE_URL`, `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`, `ASAAS_ENV`, `EVOLUTION_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE`, `AUTH_SECRET`, `PIX_MODO`, `APP_URL`.
- Evolution API acessível só pela rede privada do Railway (sem domínio público), exceto quando for preciso escanear o QR (ou expor o manager com senha) [call].
- `robots: noindex` em todo o site [call].
- LGPD: dados mínimos (nome, telefone); [call] apagar telefones e recados ~30 dias após a festa (script manual).

## 10. Implantação (Railway)

- Serviços: `web` (Next.js, Dockerfile ou Nixpacks, `standalone`), `postgres` (plugin), `evolution` (imagem Docker oficial, volume persistente para a sessão).
- Migrações Drizzle rodam no start do `web` (ou pre-deploy command).
- Ambientes: `staging` (Asaas sandbox, número de teste) e `production`.
- Domínio próprio opcional [call: recomendado, ex. `isabella15.com.br`, para prévia mais confiável no WhatsApp].
- Backup: snapshots do Postgres do Railway + export CSV do painel antes da festa.

## 11. Fidelidade ao design

- Converter tokens das pranchas 01–03 em CSS: paleta (Blush #F7DEDB, Papel #FFF8F6, Lacre #A8325E, Vinho #5A2136, Ouro #B8955A, etc.), espaçamento base 4, easings `--ease-carta`, `--ease-portas`, `--ease-lacre`, durações e stagger.
- Ilustrações (lírio, lacre, monograma, ramo) como componentes SVG próprios, animáveis por camada; reaproveitar os paths das pranchas.
- Mobile-first 390 px; 768 px duas colunas; 1280+ grid 12 colunas, máx. 1200 [design].
- Acessibilidade: contraste já medido no design, foco visível, alvos ≥44 px, `aria-live` nas mensagens de status, `prefers-reduced-motion` conforme cada primitiva da prancha 03.
- Placeholders do design a preencher pela família: foto da aniversariante (ou lírio), prazo de confirmação, contato de dúvidas, nome/instituição do recebedor, mensagem de agradecimento e de encerramento.

## 12. Riscos

| Risco | Mitigação |
|---|---|
| Conta Asaas PF não aprovada a tempo / exigências de CPF do pagador | Abrir conta já; validar no sandbox; modo Pix estático pronto |
| Número do WhatsApp banido | Chip dedicado, volume baixo, intervalos; fallback `wa.me` |
| Evolution API desconectar (sessão cai) | Status no painel + alerta; volume persistente |
| Prévia do WhatsApp não mostrar a imagem | `og:image` absoluto, 1200×630, < 300 KB, testar com o depurador de prévias antes do envio |
| Prazo (30/11 firme) | Entregar em fases: (1) convite + RSVP + painel convidados — **até 30/11**; (2) presentes; (3) Pix; (4) lembretes (até ~15/12, antes do D-7 em 20/12). Se a fase 1 apertar, a abertura pode sair com a coreografia completa só do lacre/portas e as demais primitivas entram depois |

## 13. Deixado para quem for construir

- Estrutura de pastas, organização de componentes, nomes de tabelas/colunas exatos.
- Escolha final Auth.js vs sessão própria; Dockerfile vs Nixpacks.
- Detalhes de UI do painel (pode ser funcional e simples, com a paleta do convite; não há prancha para ele).
- Textos padrão das mensagens de lembrete e do convite `wa.me` (editáveis no painel).
