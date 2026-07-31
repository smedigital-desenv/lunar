-- =====================================================================
-- 007b_funcoes_criacao_tramitacao.sql
-- Funções públicas (RPC) de criação e tramitação de demandas/tarefas.
-- Sistema de Gestão de Demandas — SME Ribeirão Preto
--
-- Todas SECURITY DEFINER: validam perfil, gravam a movimentação e (via
-- trigger de 006) a auditoria na MESMA transação. Nenhuma regra de negócio
-- fica no front. Grants de EXECUTE a `authenticated` no fim do arquivo.
-- =====================================================================

set search_path = gestao, extensions, public;

-- ---------------------------------------------------------------------
-- Máquina de estados (seção 7). Transições para 'inativa'/'reaberta' têm
-- funções próprias (fn_inativar/fn_reabrir); aqui só validamos o mapa.
-- ---------------------------------------------------------------------
create or replace function gestao.fn_transicao_valida(p_atual text, p_nova text)
returns boolean
language sql immutable
as $$
  select case p_atual
    when 'aberta' then p_nova in ('em_andamento','aguardando_complementacao','concluida','inativa')
    when 'em_andamento' then p_nova in ('aguardando_complementacao','devolvida','concluida','inativa')
    when 'aguardando_complementacao' then p_nova in ('em_andamento','concluida','inativa')
    when 'devolvida' then p_nova in ('em_andamento','concluida','inativa')
    when 'concluida' then p_nova in ('reaberta','inativa')
    when 'reaberta' then p_nova in ('aguardando_complementacao','devolvida','concluida','inativa')
    else false
  end;
$$;

-- ---------------------------------------------------------------------
-- fn_criar_demanda — cria a demanda (número gerado por trigger), registra
-- participantes (solicitante/responsável) e a movimentação de criação.
-- ---------------------------------------------------------------------
create or replace function gestao.fn_criar_demanda(
  p_titulo text,
  p_objeto_queixa text,
  p_descricao text default null,
  p_tipo_id uuid default null,
  p_categoria text default null,
  p_setor text default null,
  p_prioridade text default 'normal',
  p_prazo date default null,
  p_escola_id uuid default null,
  p_aluno_nome text default null,
  p_numero_processo_solar text default null,
  p_sigilo text default 'normal',
  p_solicitante_id uuid default null,
  p_responsavel_id uuid default null,
  p_pessoas jsonb default '[]'::jsonb)
returns uuid
language plpgsql security definer
set search_path = gestao, pg_temp
as $$
declare
  v_autor uuid := gestao.fn_usuario_corrente();
  v_solic uuid := coalesce(p_solicitante_id, v_autor);
  v_resp  uuid := coalesce(p_responsavel_id, v_autor);
  v_unidade uuid;
  v_demanda uuid;
  v_pessoa jsonb;
