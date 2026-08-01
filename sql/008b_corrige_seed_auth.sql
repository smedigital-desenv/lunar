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
-- Este script conserta ambos, é IDEMPOTENTE e mantém os mesmos UUIDs
-- (o vínculo com gestao.usuarios continua válido). Rodar UMA vez após o seed.
-- APENAS para os usuários fictícios de teste — remova-os antes de produção.
-- =====================================================================

-- (1) Tokens não podem ser NULL.
update auth.users
   set confirmation_token         = coalesce(confirmation_token, ''),
       recovery_token             = coalesce(recovery_token, ''),
       email_change               = coalesce(email_change, ''),
       email_change_token_new     = coalesce(email_change_token_new, ''),
       email_change_token_current = coalesce(email_change_token_current, ''),
       phone_change               = coalesce(phone_change, ''),
       phone_change_token         = coalesce(phone_change_token, ''),
       reauthentication_token     = coalesce(reauthentication_token, '')
 where email like '%@educacao.pmrp.sp.gov.br';

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
 where u.email like '%@educacao.pmrp.sp.gov.br'
   and not exists (
     select 1 from auth.identities i
      where i.user_id = u.id and i.provider = 'email');
