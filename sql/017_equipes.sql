-- =====================================================================
-- 017_equipes.sql
-- Gestão de equipes = lotação das pessoas nas unidades (áreas) do
-- organograma. A "equipe" de um subsecretário/gerente é quem está lotado
-- na unidade dele (e descendentes). Sistema de Gestão de Demandas — SME RP.
--
-- Não cria estrutura nova: apenas move o usuário de unidade (unidade_id),
-- via função SECURITY DEFINER restrita a quem administra. Audita a troca.
-- =====================================================================

set search_path = gestao, extensions, public;

create or replace function gestao.fn_definir_unidade_usuario(
  p_usuario_id uuid,
  p_unidade_id uuid)
returns void
language plpgsql volatile security definer
set search_path = gestao, pg_temp
as $$
declare
  v_admin uuid := gestao.fn_usuario_corrente();
  v_anterior uuid;
begin
  if not gestao.fn_pode_administrar(v_admin) then
    raise exception 'Apenas administradores podem alterar equipes.'
      using errcode = 'insufficient_privilege';
  end if;

  if not exists (select 1 from gestao.unidades_organizacionais u
                  where u.id = p_unidade_id and u.ativo) then
    raise exception 'Unidade inexistente ou inativa.' using errcode = 'check_violation';
  end if;

  select unidade_id into v_anterior
    from gestao.usuarios where id = p_usuario_id and ativo;
  if v_anterior is null then
    raise exception 'Usuário inexistente ou inativo.' using errcode = 'no_data_found';
  end if;

  if v_anterior = p_unidade_id then
    return;  -- nada a fazer
  end if;

  update gestao.usuarios
     set unidade_id = p_unidade_id, atualizado_em = now()
   where id = p_usuario_id;

  insert into gestao.auditoria(usuario_id, acao, entidade, entidade_id,
                               dados_anteriores, dados_novos)
  values (v_admin, 'atualizacao', 'usuario', p_usuario_id,
          jsonb_build_object('unidade_id', v_anterior),
          jsonb_build_object('unidade_id', p_unidade_id));
end;
$$;

grant execute on function gestao.fn_definir_unidade_usuario(uuid, uuid) to authenticated;