begin
  if p_titulo is null or btrim(p_titulo) = '' then
    raise exception 'Título é obrigatório.' using errcode = 'check_violation';
  end if;
  if p_objeto_queixa is null or btrim(p_objeto_queixa) = '' then
    raise exception 'Objeto/queixa é obrigatório.' using errcode = 'check_violation';
  end if;

  select unidade_id into v_unidade from gestao.usuarios where id = v_resp and ativo;
  if v_unidade is null then
    raise exception 'Responsável inexistente ou inativo.' using errcode = 'check_violation';
  end if;

  insert into gestao.demandas(
    titulo, descricao, objeto_queixa, tipo_id, categoria, setor, prioridade,
    situacao, prazo, escola_id, aluno_nome, numero_processo_solar, sigilo,
    solicitante_id, responsavel_atual_id, unidade_responsavel_id, criado_por)
  values (
    p_titulo, p_descricao, p_objeto_queixa, p_tipo_id, p_categoria, p_setor,
    coalesce(p_prioridade,'normal'), 'aberta', p_prazo, p_escola_id, p_aluno_nome,
    p_numero_processo_solar, coalesce(p_sigilo,'normal'),
    v_solic, v_resp, v_unidade, v_autor)
  returning id into v_demanda;

  perform gestao.fn_garantir_participante(v_demanda, v_solic, 'solicitante', v_autor);
  perform gestao.fn_garantir_participante(v_demanda, v_resp,  'responsavel', v_autor);
  perform gestao.fn_garantir_participante(v_demanda, v_autor, 'participante', v_autor);

  for v_pessoa in select value from jsonb_array_elements(coalesce(p_pessoas,'[]'::jsonb)) loop
    insert into gestao.pessoas_envolvidas(demanda_id, nome, vinculo, observacao, criado_por)
      values (v_demanda, v_pessoa->>'nome', v_pessoa->>'vinculo',
              v_pessoa->>'observacao', v_autor);
  end loop;

  perform gestao.fn_registrar_movimentacao(
    v_demanda, null, v_autor, 'criacao', 'Demanda criada.',
    null, 'aberta', v_resp, coalesce(p_prioridade,'normal'), p_prazo);

  if v_resp <> v_autor then
    insert into gestao.notificacoes(usuario_id, demanda_id, tipo, titulo, mensagem)
      values (v_resp, v_demanda, 'atribuicao', 'Nova demanda atribuída',
              'Você foi definido como responsável por uma demanda.');
  end if;

  return v_demanda;
end;
$$;

-- ---------------------------------------------------------------------
-- fn_encaminhar — encaminha uma demanda (cria tarefa ao destinatário) ou
-- redistribui uma tarefa existente (redistribuir de terceiro exige chefia).
-- ---------------------------------------------------------------------
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

    -- Redistribuir tarefa de outro usuário exige chefia no escopo (matriz 5.3).
    if t.responsavel_id <> v_autor
       and not gestao.fn_gerente_ou_superior_no_escopo(v_autor, t.unidade_responsavel_id) then
      raise exception 'Sem permissão para redistribuir tarefa de outro usuário.'
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
    if not gestao.fn_pode_ver_demanda(v_demanda, v_autor) then
      raise exception 'Sem acesso à demanda.' using errcode = 'insufficient_privilege';
    end if;

    insert into gestao.tarefas(
      demanda_id, titulo, descricao, responsavel_id, unidade_responsavel_id,
      situacao, prioridade, prazo, criado_por)
    select v_demanda, d.titulo, 'Encaminhamento', p_destinatario_id, v_unidade_dest,
           'em_andamento', coalesce(p_prioridade, d.prioridade), p_prazo, v_autor
      from gestao.demandas d where d.id = v_demanda
    returning id into v_tarefa;

    update gestao.demandas
       set responsavel_atual_id = p_destinatario_id,
           unidade_responsavel_id = v_unidade_dest,
           situacao = case when situacao = 'aberta' then 'em_andamento' else situacao end
     where id = v_demanda;
  end if;

  perform gestao.fn_garantir_participante(v_demanda, p_destinatario_id, 'participante', v_autor);

  perform gestao.fn_registrar_movimentacao(
    v_demanda, v_tarefa, v_autor, 'encaminhamento', p_texto,
    null, null, p_destinatario_id, p_prioridade, p_prazo);

  insert into gestao.notificacoes(usuario_id, demanda_id, tarefa_id, tipo, titulo, mensagem)
    values (p_destinatario_id, v_demanda, v_tarefa, 'encaminhamento',
            'Tarefa recebida', coalesce(p_texto, 'Você recebeu um encaminhamento.'));

  return v_tarefa;
end;
$$;

-- ---------------------------------------------------------------------
-- fn_criar_subtarefa — cria subtarefa sob uma tarefa (parent_id).
-- ---------------------------------------------------------------------
create or replace function gestao.fn_criar_subtarefa(
  p_parent_id uuid,
  p_responsavel_id uuid,
  p_titulo text,
  p_descricao text default null,
  p_prazo date default null,
  p_prioridade text default null)
