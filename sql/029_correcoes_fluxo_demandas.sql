-- =====================================================================
-- 029_correcoes_fluxo_demandas.sql
-- Três correções da revisão de fluxo (gestão de prazo, devolução de
-- responsabilidade e conclusão com subtarefas abertas).
-- Sistema de Gestão de Demandas — SME Ribeirão Preto.
-- =====================================================================

set search_path = gestao, extensions, public;

-- =====================================================================
-- 1) PRAZO SUSPENSO NUNCA VOLTAVA A CONTAR
--
-- fn_solicitar_complementacao grava prazo_suspenso_em, e todo indicador de
-- atraso (dashboard, KPI, painel) exclui da contagem quem tem
-- prazo_suspenso_em preenchido. Como nada limpava esse campo, uma demanda
-- que passou por complementação UMA VEZ saía do indicador de atraso PARA
-- SEMPRE, mesmo depois de respondida e mesmo meses após vencer.
--
-- Correção: ao prestar a complementação (ou, por simetria, ao sair de
-- "aguardando_complementacao" via fn_alterar_situacao), o prazo é
-- PRORROGADO pelos dias úteis perdidos com a espera (fn_dias_uteis_entre
-- já existe) e prazo_suspenso_em é limpo. O prazo passa a ser justo com
-- quem esperou resposta e volta a ser cobrável.
-- =====================================================================

