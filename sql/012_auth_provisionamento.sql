-- =====================================================================
-- 012_auth_provisionamento.sql
-- Autenticação: trava de domínio e provisionamento de usuário (Sessão 3).
-- Sistema de Gestão de Demandas — SME Ribeirão Preto — seção 2.
--
-- Regras:
--  - Acesso restrito ao domínio @educacao.pmrp.sp.gov.br. A trava existe
--    em três camadas: CHECK em gestao.usuarios (já em 002), este trigger
--    em auth.users (barra a própria criação da conta) e a validação na
--    função de provisionamento abaixo.
--  - Login BLOQUEADO até um admin cadastrar o usuário (decisão do usuário):
--    a conta pode existir em auth.users, mas só há acesso ao sistema quando
--    houver linha correspondente em gestao.usuarios (perfil + unidade).
--    Quem cria/ajusta essa linha é `fn_provisionar_usuario`, restrita a
--    quem administra (admin_ti). O primeiro admin é semeado (008_seed).
-- =====================================================================

set search_path = gestao, extensions, public;

-- ---------------------------------------------------------------------
-- Trava de domínio na criação da conta (Google OAuth, e-mail/senha, etc.).
-- Roda no schema auth; barra qualquer e-mail fora do domínio oficial.
-- ---------------------------------------------------------------------
create or replace function gestao.fn_bloquear_dominio_auth()
returns trigger
language plpgsql security definer
set search_path = gestao, pg_temp
as $$
begin
  if new.email is null
     or lower(new.email) not like '%@educacao.pmrp.sp.gov.br' then
    raise exception 'Acesso restrito ao domínio @educacao.pmrp.sp.gov.br.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bloquear_dominio on auth.users;
create trigger trg_bloquear_dominio
  before insert on auth.users
  for each row execute function gestao.fn_bloquear_dominio_auth();

-- ---------------------------------------------------------------------
-- fn_provisionar_usuario — cria (ou reativa/ajusta) o acesso de um usuário
-- ao sistema, ligando a conta de auth.users a um perfil e unidade.
-- Restrita a quem administra. Valida o domínio a partir do e-mail real.
-- Idempotente: reexecutar atualiza nome/perfil/unidade e reativa.
-- ---------------------------------------------------------------------
create or replace function gestao.fn_provisionar_usuario(
  p_auth_id uuid,
  p_nome text,
  p_perfil text,
  p_unidade_id uuid)
returns uuid
language plpgsql volatile security definer
set search_path = gestao, pg_temp
as $$
declare
  v_admin uuid := gestao.fn_usuario_corrente();
  v_email text;
begin
  if not gestao.fn_pode_administrar(v_admin) then
    raise exception 'Apenas administradores podem provisionar usuários.'
      using errcode = 'insufficient_privilege';
  end if;

  select lower(u.email) into v_email from auth.users u where u.id = p_auth_id;
  if v_email is null then
    raise exception 'Conta de autenticação não encontrada.' using errcode = 'no_data_found';
  end if;
  if v_email not like '%@educacao.pmrp.sp.gov.br' then
    raise exception 'E-mail fora do domínio permitido.' using errcode = 'check_violation';
  end if;
  if coalesce(trim(p_nome), '') = '' then
    raise exception 'Nome é obrigatório.' using errcode = 'check_violation';
  end if;

  insert into gestao.usuarios(id, nome, email, perfil, unidade_id)
  values (p_auth_id, p_nome, v_email, p_perfil, p_unidade_id)
  on conflict (id) do update
    set nome = excluded.nome,
        perfil = excluded.perfil,
        unidade_id = excluded.unidade_id,
        ativo = true,
        motivo_inativacao = null,
        atualizado_em = now();

  return p_auth_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Grants. (A trava de domínio é trigger; não precisa de grant ao front.)
-- ---------------------------------------------------------------------
grant execute on function gestao.fn_provisionar_usuario(uuid, text, text, uuid) to authenticated;
