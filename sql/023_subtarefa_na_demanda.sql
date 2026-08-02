-- =====================================================================
-- 023_subtarefa_na_demanda.sql
-- Permite criar subtarefa DIRETO na demanda (sem tarefa-mãe). Antes exigia
-- uma tarefa-pai; se a demanda não tinha nenhuma, não dava para delegar.
-- Agora: se p_parent_id for nulo, cria uma tarefa-raiz sob a demanda
-- (p_demanda_id). Sistema de Gestão de Demandas — SME Ribeirão Preto.
-- =====================================================================

set search_path = gestao, extensions, public;

-- Remove a assinatura antiga (6 args) para não deixar overload ambíguo.
drop function if exists gestao.fn_criar_subtarefa(uuid, uuid, text, text, date, text);

create or replace function gestao.fn_criar_subtarefa(
  p_parent_id uuid,
  p_responsavel_id uuid,
  p_titulo text,
  p_descricao text default null,
  p_prazo date default null,
  p_prioridade text default null,
  p_demanda_id uuid default null)
returns uuid
language plpgsql security definer
set search_path = gestao, pg_temp
as $$
declare
  v_autor uuid := gestao.fn_usuario_corrente();
  v_unidade_resp uuid;
  v_sub uuid;
  v_demanda uuid;
  v_prioridade_base text;
  p gestao.tarefas%rowtype;
  d gestao.demandas%rowtype;
begin
  if p_titulo is null or btrim(p_titulo) = '' then
    raise exception 'Título da subtarefa é obrigatório.' using errcode = 'check_violation';
  end if;

  if p_parent_id is not null then
    -- Ramificação sob uma tarefa existente.
    select * into p from gestao.tarefas where id = p_parent_id and ativo;
    if not found then
      raise exception 'Tarefa-mãe inexistente ou inativa.' using errcode = 'check_violation';
    end if;
    if p.responsavel_id <> v_autor
       and not gestao.fn_gerente_ou_superior_no_escopo(v_autor, p.unidade_responsavel_id) then
      raise exception 'Sem permissão para criar subtarefa nesta tarefa.'
        using errcode = 'insufficient_privilege';
    end if;
    v_demanda := p.demanda_id;
    v_prioridade_base := p.prioridade;
  else
    -- Tarefa-raiz direto na demanda.
    if p_demanda_id is null then
      raise exception 'Informe a tarefa-mãe ou a demanda.' using errcode = 'check_violation';
    end if;
    select * into d from gestao.demandas where id = p_demanda_id and ativo;
    if not found then
      raise exception 'Demanda inexistente ou inativa.' using errcode = 'check_violation';
    end if;
    if not (v_autor = d.responsavel_atual_id
            or v_autor = d.criado_por
            or v_autor = d.solicitante_id
            or gestao.fn_gerente_ou_superior_no_escopo(v_autor, d.unidade_responsavel_id)
            or gestao.fn_escopo_global(v_autor)) then
      raise exception 'Sem permissão para criar subtarefa nesta demanda.'
        using errcode = 'insufficient_privilege';
    end if;
    v_demanda := d.id;
    v_prioridade_base := d.prioridade;
  end if;

  select unidade_id into v_unidade_resp
    from gestao.usuarios where id = p_responsavel_id and ativo;
  if v_unidade_resp is null then
    raise exception 'Responsável inexistente ou inativo.' using errcode = 'check_violation';
  end if;

  insert into gestao.tarefas(
    demanda_id, parent_id, titulo, descricao, responsavel_id,
    unidade_responsavel_id, situacao, prioridade, prazo, criado_por)
  values (
    v_demanda, p_parent_id, p_titulo, p_descricao, p_responsavel_id,
    v_unidade_resp, 'aberta', coalesce(p_prioridade, v_prioridade_base), p_prazo, v_autor)
  returning id into v_sub;

  perform gestao.fn_registrar_movimentacao(
    v_demanda, v_sub, v_autor, 'subtarefa', p_titulo,
    null, 'aberta', p_responsavel_id, coalesce(p_prioridade, v_prioridade_base), p_prazo);

  insert into gestao.notificacoes(usuario_id, demanda_id, tarefa_id, tipo, titulo, mensagem)
    values (p_responsavel_id, v_demanda, v_sub, 'subtarefa',
            'Subtarefa atribuída', 'Você recebeu uma subtarefa.');

  return v_sub;
end;
$$;

grant execute on function gestao.fn_criar_subtarefa(uuid, uuid, text, text, date, text, uuid) to authenticated;