create or replace function gestao.fn_responder_complementacao(
  p_demanda_id uuid,
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
  v_solicitante uuid;
  v_dias_perdidos int := 0;
  v_novo_prazo date;
  v_texto_mov text;
  d gestao.demandas%rowtype;
begin
  if p_texto is null or btrim(p_texto) = '' then
    raise exception 'O texto da complementação é obrigatório.' using errcode = 'check_violation';
  end if;

  select * into d from gestao.demandas where id = p_demanda_id and ativo;
  if not found then
    raise exception 'Demanda inexistente ou inativa.' using errcode = 'check_violation';
  end if;
  if d.situacao <> 'aguardando_complementacao' then
    raise exception 'Esta demanda não está aguardando complementação.' using errcode = 'check_violation';
  end if;

  -- Quem presta a complementação é quem recebeu o pedido de volta
  -- (responsável atual); criador e solicitante também podem responder.
  if not (v_autor = d.responsavel_atual_id
          or v_autor = d.criado_por
          or v_autor = d.solicitante_id) then
    raise exception 'Apenas o responsável atual, o criador ou o solicitante podem prestar a complementação.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Prorroga o prazo pelos dias úteis em que a demanda ficou suspensa.
  v_novo_prazo := d.prazo;
  if d.prazo_suspenso_em is not null then
    v_dias_perdidos := gestao.fn_dias_uteis_entre(d.prazo_suspenso_em::date, current_date);
    if d.prazo is not null and v_dias_perdidos > 0 then
      v_novo_prazo := gestao.fn_adiciona_dias_uteis(d.prazo, v_dias_perdidos);
    end if;
  end if;
  v_texto_mov := p_texto;
  if v_dias_perdidos > 0 then
    v_texto_mov := p_texto || format(
      ' (prazo prorrogado em %s dia(s) útil(eis): tempo em que a demanda ficou aguardando complementação.)',
      v_dias_perdidos);
  end if;

  update gestao.demandas
     set situacao_anterior = d.situacao,
         situacao = 'em_andamento',
         prazo = v_novo_prazo,
         prazo_suspenso_em = null,
         prazo_retomado_em = now()
   where id = p_demanda_id;

  v_mov := gestao.fn_registrar_movimentacao(
    p_demanda_id, null, v_autor, 'complementacao', v_texto_mov,
    d.situacao, 'em_andamento');

  for v_anexo in select value from jsonb_array_elements(coalesce(p_anexos, '[]'::jsonb)) loop
    insert into gestao.anexos(
      demanda_id, tarefa_id, movimentacao_id, nome_original, nome_storage,
      mime, tamanho_bytes, hash_sha256, storage_path, link_externo, anexado_por)
    values (
      p_demanda_id, null, v_mov,
      v_anexo->>'nome_original',
      coalesce(v_anexo->>'nome_storage', v_anexo->>'nome_original'),
      v_anexo->>'mime', nullif(v_anexo->>'tamanho_bytes', '')::bigint,
      v_anexo->>'hash_sha256', v_anexo->>'storage_path', v_anexo->>'link_externo',
      v_autor);
  end loop;

  -- Avisa quem pediu a complementação (autor do pedido mais recente).
  select autor_id into v_solicitante
    from gestao.movimentacoes
   where demanda_id = p_demanda_id and tipo = 'solicitacao_complementacao'
   order by criado_em desc limit 1;

  if v_solicitante is not null and v_solicitante <> v_autor then
    insert into gestao.notificacoes(usuario_id, demanda_id, tipo, titulo, mensagem)
      values (v_solicitante, p_demanda_id, 'complementacao',
              'Complementação prestada', 'A complementação solicitada foi respondida.');
  end if;

  return v_mov;
end;
$$;

-- Mesma correção de prazo por simetria: fn_alterar_situacao também pode,
-- em tese, tirar a demanda de "aguardando_complementacao" (é RPC pública).
-- Sem isto, chamar por essa via ainda deixaria o prazo suspenso para
-- sempre.
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
  v_prazo_suspenso timestamptz;
  v_prazo date;
  v_dias_perdidos int := 0;
  v_novo_prazo date;
begin
  if p_nova_situacao in ('concluida','inativa','reaberta') then
    raise exception 'Use a função específica para %.' , p_nova_situacao
      using errcode = 'check_violation';
  end if;

  select situacao, prazo_suspenso_em, prazo
    into v_atual, v_prazo_suspenso, v_prazo
    from gestao.demandas where id = p_demanda_id and ativo;
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

  v_novo_prazo := v_prazo;
  if v_atual = 'aguardando_complementacao' and p_nova_situacao = 'em_andamento'
     and v_prazo_suspenso is not null then
    v_dias_perdidos := gestao.fn_dias_uteis_entre(v_prazo_suspenso::date, current_date);
    if v_prazo is not null and v_dias_perdidos > 0 then
      v_novo_prazo := gestao.fn_adiciona_dias_uteis(v_prazo, v_dias_perdidos);
    end if;
  end if;

  update gestao.demandas
     set situacao_anterior = v_atual,
         situacao = p_nova_situacao,
         prazo = v_novo_prazo,
         prazo_suspenso_em = case
           when v_atual = 'aguardando_complementacao' and p_nova_situacao = 'em_andamento'
           then null else prazo_suspenso_em end,
         prazo_retomado_em = case
           when v_atual = 'aguardando_complementacao' and p_nova_situacao = 'em_andamento'
           then now() else prazo_retomado_em end
   where id = p_demanda_id;

  perform gestao.fn_registrar_movimentacao(
    p_demanda_id, null, v_autor, 'alteracao_situacao', p_texto, v_atual, p_nova_situacao);
end;
$$;

-- =====================================================================
-- 2) DEVOLVER TAREFA NÃO DEVOLVIA A DEMANDA
--
-- Quando a demanda é encaminhada, o destinatário vira responsavel_atual
-- da DEMANDA (fn_encaminhar). Se ele devolve a tarefa recusando o
-- trabalho, só a TAREFA voltava para quem delegou — a demanda continuava
-- com responsavel_atual_id apontando para quem acabou de recusar. A
-- demanda ficava "presa" com o dono errado.
--
-- Correção: se quem está devolvendo é, neste momento, também o
-- responsável atual da DEMANDA (ou seja, esta tarefa é o que sustenta a
-- responsabilidade formal dele sobre ela), a devolução também devolve a
-- responsabilidade da demanda a quem delegou (criado_por da tarefa). De
-- quebra, a demanda passa para a situação 'devolvida' quando a transição
-- é válida — situação que já existia no modelo (fn_transicao_valida) mas
-- nunca era usada para demandas.
-- =====================================================================

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
  d gestao.demandas%rowtype;
  v_unidade_delegador uuid;
  v_era_responsavel_demanda boolean;
  v_pode_relabel boolean;
