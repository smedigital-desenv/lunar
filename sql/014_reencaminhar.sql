-- =====================================================================
-- 014_reencaminhar.sql
-- Trocar o destinatário de uma tarefa já encaminhada — enquanto o
-- destinatário ainda não agiu. Sistema de Gestão de Demandas — SME RP.
--
-- Regra: pode trocar quem ENCAMINHOU (criou a tarefa) ou uma chefia no
-- escopo. Só é permitido enquanto NINGUÉM além de quem encaminhou tiver
-- registrado movimentação na tarefa e não houver subtarefa (ou seja, o
-- destinatário não fez nada). Registra a troca como nova movimentação
-- de encaminhamento e notifica o novo destinatário.
-- =====================================================================

set search_path = gestao, extensions, public;

create or replace function gestao.fn_reencaminhar_tarefa(
  p_tarefa_id uuid,
  p_novo_destinatario_id uuid,
  p_texto text default null)
returns void
language plpgsql volatile security definer
set search_path = gestao, pg_temp
as $$
declare
  v_autor uuid := gestao.fn_usuario_corrente();
  t gestao.tarefas%rowtype;
  v_unidade uuid;
begin
  select * into t from gestao.tarefas where id = p_tarefa_id and ativo;
  if not found then
    raise exception 'Tarefa inexistente ou inativa.' using errcode = 'check_violation';
  end if;

  -- Quem pode trocar: quem encaminhou (criou a tarefa) ou chefia no escopo.
  if t.criado_por <> v_autor
     and not gestao.fn_gerente_ou_superior_no_escopo(v_autor, t.unidade_responsavel_id) then
    raise exception 'Sem permissão para alterar o destinatário desta tarefa.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Só enquanto o destinatário não agiu: nenhuma movimentação de OUTRO
  -- usuário na tarefa e nenhuma subtarefa criada sob ela.
  if exists (select 1 from gestao.movimentacoes m
              where m.tarefa_id = p_tarefa_id and m.autor_id <> v_autor)
     or exists (select 1 from gestao.tarefas f
                 where f.parent_id = p_tarefa_id and f.ativo) then
    raise exception 'Não é possível trocar: o destinatário já registrou uma ação.'
      using errcode = 'check_violation';
  end if;

  if p_novo_destinatario_id = t.responsavel_id then
    raise exception 'Selecione um destinatário diferente do atual.'
      using errcode = 'check_violation';
  end if;

  select unidade_id into v_unidade
    from gestao.usuarios where id = p_novo_destinatario_id and ativo;
  if v_unidade is null then
    raise exception 'Destinatário inexistente ou inativo.' using errcode = 'check_violation';
  end if;

  update gestao.tarefas
     set responsavel_id = p_novo_destinatario_id,
         unidade_responsavel_id = v_unidade
   where id = p_tarefa_id;

  perform gestao.fn_registrar_movimentacao(
    t.demanda_id, p_tarefa_id, v_autor, 'encaminhamento',
    coalesce(nullif(btrim(p_texto), ''), 'Destinatário alterado.'),
    null, null, p_novo_destinatario_id, t.prioridade, t.prazo);

  insert into gestao.notificacoes(usuario_id, demanda_id, tarefa_id, tipo, titulo, mensagem)
    values (p_novo_destinatario_id, t.demanda_id, p_tarefa_id, 'encaminhamento',
            'Tarefa encaminhada a você', 'Uma tarefa foi encaminhada a você.');
end;
$$;

grant execute on function gestao.fn_reencaminhar_tarefa(uuid, uuid, text) to authenticated;
