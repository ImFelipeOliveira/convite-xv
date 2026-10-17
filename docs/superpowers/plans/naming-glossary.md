# Naming glossary (PT → EN)

**Rule:** all code is in English — identifiers, file and folder names, DB tables/columns/enums/constraints, CSS variables, URL paths, test names, code comments and commit messages. **User-facing copy stays pt-BR** (everything a guest or the family reads on screen, error messages shown to users, WhatsApp texts, `.ics` summary, OG text). CSV column headers the family edits stay pt-BR (`nome;telefone;limite_acompanhantes` …) because they are user-facing data.

## Database
| PT | EN |
|---|---|
| table `convidados` | `guests` |
| `nome` | `name` |
| `telefone` | `phone` |
| `limite_acompanhantes` / `limiteAcompanhantes` | `plus_ones_limit` / `plusOnesLimit` |
| enum `resposta` (`pendente`,`sim`,`nao`) | enum `rsvp_status` (`pending`,`yes`,`no`), column `rsvp_status` / `rsvpStatus` |
| `acompanhantes` | `plus_ones` / `plusOnes` |
| `recado` | `message` |
| `respondido_em` | `responded_at` / `respondedAt` |
| `aberto_em` | `opened_at` / `openedAt` |
| `criado_em` / `atualizado_em` | `created_at` / `updated_at` |
| table `admins` (`senha_hash`) | `admins` (`password_hash`) |
| table `config` | `settings` |
| `prazo_confirmacao` | `rsvp_deadline` / `rsvpDeadline` |
| `contato_duvidas` | `contact_info` / `contactInfo` |
| `msg_encerramento` | `closing_message` / `closingMessage` |
| `msg_convite_whatsapp` | `whatsapp_invite_template` / `whatsappInviteTemplate` |
| check `limite_acompanhantes_faixa` | `plus_ones_limit_range` |
| types `Convidado`, `Config`, `NovoConvidado`, `Resposta` | `Guest`, `Settings`, `NewGuest`, `RsvpStatus` |

## Folders / files
`src/features/evento` → `event` · `config` → `settings` · `convidados` → `guests` · `rsvp` (same) · `admin-auth` (same)
`telefone.ts` → `phone.ts` · `prazo.ts` → `deadline.ts` · `evento.ts` → `event.ts` · `senha.ts` → `password.ts` · `sessao.ts` → `session.ts`
Components: `Lirio` → `Lily`, `Lacre` → `WaxSeal`, `Monograma` → `Monogram`, `Moldura` → `Frame`, `Abertura` → `Opening`, `Hero`, `ODia` → `TheDay`, `Contagem` → `Countdown`, `Rsvp`, `Encerramento` → `Closing`, `Revelar` → `Reveal`
Tests: `tests/helpers/db.ts`: `limparBanco` → `resetDatabase`, `fabricarConvidado` → `makeGuest`, `reinserirConfig` → `reseedSettings`

## Routes
`/c/[token]` (same) · `/c/[token]/agenda.ics` → `/c/[token]/calendar.ics` · `/admin/convidados` → `/admin/guests` · `/admin/convidados/[id]` → `/admin/guests/[id]` · `/admin/convidados/exportar` → `/admin/guests/export` · `/admin/recados` → `/admin/messages` · `/admin/config` → `/admin/settings` · `/admin/login`, `/api/health` (same)
Env: `FEATURES` values `gifts`, `pix` (was `presentes`, `pix`).