begin
  select * into t from gestao.tarefas where id = p_tarefa_id and ativo;
  if not found then
    raise exception 'Tarefa inexistente ou inativa.' using errcode = 'check_violation';
  end if;
  if p_texto is null or btrim(p_texto) = '' then
    raise exception 'Texto da devolutiva é obrigatório.' using errcode = 'check_violation';
  end if;

  -- Só o responsável ATUAL pode devolver, e só uma vez (não redevolve algo
  -- já devolvido/concluído). Evita clicar "Devolver" várias vezes.
  if t.responsavel_id <> v_autor then
    raise exception 'Apenas o responsável atual da tarefa pode devolvê-la.'
      using errcode = 'insufficient_privilege';
  end if;
  if t.situacao in ('devolvida', 'concluida') then
    raise exception 'Esta tarefa não está em andamento para ser devolvida.'
      using errcode = 'check_violation';
  end if;

  select * into d from gestao.demandas where id = t.demanda_id and ativo;
  if not found then
    raise exception 'Demanda inexistente ou inativa.' using errcode = 'check_violation';
  end if;

  -- É o mesmo trabalho que sustenta a responsabilidade formal da demanda?
  v_era_responsavel_demanda := (d.responsavel_atual_id = t.responsavel_id);

  -- Devolve a responsabilidade a quem delegou (criador da tarefa), movendo a
  -- tarefa para a unidade dele. Assim ela sai da Entrada de quem devolveu.
  select unidade_id into v_unidade_delegador
    from gestao.usuarios where id = t.criado_por and ativo;

  update gestao.tarefas
     set situacao = 'devolvida',
         responsavel_id = t.criado_por,
         unidade_responsavel_id = coalesce(v_unidade_delegador, unidade_responsavel_id)
   where id = p_tarefa_id;

  if v_era_responsavel_demanda then
    v_pode_relabel := gestao.fn_transicao_valida(d.situacao, 'devolvida');
    update gestao.demandas
       set responsavel_atual_id = t.criado_por,
           unidade_responsavel_id = coalesce(v_unidade_delegador, unidade_responsavel_id),
           situacao_anterior = case when v_pode_relabel then d.situacao else situacao_anterior end,
           situacao = case when v_pode_relabel then 'devolvida' else situacao end
     where id = t.demanda_id;
  end if;

  v_mov := gestao.fn_registrar_movimentacao(
    t.demanda_id, p_tarefa_id, v_autor, 'devolutiva', p_texto,
    case when v_era_responsavel_demanda then d.situacao else null end,
    case when v_era_responsavel_demanda then 'devolvida' else null end,
    t.criado_por);

  for v_anexo in select value from jsonb_array_elements(coalesce(p_anexos, '[]'::jsonb)) loop
    insert into gestao.anexos(
      demanda_id, tarefa_id, movimentacao_id, nome_original, nome_storage,
      mime, tamanho_bytes, hash_sha256, storage_path, link_externo, anexado_por)
    values (
      t.demanda_id, p_tarefa_id, v_mov,
      v_anexo->>'nome_original',
      coalesce(v_anexo->>'nome_storage', v_anexo->>'nome_original'),
      v_anexo->>'mime', nullif(v_anexo->>'tamanho_bytes', '')::bigint,
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

-- =====================================================================
-- 3) CONCLUIR A DEMANDA COM SUBTAREFAS ABERTAS FAZIA O TRABALHO SUMIR
--
-- fn_concluir só avisava na tela; o banco concluía a demanda mesmo com
-- subtarefas abertas, e fn_caixa_entrada exclui demandas concluídas. As
-- pessoas com subtarefa aberta simplesmente deixavam de ver o que ainda
-- tinham para fazer ali — a tarefa continuava 'aberta' no banco, só
-- ficava invisível.
--
-- Correção: ao concluir, encerra em cascata toda subtarefa ainda aberta
-- (registrando o encerramento na timeline de cada uma e notificando o
-- responsável), em vez de deixá-las órfãs e escondidas.
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
  v_nivel_gerente smallint;
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
  if not gestao.fn_pode_ver_demanda(p_demanda_id, v_autor) then
    raise exception 'Sem acesso à demanda.' using errcode = 'insufficient_privilege';
  end if;

  select nivel into v_nivel_gerente from gestao.perfis where codigo = 'gerente';

  -- Responsável atual, criador, solicitante ou chefia (gerente/subsecretário)
  -- dentro do próprio ramo hierárquico. Escopo global (gabinete/admin_ti)
  -- NÃO dá acesso automático: só concluem se estiverem diretamente
  -- envolvidos na demanda (sql/025).
  if not (v_autor = d.responsavel_atual_id
          or v_autor = d.criado_por
          or v_autor = d.solicitante_id
          or (gestao.fn_nivel(v_autor) >= v_nivel_gerente
              and not gestao.fn_escopo_global(v_autor)
              and d.unidade_responsavel_id in (select gestao.fn_unidades_no_escopo(v_autor)))) then
    raise exception 'Apenas o responsável, o criador/solicitante ou a chefia no escopo podem concluir a demanda.'
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
  -- invisível numa demanda já concluída.
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
