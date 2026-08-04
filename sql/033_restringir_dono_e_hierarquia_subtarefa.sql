-- =====================================================================
-- 033_restringir_dono_e_hierarquia_subtarefa.sql
-- Mudanças de regra de negócio pedidas explicitamente:
--
-- 1) Encaminhar, trocar responsável e concluir a demanda: só quem CRIOU a
--    demanda ou é o RESPONSÁVEL ATUAL por ela. Chefia/gabinete deixam de
--    ter esse atalho (o que valia desde sql/021/025 é removido aqui).
-- 2) Quem recebeu uma tarefa pode criar subtarefa a partir DELA, nunca
--    direto na raiz da demanda — isso é exclusivo de quem criou a
--    demanda ou é o responsável atual.
-- 3) "Quem recebeu tarefa não pode concluir a demanda" já é consequência
--    direta do item 1 (a chefia era o único caminho que um mero
--    destinatário de tarefa poderia ter para concluir; removido).
--
-- Sistema de Gestão de Demandas — SME Ribeirão Preto.
-- =====================================================================

set search_path = gestao, extensions, public;

-- =====================================================================
-- fn_encaminhar — passar a demanda adiante (ou redistribuir uma tarefa
-- específica) só é permitido a quem criou a demanda ou é o responsável
-- atual por ela.
-- =====================================================================
create or replace function gestao.fn_encaminhar(
  p_destinatario_id uuid,
  p_texto text,
  p_demanda_id uuid default null,
  p_tarefa_id uuid default null,
  p_prioridade text default null,
  p_prazo date default null)
returns uuid
language plpgsql security definer
set search_path = gestao, pg_temp
as $$
declare
  v_autor uuid := gestao.fn_usuario_corrente();
  v_demanda uuid;
  v_unidade_dest uuid;
  v_tarefa uuid;
  t gestao.tarefas%rowtype;
  d gestao.demandas%rowtype;
begin
  if p_demanda_id is null and p_tarefa_id is null then
    raise exception 'Informe a demanda ou a tarefa a encaminhar.' using errcode = 'check_violation';
  end if;

  select unidade_id into v_unidade_dest
    from gestao.usuarios where id = p_destinatario_id and ativo;
  if v_unidade_dest is null then
    raise exception 'Destinatário inexistente ou inativo.' using errcode = 'check_violation';
  end if;

  if p_tarefa_id is not null then
    select * into t from gestao.tarefas where id = p_tarefa_id and ativo;
    if not found then
      raise exception 'Tarefa inexistente ou inativa.' using errcode = 'check_violation';
    end if;
    v_demanda := t.demanda_id;

    -- Redistribuir uma tarefa específica: só quem a detém.
    if t.responsavel_id <> v_autor then
      raise exception 'Apenas quem recebeu a tarefa pode redistribuí-la.'
        using errcode = 'insufficient_privilege';
    end if;

    update gestao.tarefas
       set responsavel_id = p_destinatario_id,
           unidade_responsavel_id = v_unidade_dest,
           situacao = 'em_andamento',
           prioridade = coalesce(p_prioridade, prioridade),
           prazo = coalesce(p_prazo, prazo)
     where id = p_tarefa_id;
    v_tarefa := p_tarefa_id;
  else
    v_demanda := p_demanda_id;
    select * into d from gestao.demandas where id = v_demanda and ativo;
    if not found then
      raise exception 'Demanda inexistente ou inativa.' using errcode = 'check_violation';
    end if;

    -- Encaminhar/alterar responsável: só quem criou a demanda ou é o
    -- responsável atual por ela.
    if not (v_autor = d.criado_por or v_autor = d.responsavel_atual_id) then
      raise exception 'Apenas quem criou a demanda ou o responsável atual podem encaminhá-la.'
        using errcode = 'insufficient_privilege';
    end if;

    insert into gestao.tarefas(
      demanda_id, titulo, descricao, responsavel_id, unidade_responsavel_id,
      situacao, prioridade, prazo, criado_por)
    values (
      d.id, d.titulo, 'Encaminhamento', p_destinatario_id, v_unidade_dest,
      'em_andamento', coalesce(p_prioridade, d.prioridade), p_prazo, v_autor)
    returning id into v_tarefa;

    update gestao.demandas
       set responsavel_atual_id = p_destinatario_id,
           unidade_responsavel_id = v_unidade_dest,
           situacao = case when situacao = 'aberta' then 'em_andamento' else situacao end
     where id = v_demanda;
  end if;

  -- Visibilidade estrita por tarefa (critério 4): NÃO adicionamos o
  -- destinatário como participante da demanda. No ramo de demanda ele já
  -- vira responsavel_atual; no ramo de tarefa, o acesso vem da posse da
  -- tarefa (fn_pode_ver_tarefa), sem expor as tarefas irmãs.
  perform gestao.fn_registrar_movimentacao(
    v_demanda, v_tarefa, v_autor, 'encaminhamento', p_texto,
    null, null, p_destinatario_id, p_prioridade, p_prazo);

  insert into gestao.notificacoes(usuario_id, demanda_id, tarefa_id, tipo, titulo, mensagem)
    values (p_destinatario_id, v_demanda, v_tarefa, 'encaminhamento',
            'Tarefa recebida', coalesce(p_texto, 'Você recebeu um encaminhamento.'));

  return v_tarefa;
