-- =====================================================================
-- 034_editar_responsavel.sql
-- Adiciona "Responsável" como campo editável em fn_editar_demanda — uma
-- correção rápida (com justificativa, sem despacho nem tarefa formal),
-- diferente de "Encaminhar" (que exige mensagem e cria uma tarefa).
--
-- Cuidado central: NÃO reabrir, por aqui, a porta que sql/033 fechou.
-- Alterar o responsável continua exclusivo de quem criou a demanda ou é
-- o responsável atual — mesmo a chefia (que pode editar os DEMAIS campos)
-- não pode mudar o responsável por esta função. E quem só é dono (sem
-- ser chefia) só pode usar esta função para o responsável, nada mais.
-- Sistema de Gestão de Demandas — SME Ribeirão Preto.
-- =====================================================================

set search_path = gestao, extensions, public;

create or replace function gestao.fn_editar_demanda(
  p_demanda_id uuid,
  p_campos jsonb,
  p_justificativa text)
returns void
language plpgsql security definer
set search_path = gestao, pg_temp
as $$
declare
  v_autor uuid := gestao.fn_usuario_corrente();
  d gestao.demandas%rowtype;
  v_pode_geral boolean;
  v_sou_dono boolean;
  v_novo_responsavel uuid;
  v_nova_unidade uuid;
begin
  perform gestao.fn_exige_justificativa(p_justificativa);
  select * into d from gestao.demandas where id = p_demanda_id and ativo;
  if not found then
    raise exception 'Demanda inexistente ou inativa.' using errcode = 'check_violation';
  end if;

  v_pode_geral := gestao.fn_gerente_ou_superior_no_escopo(v_autor, d.unidade_responsavel_id);
  v_sou_dono := (v_autor = d.criado_por or v_autor = d.responsavel_atual_id);

  -- Acesso à função: chefia no escopo (qualquer campo) OU dono da demanda
  -- (só para alterar o responsável).
  if not v_pode_geral and not (v_sou_dono and p_campos ? 'responsavel_id') then
    raise exception 'Edição exige gerente ou superior no escopo.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Alterar o responsável é exclusivo do dono da demanda — nem chefia
  -- pode fazer por aqui (mesma regra de fn_encaminhar/fn_concluir, sql/033).
  if p_campos ? 'responsavel_id' and not v_sou_dono then
    raise exception 'Apenas quem criou a demanda ou o responsável atual podem alterar o responsável.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Dono sem ser chefia só pode usar esta função para o responsável.
  if v_sou_dono and not v_pode_geral and (p_campos - 'responsavel_id') <> '{}'::jsonb then
    raise exception 'Sem permissão para editar os demais campos da demanda — apenas o responsável.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Campos obrigatórios não podem virar vazios.
  if p_campos ? 'titulo' and btrim(coalesce(p_campos->>'titulo','')) = '' then
    raise exception 'Título não pode ficar vazio.' using errcode = 'check_violation';
  end if;
  if p_campos ? 'objeto_queixa' and btrim(coalesce(p_campos->>'objeto_queixa','')) = '' then
    raise exception 'Objeto/queixa não pode ficar vazio.' using errcode = 'check_violation';
  end if;

  if p_campos ? 'responsavel_id' then
    v_novo_responsavel := nullif(p_campos->>'responsavel_id', '')::uuid;
    if v_novo_responsavel is null then
      raise exception 'Informe o novo responsável.' using errcode = 'check_violation';
    end if;
    select unidade_id into v_nova_unidade
      from gestao.usuarios where id = v_novo_responsavel and ativo;
    if v_nova_unidade is null then
      raise exception 'Responsável inexistente ou inativo.' using errcode = 'check_violation';
    end if;
  end if;

  update gestao.demandas set
    titulo        = case when p_campos ? 'titulo' then p_campos->>'titulo' else titulo end,
    descricao     = case when p_campos ? 'descricao' then p_campos->>'descricao' else descricao end,
    objeto_queixa = case when p_campos ? 'objeto_queixa' then p_campos->>'objeto_queixa' else objeto_queixa end,
    categoria     = case when p_campos ? 'categoria' then p_campos->>'categoria' else categoria end,
    prioridade    = case when p_campos ? 'prioridade' then p_campos->>'prioridade' else prioridade end,
    prazo         = case when p_campos ? 'prazo' then nullif(p_campos->>'prazo', '')::date else prazo end,
    escola_id     = case when p_campos ? 'escola_id' then nullif(p_campos->>'escola_id', '')::uuid else escola_id end,
    aluno_nome    = case when p_campos ? 'aluno_nome' then p_campos->>'aluno_nome' else aluno_nome end,
    responsavel_atual_id   = coalesce(v_novo_responsavel, responsavel_atual_id),
    unidade_responsavel_id = coalesce(v_nova_unidade, unidade_responsavel_id)
  where id = p_demanda_id;

  perform gestao.fn_registrar_movimentacao(
    p_demanda_id, null, v_autor, 'edicao', p_justificativa,
    null, null, v_novo_responsavel);

  if v_novo_responsavel is not null and v_novo_responsavel <> v_autor then
    insert into gestao.notificacoes(usuario_id, demanda_id, tipo, titulo, mensagem)
      values (v_novo_responsavel, p_demanda_id, 'edicao',
              'Você foi definido como responsável', 'O responsável desta demanda foi alterado.');
  end if;
end;
$$;
