-- =====================================================================
-- 007c_funcoes_edicao_ressalva.sql
-- Edição, retificação/ressalva e inativação/reativação.
-- Sistema de Gestão de Demandas — SME Ribeirão Preto
--
-- Seção 10 (edição/retificação) e 9 (inativação). Todas SECURITY DEFINER,
-- com justificativa obrigatória (regra 7). O diff de campos vai para
-- `auditoria` pelo trigger de 006; aqui gravamos a movimentação e a regra.
-- =====================================================================

set search_path = gestao, extensions, public;

-- ---------------------------------------------------------------------
-- fn_editar_demanda — campos editáveis por gerente+ no escopo (seção 10a).
-- Recebe um JSONB apenas com as chaves a alterar (whitelist abaixo).
-- ---------------------------------------------------------------------
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
begin
  perform gestao.fn_exige_justificativa(p_justificativa);
  select * into d from gestao.demandas where id = p_demanda_id and ativo;
  if not found then
    raise exception 'Demanda inexistente ou inativa.' using errcode = 'check_violation';
  end if;
  if not gestao.fn_gerente_ou_superior_no_escopo(v_autor, d.unidade_responsavel_id) then
    raise exception 'Edição exige gerente ou superior no escopo.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Campos obrigatórios não podem virar vazios.
  if p_campos ? 'titulo' and btrim(coalesce(p_campos->>'titulo','')) = '' then
    raise exception 'Título não pode ficar vazio.' using errcode = 'check_violation';
  end if;
  if p_campos ? 'objeto_queixa' and btrim(coalesce(p_campos->>'objeto_queixa','')) = '' then
    raise exception 'Objeto/queixa não pode ficar vazio.' using errcode = 'check_violation';
  end if;

  update gestao.demandas set
    titulo        = case when p_campos ? 'titulo' then p_campos->>'titulo' else titulo end,
    descricao     = case when p_campos ? 'descricao' then p_campos->>'descricao' else descricao end,
    objeto_queixa = case when p_campos ? 'objeto_queixa' then p_campos->>'objeto_queixa' else objeto_queixa end,
    categoria     = case when p_campos ? 'categoria' then p_campos->>'categoria' else categoria end,
    prioridade    = case when p_campos ? 'prioridade' then p_campos->>'prioridade' else prioridade end,
    prazo         = case when p_campos ? 'prazo' then nullif(p_campos->>'prazo','')::date else prazo end,
    escola_id     = case when p_campos ? 'escola_id' then nullif(p_campos->>'escola_id','')::uuid else escola_id end,
    aluno_nome    = case when p_campos ? 'aluno_nome' then p_campos->>'aluno_nome' else aluno_nome end
  where id = p_demanda_id;

  perform gestao.fn_registrar_movimentacao(
    p_demanda_id, null, v_autor, 'edicao', p_justificativa);
end;
$$;

-- ---------------------------------------------------------------------
-- fn_retificar_movimentacao — só enquanto a JANELA estiver aberta: nenhuma
-- movimentação posterior de OUTRO usuário na mesma demanda (seção 10b).
-- Autor retifica a própria; terceiros só com gerente+ no escopo.
-- ---------------------------------------------------------------------
create or replace function gestao.fn_retificar_movimentacao(
  p_movimentacao_id uuid,
  p_texto_correto text,
  p_justificativa text)
returns uuid
language plpgsql security definer
set search_path = gestao, pg_temp
as $$
declare
  v_autor uuid := gestao.fn_usuario_corrente();
  m gestao.movimentacoes%rowtype;
  v_unidade uuid;
  v_nova uuid;
begin
  perform gestao.fn_exige_justificativa(p_justificativa);
  if p_texto_correto is null or btrim(p_texto_correto) = '' then
    raise exception 'Texto correto é obrigatório.' using errcode = 'check_violation';
  end if;

  select * into m from gestao.movimentacoes where id = p_movimentacao_id;
  if not found then
    raise exception 'Movimentação inexistente.' using errcode = 'check_violation';
  end if;

  -- Já retificada antes? Não retifica de novo.
  if exists (select 1 from gestao.movimentacoes r
              where r.movimentacao_retificada_id = m.id) then
    raise exception 'Movimentação já retificada.' using errcode = 'check_violation';
  end if;

  select unidade_responsavel_id into v_unidade from gestao.demandas where id = m.demanda_id;

  -- Terceiros só com chefia no escopo.
  if m.autor_id <> v_autor
     and not gestao.fn_gerente_ou_superior_no_escopo(v_autor, v_unidade) then
    raise exception 'Sem permissão para retificar movimentação de outro usuário.'
      using errcode = 'insufficient_privilege';
  end if;

  -- JANELA: qualquer movimentação posterior de outro usuário fecha a janela.
  if exists (
    select 1 from gestao.movimentacoes p
     where p.demanda_id = m.demanda_id
       and p.criado_em > m.criado_em
       and p.autor_id <> m.autor_id
  ) then
    raise exception
      'Janela de retificação encerrada (houve intervenção de terceiro). Use ressalva.'
      using errcode = 'check_violation';
  end if;

  v_nova := gestao.fn_registrar_movimentacao(
    m.demanda_id, m.tarefa_id, v_autor, 'retificacao',
    p_texto_correto, null, null, null, null, null, m.id, null);

  return v_nova;