end;
$$;

-- =====================================================================
-- fn_concluir — só quem criou a demanda ou é o responsável atual.
-- Chefia/gabinete/admin_ti deixam de ter esse atalho. Mantém a cascata de
-- encerramento de subtarefas e a limpeza de prazo_suspenso_em (sql/029).
-- =====================================================================
create or replace function gestao.fn_concluir(
  p_demanda_id uuid,
  p_conclusao text)
returns void
language plpgsql security definer
set search_path = gestao, pg_temp
as $$
declare
  v_autor uuid := gestao.fn_usuario_corrente();
  v_tarefa gestao.tarefas%rowtype;
  d gestao.demandas%rowtype;
begin
  if p_conclusao is null or btrim(p_conclusao) = '' then
    raise exception 'Conclusão/desfecho é obrigatório para concluir.' using errcode = 'check_violation';
  end if;

  select * into d from gestao.demandas where id = p_demanda_id and ativo;
  if not found then
    raise exception 'Demanda inexistente ou inativa.' using errcode = 'check_violation';
  end if;

  if not (v_autor = d.responsavel_atual_id or v_autor = d.criado_por) then
    raise exception 'Apenas o responsável atual ou quem criou a demanda podem concluí-la.'
      using errcode = 'insufficient_privilege';
  end if;

  if not gestao.fn_transicao_valida(d.situacao, 'concluida') then
    raise exception 'Não é possível concluir a partir de %.', d.situacao using errcode = 'check_violation';
  end if;

  update gestao.demandas
     set situacao_anterior = d.situacao,
         situacao = 'concluida',
         conclusao = p_conclusao,
         data_conclusao = now(),
         prazo_suspenso_em = null
   where id = p_demanda_id;

  perform gestao.fn_registrar_movimentacao(
    p_demanda_id, null, v_autor, 'conclusao', p_conclusao, d.situacao, 'concluida');

  -- Encerra em cascata as subtarefas ainda abertas: nada fica órfão e
  -- invisível numa demanda já concluída (sql/029).
  for v_tarefa in
    select * from gestao.tarefas
     where demanda_id = p_demanda_id and ativo and situacao <> 'concluida'
  loop
    update gestao.tarefas
       set situacao_anterior = v_tarefa.situacao,
           situacao = 'concluida',
           conclusao = coalesce(conclusao, 'Encerrada automaticamente: a demanda foi concluída.'),
           data_conclusao = now()
     where id = v_tarefa.id;

    perform gestao.fn_registrar_movimentacao(
      p_demanda_id, v_tarefa.id, v_autor, 'conclusao',
      'Encerrada automaticamente: a demanda foi concluída.',
      v_tarefa.situacao, 'concluida');

    if v_tarefa.responsavel_id <> v_autor then
      insert into gestao.notificacoes(usuario_id, demanda_id, tarefa_id, tipo, titulo, mensagem)
        values (v_tarefa.responsavel_id, p_demanda_id, v_tarefa.id, 'conclusao',
                'Tarefa encerrada', 'A demanda foi concluída e esta tarefa foi encerrada automaticamente.');
    end if;
  end loop;
end;
$$;

