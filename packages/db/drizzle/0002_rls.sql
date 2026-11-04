-- Supabase expõe o schema "public" pela Data API (PostgREST) com a chave anon/publishable.
-- Nossa aplicação NÃO usa a Data API: conecta direto no Postgres com o dono das tabelas,
-- que ignora RLS. Ligar RLS sem nenhuma policy fecha todas as tabelas para os papéis
-- anon/authenticated da Data API. Em Postgres local (sem esses papéis) não muda nada.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;