## Functions / values
| PT | EN |
|---|---|
| `gerarToken`, `tokenValido` | `generateToken`, `isValidToken` |
| `normalizarTelefone`, `formatarTelefone` | `normalizePhone`, `formatPhone` |
| `buscarPorToken`, `registrarAbertura` | `findGuestByToken`, `markOpened` |
| `criarConvidado`, `atualizarConvidado`, `removerConvidado`, `listarConvidados` | `createGuest`, `updateGuest`, `deleteGuest`, `listGuests` (filter `{ status?, search? }`) |
| `resumo()` → `{convidados,sim,nao,pendente,pessoasConfirmadas}` | `getSummary()` → `{ total, yes, no, pending, confirmedPeople }` |
| `obterConfig`, `salvarConfig` | `getSettings`, `saveSettings` |
| `prazoEncerrado(prazo, agora)` | `isDeadlinePassed(deadline, now)` |
| `rsvpSchema` fields `resposta, acompanhantes, recado, telefone` | `status ('yes'\|'no'), plusOnes, message, phone` |
| `RsvpResultado`, errors `nao_encontrado, prazo_encerrado, acima_do_limite, telefone_invalido, invalido` | `RsvpResult`, errors `not_found, deadline_passed, over_limit, invalid_phone, invalid` |
| `responderRsvp`, `enviarRsvp`, `mensagemErroRsvp` | `submitRsvp`, `submitRsvpAction`, `rsvpErrorMessage` |
| `EVENTO` (`aniversariante, inicio, fuso, duracaoHoras, local{nome,endereco,cidade,…}, traje{titulo,texto}`) | `EVENT` (`celebrant, startsAt, timeZone, durationHours, venue{name,address,city,lat,lng,mapsUrl,wazeUrl}, dressCode{title,text}`) |
| `gerarIcs`, `featureAtiva('presentes'\|'pix')` | `generateIcs`, `isFeatureEnabled('gifts'\|'pix')` |
| `limitar`, `ipDaRequisicao` | `rateLimit`, `getClientIp` |
| `partesContagem` → `{dias,horas,min,seg,encerrado}` | `countdownParts` → `{ days, hours, minutes, seconds, finished }` |
| `hashSenha`, `conferirSenha` | `hashPassword`, `verifyPassword` |
| `criarSessao`, `lerSessao`, `encerrarSessao`, `verificarToken` | `createSession`, `getSession`, `destroySession`, `verifySessionToken` |
| `exigirAdmin`, `entrar`, `sair` | `requireAdmin`, `signIn`, `signOut` |
| `convidadoFormSchema`, `configFormSchema` | `guestFormSchema`, `settingsFormSchema` |
| `linkConvite`, `linkWhatsApp` | `inviteUrl`, `whatsappUrl` |
| `lerCsvConvidados` → `{validos, erros:{linha,motivo}}` | `parseGuestsCsv` → `{ valid, errors: { line, reason } }` |
| `gerarCsvConvidados` | `buildGuestsCsv` |
| `salvarConvidado`, `excluirConvidado`, `importarConvidados`, `salvarConfiguracoes` | `saveGuestAction`, `deleteGuestAction`, `importGuestsAction`, `saveSettingsAction` |

## CSS tokens
`--blush`, `--papel` → `--paper`, `--petala` → `--petal`, `--lirio` → `--lily`, `--rosa` → `--rose`, `--lacre` → `--seal`, `--rosa-profundo` → `--deep-rose`, `--vinho` → `--wine`, `--bordo` → `--burgundy`, `--ouro` → `--gold`, `--ouro-claro` → `--gold-light`, `--ouro-texto` → `--gold-text`, `--salvia` → `--sage`, `--erro` → `--error`; `--ease-carta` → `--ease-letter`, `--ease-portas` → `--ease-doors`, `--ease-lacre` → `--ease-seal`, `--dur-revelar` → `--dur-reveal`, `--dur-cena` → `--dur-scene`, `--revelar-y` → `--reveal-y` (`--dur-micro`, `--dur-ui`, `--stagger`, `--space-*` unchanged). Hex values unchanged.
localStorage key `xv:aberto` → `xv:opened`.

## Extra names (from implementation)
`WHATSAPP_INVITE_TEMPLATE_DEFAULT` — default pt-BR WhatsApp invite text (src/server/db/schema.ts).
Component dirs: `src/components/ornaments/`, `src/components/invite/`; admin route group `admin/(protected)`.
