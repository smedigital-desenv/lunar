-- =====================================================================
-- 008b_corrige_seed_auth.sql
-- Corrige os usuários de TESTE do seed para permitir login por e-mail/senha.
-- Sistema de Gestão de Demandas — SME Ribeirão Preto.
--
-- Motivo: o GoTrue (Supabase Auth) devolve 500 no grant_type=password
-- quando a conta foi inserida direto em auth.users pelo seed, porque:
--   (1) as colunas de token ficam NULL (o GoTrue as lê como string), e
--   (2) falta a linha correspondente em auth.identities (provider 'email').
--
-- ⚠️ Projeto Supabase COMPARTILHADO: este script mira SOMENTE os 11 UUIDs
-- fixos do seed (aaaaaaaa-…-0001 a 0011) — NÃO usa filtro por domínio, para
-- não tocar em usuários de outros sistemas no mesmo projeto. Idempotente.
-- Mantém os UUIDs (o vínculo com gestao.usuarios continua válido).
-- Rodar UMA vez após o seed. Remova os usuários de teste antes de produção.
-- =====================================================================

-- Lista fechada dos usuários de teste (mesmos IDs do 008_seed.sql).
create temporary table _seed_ids (id uuid) on commit drop;
insert into _seed_ids (id) values
  ('aaaaaaaa-0000-0000-0000-000000000001'),
  ('aaaaaaaa-0000-0000-0000-000000000002'),
  ('aaaaaaaa-0000-0000-0000-000000000003'),
  ('aaaaaaaa-0000-0000-0000-000000000004'),
  ('aaaaaaaa-0000-0000-0000-000000000005'),
  ('aaaaaaaa-0000-0000-0000-000000000006'),
  ('aaaaaaaa-0000-0000-0000-000000000007'),
  ('aaaaaaaa-0000-0000-0000-000000000008'),
  ('aaaaaaaa-0000-0000-0000-000000000009'),
  ('aaaaaaaa-0000-0000-0000-000000000010'),
  ('aaaaaaaa-0000-0000-0000-000000000011');

-- (1) Tokens não podem ser NULL (só nos usuários do seed).
update auth.users u
   set confirmation_token         = coalesce(u.confirmation_token, ''),
       recovery_token             = coalesce(u.recovery_token, ''),
       email_change               = coalesce(u.email_change, ''),
       email_change_token_new     = coalesce(u.email_change_token_new, ''),
       email_change_token_current = coalesce(u.email_change_token_current, ''),
       phone_change               = coalesce(u.phone_change, ''),
       phone_change_token         = coalesce(u.phone_change_token, ''),
       reauthentication_token     = coalesce(u.reauthentication_token, '')
  from _seed_ids s
 where u.id = s.id;

-- (2) Identidade de e-mail para cada conta do seed (só se ainda não existir).
insert into auth.identities
  (id, user_id, provider_id, provider, identity_data,
   last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text, 'email',
       jsonb_build_object(
         'sub', u.id::text, 'email', u.email,
         'email_verified', true, 'phone_verified', false),
       now(), now(), now()
  from auth.users u
  join _seed_ids s on s.id = u.id
 where not exists (
     select 1 from auth.identities i
      where i.user_id = u.id and i.provider = 'email');
