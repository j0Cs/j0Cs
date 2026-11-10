ALTER TABLE "plans" ADD COLUMN "kind" text DEFAULT 'construcao' NOT NULL;
--> statement-breakpoint
-- Planos de gestão: a pessoa constrói com as contas de IA dela e a Forja gerencia.
INSERT INTO "plans" ("id", "name", "description", "kind", "price_brl_cents", "included_credits_brl_cents", "seats", "max_projects", "allowed_tiers", "min_seats", "sort_order") VALUES
  ('gestao', 'Gestão', 'Para quem já paga Claude, ChatGPT, Gemini ou Grok: uso e gasto num painel, recomendações de economia, time de especialistas e revisão de QA.', 'gestao', 5900, 1500, 1, 3, '{economico}'::"model_tier"[], NULL, 1),
  ('gestao_equipe', 'Gestão Equipe (por assento)', 'Mínimo 3 assentos. O uso de cada pessoa e de cada ferramenta num painel só, com projetos ilimitados.', 'gestao', 4900, 1500, 1, NULL, '{economico,intermediario}'::"model_tier"[], 3, 2)
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
-- Planos de construção: preço novo só onde o dono não mexeu (ainda no valor padrão antigo).
UPDATE "plans" SET "price_brl_cents" = 19700, "description" = 'Para começar a construir: modelos rápidos e econômicos, 5 projetos. Inclui tudo da Gestão.' WHERE "id" = 'starter' AND "price_brl_cents" = 14700;
--> statement-breakpoint
UPDATE "plans" SET "price_brl_cents" = 59700 WHERE "id" = 'pro' AND "price_brl_cents" = 44700;
--> statement-breakpoint
UPDATE "plans" SET "price_brl_cents" = 129700 WHERE "id" = 'max' AND "price_brl_cents" = 99700;
--> statement-breakpoint
UPDATE "plans" SET "price_brl_cents" = 49700 WHERE "id" = 'equipe' AND "price_brl_cents" = 39700;
--> statement-breakpoint
UPDATE "plans" SET "sort_order" = CASE "id" WHEN 'starter' THEN 3 WHEN 'pro' THEN 4 WHEN 'max' THEN 5 WHEN 'equipe' THEN 6 ELSE "sort_order" END WHERE "id" IN ('starter', 'pro', 'max', 'equipe');