end;
$$;

-- ---------------------------------------------------------------------
-- fn_registrar_ressalva — aponta o erro após a janela fechada. Qualquer
-- participante da tramitação pode registrar (seção 10). Original intacto.
-- ---------------------------------------------------------------------
create or replace function gestao.fn_registrar_ressalva(
  p_movimentacao_id uuid,
  p_texto_correto text,
  p_justificativa text)
returns uuid
language plpgsql security definer
set search_path = gestao, pg_temp
as $$
declare
  v_autor uuid := gestao.fn_usuario_corrente();
  m gestao.movimentacoes%rowtype;
  v_nova uuid;
begin
  perform gestao.fn_exige_justificativa(p_justificativa);
  if p_texto_correto is null or btrim(p_texto_correto) = '' then
    raise exception 'Texto correto é obrigatório.' using errcode = 'check_violation';
  end if;

  select * into m from gestao.movimentacoes where id = p_movimentacao_id;
  if not found then
    raise exception 'Movimentação inexistente.' using errcode = 'check_violation';
  end if;
  if not gestao.fn_pode_ver_demanda(m.demanda_id, v_autor) then
    raise exception 'Sem acesso à demanda.' using errcode = 'insufficient_privilege';
  end if;

  v_nova := gestao.fn_registrar_movimentacao(
    m.demanda_id, m.tarefa_id, v_autor, 'ressalva',
    p_texto_correto, null, null, null, null, null, null, m.id);

  return v_nova;
end;
$$;

-- ---------------------------------------------------------------------
-- fn_inativar — demanda | tarefa | anexo. Nunca DELETE (regra 1/seção 9).
-- Gerente+ no escopo. Anexo é imutável: a inativação vai só para auditoria
-- + movimentação (a linha do anexo não é alterada).
-- ---------------------------------------------------------------------
create or replace function gestao.fn_inativar(
  p_entidade text,
  p_id uuid,
  p_motivo text)
returns void
language plpgsql security definer
set search_path = gestao, pg_temp
as $$
declare
  v_autor uuid := gestao.fn_usuario_corrente();
  v_unidade uuid;
  v_demanda uuid;
  v_tarefa uuid;
  v_sit text;
begin
  perform gestao.fn_exige_justificativa(p_motivo);

  if p_entidade = 'demanda' then
    select unidade_responsavel_id, situacao into v_unidade, v_sit
      from gestao.demandas where id = p_id and ativo;
    if v_unidade is null then
      raise exception 'Demanda inexistente ou já inativa.' using errcode = 'check_violation';
    end if;
    if not gestao.fn_gerente_ou_superior_no_escopo(v_autor, v_unidade) then
      raise exception 'Inativação exige gerente ou superior no escopo.' using errcode = 'insufficient_privilege';
    end if;
    update gestao.demandas
       set ativo = false, inativado_em = now(), inativado_por = v_autor,
           motivo_inativacao = p_motivo,
           situacao_anterior = v_sit, situacao = 'inativa'
     where id = p_id;
    perform gestao.fn_registrar_movimentacao(p_id, null, v_autor, 'inativacao', p_motivo, v_sit, 'inativa');

  elsif p_entidade = 'tarefa' then
    select unidade_responsavel_id, situacao, demanda_id into v_unidade, v_sit, v_demanda
      from gestao.tarefas where id = p_id and ativo;
    if v_unidade is null then
      raise exception 'Tarefa inexistente ou já inativa.' using errcode = 'check_violation';
    end if;
    if not gestao.fn_gerente_ou_superior_no_escopo(v_autor, v_unidade) then
      raise exception 'Inativação exige gerente ou superior no escopo.' using errcode = 'insufficient_privilege';
    end if;
    update gestao.tarefas
       set ativo = false, inativado_em = now(), inativado_por = v_autor,
           motivo_inativacao = p_motivo,
           situacao_anterior = v_sit, situacao = 'inativa'
     where id = p_id;
    perform gestao.fn_registrar_movimentacao(v_demanda, p_id, v_autor, 'inativacao', p_motivo, v_sit, 'inativa');

  elsif p_entidade = 'anexo' then
    select coalesce(a.demanda_id, t.demanda_id), a.tarefa_id,
           coalesce(d.unidade_responsavel_id, t.unidade_responsavel_id)
      into v_demanda, v_tarefa, v_unidade
      from gestao.anexos a
      left join gestao.tarefas t on t.id = a.tarefa_id
      left join gestao.demandas d on d.id = a.demanda_id
     where a.id = p_id;
    if v_demanda is null then
      raise exception 'Anexo inexistente.' using errcode = 'check_violation';
    end if;
    if not gestao.fn_gerente_ou_superior_no_escopo(v_autor, v_unidade) then
      raise exception 'Inativação exige gerente ou superior no escopo.' using errcode = 'insufficient_privilege';
    end if;
    -- Anexo imutável: registra a inativação só em auditoria + movimentação.
    insert into gestao.auditoria(usuario_id, acao, entidade, entidade_id, dados_novos)
      values (v_autor, 'inativacao', 'anexo', p_id, jsonb_build_object('motivo', p_motivo));
    perform gestao.fn_registrar_movimentacao(v_demanda, v_tarefa, v_autor, 'inativacao', p_motivo);

  else
    raise exception 'Entidade inválida para inativação: %.', p_entidade using errcode = 'check_violation';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- fn_reativar — restaura a situação imediatamente anterior (seção 7).
