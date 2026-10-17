CREATE TYPE "public"."resposta" AS ENUM('pendente', 'sim', 'nao');--> statement-breakpoint
CREATE TABLE "admins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"senha_hash" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admins_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "config" (
	"id" integer PRIMARY KEY NOT NULL,
	"prazo_confirmacao" date DEFAULT '2026-12-13' NOT NULL,
	"contato_duvidas" text,
	"msg_encerramento" text,
	"msg_convite_whatsapp" text DEFAULT 'Olá, {nome}! A Isabella vai fazer 15 anos e preparou um convite especial para você. Abra a carta: {link}' NOT NULL,
	CONSTRAINT "config_linha_unica" CHECK ("config"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "convidados" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"nome" text NOT NULL,
	"telefone" text,
	"limite_acompanhantes" integer DEFAULT 0 NOT NULL,
	"resposta" "resposta" DEFAULT 'pendente' NOT NULL,
	"acompanhantes" integer DEFAULT 0 NOT NULL,
	"recado" text,
	"respondido_em" timestamp with time zone,
	"aberto_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "convidados_token_unique" UNIQUE("token"),
	CONSTRAINT "limite_acompanhantes_faixa" CHECK ("convidados"."limite_acompanhantes" between 0 and 6),
	CONSTRAINT "acompanhantes_nao_negativo" CHECK ("convidados"."acompanhantes" >= 0)
);

--> statement-breakpoint
INSERT INTO "config" ("id") VALUES (1) ON CONFLICT DO NOTHING;