returns uuid
language plpgsql security definer
set search_path = gestao, pg_temp
as $$
declare
  v_autor uuid := gestao.fn_usuario_corrente();
  v_unidade_resp uuid;
  v_sub uuid;
  p gestao.tarefas%rowtype;
begin
  select * into p from gestao.tarefas where id = p_parent_id and ativo;
  if not found then
    raise exception 'Tarefa-mãe inexistente ou inativa.' using errcode = 'check_violation';
  end if;
  if p_titulo is null or btrim(p_titulo) = '' then
    raise exception 'Título da subtarefa é obrigatório.' using errcode = 'check_violation';
  end if;

  -- Só o responsável da tarefa-mãe ou chefia no escopo pode ramificar.
  if p.responsavel_id <> v_autor
     and not gestao.fn_gerente_ou_superior_no_escopo(v_autor, p.unidade_responsavel_id) then
    raise exception 'Sem permissão para criar subtarefa nesta tarefa.'
      using errcode = 'insufficient_privilege';
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
    p.demanda_id, p_parent_id, p_titulo, p_descricao, p_responsavel_id,
    v_unidade_resp, 'aberta', coalesce(p_prioridade, p.prioridade), p_prazo, v_autor)
  returning id into v_sub;

  perform gestao.fn_garantir_participante(p.demanda_id, p_responsavel_id, 'participante', v_autor);

  perform gestao.fn_registrar_movimentacao(
    p.demanda_id, v_sub, v_autor, 'subtarefa', p_titulo,
    null, 'aberta', p_responsavel_id, coalesce(p_prioridade, p.prioridade), p_prazo);

  insert into gestao.notificacoes(usuario_id, demanda_id, tarefa_id, tipo, titulo, mensagem)
    values (p_responsavel_id, p.demanda_id, v_sub, 'subtarefa',
            'Subtarefa atribuída', 'Você recebeu uma subtarefa.');

  return v_sub;
end;
$$;

-- ---------------------------------------------------------------------
-- fn_registrar_devolutiva — responsável devolve a tarefa com texto e anexos.
-- Responsabilidade volta a quem delegou (criador da tarefa).
-- ---------------------------------------------------------------------
create or replace function gestao.fn_registrar_devolutiva(
  p_tarefa_id uuid,
  p_texto text,
  p_anexos jsonb default '[]'::jsonb)
returns uuid
language plpgsql security definer
set search_path = gestao, pg_temp
as $$
declare
  v_autor uuid := gestao.fn_usuario_corrente();
  v_mov uuid;
  v_anexo jsonb;
  t gestao.tarefas%rowtype;
begin
  select * into t from gestao.tarefas where id = p_tarefa_id and ativo;
  if not found then
    raise exception 'Tarefa inexistente ou inativa.' using errcode = 'check_violation';
  end if;
  if p_texto is null or btrim(p_texto) = '' then
    raise exception 'Texto da devolutiva é obrigatório.' using errcode = 'check_violation';
  end if;

  update gestao.tarefas set situacao = 'devolvida' where id = p_tarefa_id;

  v_mov := gestao.fn_registrar_movimentacao(
    t.demanda_id, p_tarefa_id, v_autor, 'devolutiva', p_texto);

  for v_anexo in select value from jsonb_array_elements(coalesce(p_anexos,'[]'::jsonb)) loop
    insert into gestao.anexos(
      demanda_id, tarefa_id, movimentacao_id, nome_original, nome_storage,
      mime, tamanho_bytes, hash_sha256, storage_path, link_externo, anexado_por)
    values (
      t.demanda_id, p_tarefa_id, v_mov,
      v_anexo->>'nome_original',
      coalesce(v_anexo->>'nome_storage', v_anexo->>'nome_original'),
      v_anexo->>'mime', nullif(v_anexo->>'tamanho_bytes','')::bigint,
      v_anexo->>'hash_sha256', v_anexo->>'storage_path', v_anexo->>'link_externo',
      v_autor);
  end loop;

  if t.criado_por <> v_autor then
    insert into gestao.notificacoes(usuario_id, demanda_id, tarefa_id, tipo, titulo, mensagem)
      values (t.criado_por, t.demanda_id, p_tarefa_id, 'devolutiva',
              'Devolutiva recebida', 'Uma tarefa que você delegou foi devolvida.');
  end if;

  return v_mov;