-- =====================================================================
-- fn_criar_subtarefa — quem é dono da demanda (criador ou responsável
-- atual) pode criar direto na raiz OU sob qualquer tarefa; quem só
-- recebeu uma tarefa só pode criar A PARTIR DELA, nunca na raiz.
-- =====================================================================
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
    -- Ramificação sob uma tarefa existente: só quem a detém pode delegar
    -- a partir dela.
    select * into p from gestao.tarefas where id = p_parent_id and ativo;
    if not found then
      raise exception 'Tarefa-mãe inexistente ou inativa.' using errcode = 'check_violation';
    end if;
    if p.responsavel_id <> v_autor then
      raise exception 'Apenas quem recebeu esta tarefa pode criar uma subtarefa a partir dela.'
        using errcode = 'insufficient_privilege';
    end if;
    v_demanda := p.demanda_id;
    v_prioridade_base := p.prioridade;
  else
    -- Tarefa-raiz direto na demanda: exclusivo de quem criou a demanda ou
    -- é o responsável atual por ela.
    if p_demanda_id is null then
      raise exception 'Informe a tarefa-mãe ou a demanda.' using errcode = 'check_violation';
    end if;
    select * into d from gestao.demandas where id = p_demanda_id and ativo;
    if not found then
      raise exception 'Demanda inexistente ou inativa.' using errcode = 'check_violation';
    end if;
    if not (v_autor = d.responsavel_atual_id or v_autor = d.criado_por) then
      raise exception 'Apenas o responsável atual ou quem criou a demanda podem criar uma subtarefa direto nela. Se você recebeu uma tarefa, crie a partir dela.'
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

-- =====================================================================
-- fn_reencaminhar_tarefa — "Trocar destino" — dois ajustes:
--
-- a) Devolução não bloqueia mais a troca. O guard original tratava
--    QUALQUER movimentação de outro autor como "o destinatário já agiu",
--    o que incluía a própria devolutiva — bloqueando exatamente o caso em
--    que trocar destino faz mais sentido (a pessoa recusou, quem delegou
--    quer redirecionar para outra pessoa). Devolutiva deixa de contar
--    como "já agiu" para este efeito.
-- b) A troca agora também reabre a tarefa (situação volta a
--    'em_andamento'). Sem isso, uma tarefa devolvida continuaria rotulada
--    "Devolvida" mesmo depois de redirecionada a alguém novo.
-- =====================================================================
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
  d gestao.demandas%rowtype;
  v_unidade uuid;
  v_era_responsavel_demanda boolean;
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

  -- Só enquanto o destinatário não agiu de fato: nenhuma movimentação de
  -- OUTRO usuário além de uma eventual devolutiva (recusar não conta como
  -- "agiu" para este efeito — é exatamente o caso que se quer redirecionar)
  -- e nenhuma subtarefa criada sob ela.
  if exists (select 1 from gestao.movimentacoes m
              where m.tarefa_id = p_tarefa_id and m.autor_id <> v_autor
                and m.tipo <> 'devolutiva')
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

  select * into d from gestao.demandas where id = t.demanda_id and ativo;
  if not found then
    raise exception 'Demanda inexistente ou inativa.' using errcode = 'check_violation';
  end if;

  v_era_responsavel_demanda := (d.responsavel_atual_id = t.responsavel_id);

  update gestao.tarefas
     set responsavel_id = p_novo_destinatario_id,
         unidade_responsavel_id = v_unidade,
         situacao_anterior = t.situacao,
         situacao = 'em_andamento'
   where id = p_tarefa_id;

  if v_era_responsavel_demanda then
    update gestao.demandas
       set responsavel_atual_id = p_novo_destinatario_id,
           unidade_responsavel_id = v_unidade
     where id = t.demanda_id;
  end if;

  perform gestao.fn_registrar_movimentacao(
    t.demanda_id, p_tarefa_id, v_autor, 'encaminhamento',
    coalesce(nullif(btrim(p_texto), ''), 'Destinatário alterado.'),
    null, null, p_novo_destinatario_id, t.prioridade, t.prazo);

  insert into gestao.notificacoes(usuario_id, demanda_id, tarefa_id, tipo, titulo, mensagem)
    values (p_novo_destinatario_id, t.demanda_id, p_tarefa_id, 'encaminhamento',
            'Tarefa encaminhada a você', 'Uma tarefa foi encaminhada a você.');
end;
$$;
