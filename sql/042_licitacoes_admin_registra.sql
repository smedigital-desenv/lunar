-- =====================================================================
-- 042_licitacoes_admin_registra.sql
-- Licitações: quem administra o sistema (perfis.pode_administrar, ex.:
-- gabinete e admin_ti) também pode registrar andamentos, mudar fase/
-- local, agendar pregão, editar, inativar e ressalvar — além da equipe
-- de licitações (decisão do usuário, 2026-08-14).
-- Sistema de Gestão de Demandas — SME Ribeirão Preto
-- =====================================================================

set search_path = gestao, extensions, public;

-- Quem pode escrever no módulo: equipe de licitações OU administrador.
create or replace function gestao.fn_lic_pode_editar(p_usuario_id uuid)
returns boolean
language sql stable security definer
set search_path = gestao, pg_temp
as $$
  select gestao.fn_lic_e_equipe(p_usuario_id)
      or gestao.fn_pode_administrar(p_usuario_id);
$$;

grant execute on function gestao.fn_lic_pode_editar(uuid) to authenticated;

-- Guarda comum das RPCs de escrita (mesma assinatura do 041; as RPCs
-- que a chamam não mudam).
create or replace function gestao.fn_lic_exigir_equipe(p_processo_id uuid)
returns gestao.lic_processos
language plpgsql security definer
set search_path = gestao, pg_temp
as $$
declare
  v_autor uuid := gestao.fn_usuario_corrente();
  p gestao.lic_processos%rowtype;
begin
  if not gestao.fn_lic_pode_editar(v_autor) then
    raise exception 'Apenas a equipe de licitações ou administradores podem registrar nesta tela.'
      using errcode = 'insufficient_privilege';
  end if;
  select * into p from gestao.lic_processos where id = p_processo_id for update;
  if not found then
    raise exception 'Processo inexistente.' using errcode = 'check_violation';
  end if;
  return p;
end;
$$;

-- Ressalva segue a mesma regra ampliada.
create or replace function gestao.fn_lic_registrar_ressalva(
  p_movimentacao_id uuid, p_texto_correto text, p_justificativa text)
returns uuid
language plpgsql security definer
set search_path = gestao, pg_temp
as $$
declare
  v_autor uuid := gestao.fn_usuario_corrente();
  m gestao.lic_movimentacoes%rowtype;
begin
  perform gestao.fn_exige_justificativa(p_justificativa);
  if p_texto_correto is null or btrim(p_texto_correto) = '' then
    raise exception 'Texto da ressalva é obrigatório.' using errcode = 'check_violation';
  end if;
  if not gestao.fn_lic_pode_editar(v_autor) then
    raise exception 'Apenas a equipe de licitações ou administradores podem registrar ressalva.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into m from gestao.lic_movimentacoes where id = p_movimentacao_id;
  if not found then
    raise exception 'Movimentação inexistente.' using errcode = 'check_violation';
  end if;

  return gestao.fn_lic_registrar_movimentacao(
    m.processo_id, v_autor, 'ressalva',
    format('%s Justificativa: %s', p_texto_correto, p_justificativa),
    null, null, null, null, null, null, m.id);
end;
$$;