end;
$$;

-- ---------------------------------------------------------------------
-- fn_alterar_situacao — transições simples da demanda (não conclui, não
-- inativa, não reabre — essas têm função própria). Valida o mapa e cuida
-- da retomada de prazo ao sair de aguardando_complementacao.
-- ---------------------------------------------------------------------
create or replace function gestao.fn_alterar_situacao(
  p_demanda_id uuid,
  p_nova_situacao text,
  p_texto text default null)
returns void
language plpgsql security definer
set search_path = gestao, pg_temp
as $$
declare
  v_autor uuid := gestao.fn_usuario_corrente();
  v_atual text;
begin
  if p_nova_situacao in ('concluida','inativa','reaberta') then
    raise exception 'Use a função específica para %.' , p_nova_situacao
      using errcode = 'check_violation';
  end if;

  select situacao into v_atual from gestao.demandas where id = p_demanda_id and ativo;
  if v_atual is null then
    raise exception 'Demanda inexistente ou inativa.' using errcode = 'check_violation';
  end if;
  if not gestao.fn_pode_ver_demanda(p_demanda_id, v_autor) then
    raise exception 'Sem acesso à demanda.' using errcode = 'insufficient_privilege';
  end if;
  if not gestao.fn_transicao_valida(v_atual, p_nova_situacao) then
    raise exception 'Transição de % para % não permitida.', v_atual, p_nova_situacao
      using errcode = 'check_violation';
  end if;

  update gestao.demandas
     set situacao_anterior = v_atual,
         situacao = p_nova_situacao,
         prazo_retomado_em = case
           when v_atual = 'aguardando_complementacao' and p_nova_situacao = 'em_andamento'
           then now() else prazo_retomado_em end
   where id = p_demanda_id;

  perform gestao.fn_registrar_movimentacao(
    p_demanda_id, null, v_autor, 'alteracao_situacao', p_texto, v_atual, p_nova_situacao);
end;
$$;

-- ---------------------------------------------------------------------
-- fn_solicitar_complementacao — devolve a responsabilidade ao autor da
-- movimentação anterior e SUSPENDE a contagem de prazo (seção 7).
-- ---------------------------------------------------------------------
create or replace function gestao.fn_solicitar_complementacao(
  p_demanda_id uuid,
  p_texto text)
returns void
language plpgsql security definer
set search_path = gestao, pg_temp
as $$
declare
  v_autor uuid := gestao.fn_usuario_corrente();
  v_atual text;
  v_dest uuid;
begin
  select situacao into v_atual from gestao.demandas where id = p_demanda_id and ativo;
  if v_atual is null then
    raise exception 'Demanda inexistente ou inativa.' using errcode = 'check_violation';
  end if;
  if not gestao.fn_transicao_valida(v_atual, 'aguardando_complementacao') then
    raise exception 'Não é possível solicitar complementação a partir de %.', v_atual
      using errcode = 'check_violation';
  end if;

  -- Responsabilidade volta ao autor da última movimentação de outro usuário.
  select autor_id into v_dest
    from gestao.movimentacoes
   where demanda_id = p_demanda_id and autor_id <> v_autor
   order by criado_em desc limit 1;

  update gestao.demandas
     set situacao_anterior = v_atual,
         situacao = 'aguardando_complementacao',
         responsavel_atual_id = coalesce(v_dest, responsavel_atual_id),
         prazo_suspenso_em = now(),
         prazo_retomado_em = null
   where id = p_demanda_id;

  if v_dest is not null then
    perform gestao.fn_garantir_participante(p_demanda_id, v_dest, 'participante', v_autor);
  end if;

  perform gestao.fn_registrar_movimentacao(
    p_demanda_id, null, v_autor, 'solicitacao_complementacao', p_texto,
    v_atual, 'aguardando_complementacao', v_dest);

  if v_dest is not null then
    insert into gestao.notificacoes(usuario_id, demanda_id, tipo, titulo, mensagem)
      values (v_dest, p_demanda_id, 'complementacao',
              'Complementação solicitada', coalesce(p_texto,'Foi solicitada complementação.'));
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- fn_concluir — conclusão obrigatória (CHECK reforça no banco).
-- ---------------------------------------------------------------------
create or replace function gestao.fn_concluir(
  p_demanda_id uuid,
  p_conclusao text)