-- ---------------------------------------------------------------------
create or replace function gestao.fn_reativar(
  p_entidade text,
  p_id uuid,
  p_motivo text)
returns void
language plpgsql security definer
set search_path = gestao, pg_temp
as $$
declare
  v_autor uuid := gestao.fn_usuario_corrente();
  v_unidade uuid;
  v_demanda uuid;
  v_tarefa uuid;
  v_anterior text;
begin
  perform gestao.fn_exige_justificativa(p_motivo);

  if p_entidade = 'demanda' then
    select unidade_responsavel_id, situacao_anterior into v_unidade, v_anterior
      from gestao.demandas where id = p_id and not ativo;
    if v_unidade is null then
      raise exception 'Demanda inexistente ou já ativa.' using errcode = 'check_violation';
    end if;
    if not gestao.fn_gerente_ou_superior_no_escopo(v_autor, v_unidade) then
      raise exception 'Reativação exige gerente ou superior no escopo.' using errcode = 'insufficient_privilege';
    end if;
    update gestao.demandas
       set ativo = true, inativado_em = null, inativado_por = null,
           motivo_inativacao = null,
           situacao = coalesce(v_anterior, 'em_andamento')
     where id = p_id;
    perform gestao.fn_registrar_movimentacao(p_id, null, v_autor, 'reativacao', p_motivo, 'inativa', coalesce(v_anterior,'em_andamento'));

  elsif p_entidade = 'tarefa' then
    select unidade_responsavel_id, situacao_anterior, demanda_id
      into v_unidade, v_anterior, v_demanda
      from gestao.tarefas where id = p_id and not ativo;
    if v_unidade is null then
      raise exception 'Tarefa inexistente ou já ativa.' using errcode = 'check_violation';
    end if;
    if not gestao.fn_gerente_ou_superior_no_escopo(v_autor, v_unidade) then
      raise exception 'Reativação exige gerente ou superior no escopo.' using errcode = 'insufficient_privilege';
    end if;
    update gestao.tarefas
       set ativo = true, inativado_em = null, inativado_por = null,
           motivo_inativacao = null,
           situacao = coalesce(v_anterior, 'em_andamento')
     where id = p_id;
    perform gestao.fn_registrar_movimentacao(v_demanda, p_id, v_autor, 'reativacao', p_motivo, 'inativa', coalesce(v_anterior,'em_andamento'));

  elsif p_entidade = 'anexo' then
    select coalesce(a.demanda_id, t.demanda_id), a.tarefa_id,
           coalesce(d.unidade_responsavel_id, t.unidade_responsavel_id)
      into v_demanda, v_tarefa, v_unidade
      from gestao.anexos a
      left join gestao.tarefas t on t.id = a.tarefa_id
      left join gestao.demandas d on d.id = a.demanda_id
     where a.id = p_id;
    if v_demanda is null then
      raise exception 'Anexo inexistente.' using errcode = 'check_violation';
    end if;
    if not gestao.fn_gerente_ou_superior_no_escopo(v_autor, v_unidade) then
      raise exception 'Reativação exige gerente ou superior no escopo.' using errcode = 'insufficient_privilege';
    end if;
    insert into gestao.auditoria(usuario_id, acao, entidade, entidade_id, dados_novos)
      values (v_autor, 'reativacao', 'anexo', p_id, jsonb_build_object('motivo', p_motivo));
    perform gestao.fn_registrar_movimentacao(v_demanda, v_tarefa, v_autor, 'reativacao', p_motivo);

  else
    raise exception 'Entidade inválida para reativação: %.', p_entidade using errcode = 'check_violation';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Grants de execução ao front (RPC).
-- ---------------------------------------------------------------------
grant execute on function gestao.fn_editar_demanda(uuid,jsonb,text)            to authenticated;
grant execute on function gestao.fn_retificar_movimentacao(uuid,text,text)     to authenticated;
grant execute on function gestao.fn_registrar_ressalva(uuid,text,text)         to authenticated;
grant execute on function gestao.fn_inativar(text,uuid,text)                   to authenticated;
grant execute on function gestao.fn_reativar(text,uuid,text)                   to authenticated;