returns void
language plpgsql security definer
set search_path = gestao, pg_temp
as $$
declare
  v_autor uuid := gestao.fn_usuario_corrente();
  v_atual text;
begin
  if p_conclusao is null or btrim(p_conclusao) = '' then
    raise exception 'Conclusão/desfecho é obrigatório para concluir.' using errcode = 'check_violation';
  end if;
  select situacao into v_atual from gestao.demandas where id = p_demanda_id and ativo;
  if v_atual is null then
    raise exception 'Demanda inexistente ou inativa.' using errcode = 'check_violation';
  end if;
  if not gestao.fn_pode_ver_demanda(p_demanda_id, v_autor) then
    raise exception 'Sem acesso à demanda.' using errcode = 'insufficient_privilege';
  end if;
  if not gestao.fn_transicao_valida(v_atual, 'concluida') then
    raise exception 'Não é possível concluir a partir de %.', v_atual using errcode = 'check_violation';
  end if;

  update gestao.demandas
     set situacao_anterior = v_atual,
         situacao = 'concluida',
         conclusao = p_conclusao,
         data_conclusao = now()
   where id = p_demanda_id;

  perform gestao.fn_registrar_movimentacao(
    p_demanda_id, null, v_autor, 'conclusao', p_conclusao, v_atual, 'concluida');
end;
$$;

-- ---------------------------------------------------------------------
-- fn_reabrir — só gerente ou superior no escopo (seção 7). Justificativa
-- obrigatória. concluida -> reaberta (comporta-se como em_andamento).
-- ---------------------------------------------------------------------
create or replace function gestao.fn_reabrir(
  p_demanda_id uuid,
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
  if d.situacao <> 'concluida' then
    raise exception 'Só é possível reabrir demanda concluída.' using errcode = 'check_violation';
  end if;
  if not gestao.fn_gerente_ou_superior_no_escopo(v_autor, d.unidade_responsavel_id) then
    raise exception 'Reabertura exige gerente ou superior no escopo.'
      using errcode = 'insufficient_privilege';
  end if;

  update gestao.demandas
     set situacao_anterior = 'concluida',
         situacao = 'reaberta',
         data_conclusao = null,
         conclusao = null
   where id = p_demanda_id;

  perform gestao.fn_registrar_movimentacao(
    p_demanda_id, null, v_autor, 'reabertura', p_justificativa, 'concluida', 'reaberta');
end;
$$;

-- ---------------------------------------------------------------------
-- Grants de execução ao front (RPC).
-- ---------------------------------------------------------------------
grant execute on function gestao.fn_criar_demanda(text,text,text,uuid,text,text,text,date,uuid,text,text,text,uuid,uuid,jsonb) to authenticated;
grant execute on function gestao.fn_encaminhar(uuid,text,uuid,uuid,text,date) to authenticated;
grant execute on function gestao.fn_criar_subtarefa(uuid,uuid,text,text,date,text) to authenticated;
grant execute on function gestao.fn_registrar_devolutiva(uuid,text,jsonb) to authenticated;
grant execute on function gestao.fn_alterar_situacao(uuid,text,text) to authenticated;
grant execute on function gestao.fn_solicitar_complementacao(uuid,text) to authenticated;
grant execute on function gestao.fn_concluir(uuid,text) to authenticated;
grant execute on function gestao.fn_reabrir(uuid,text) to authenticated;
