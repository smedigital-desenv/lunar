-- =====================================================================
-- 999_testes.sql
-- Critérios de aceite (seção 22 de docs/ESPEC.md) — 13 verificações.
-- Sistema de Gestão de Demandas — SME Ribeirão Preto
--
-- COMO RODAR
--   Rode o arquivo inteiro em UMA execução (SQL Editor do Supabase ou psql),
--   como o MESMO dono das tabelas (postgres). O script:
--     • roda tudo dentro de uma transação e faz ROLLBACK no fim — NÃO altera
--       o schema nem suja o seed (nenhum dado de teste persiste);
--     • imprime, por critério, PASSOU ou FALHOU (via NOTICE e no resultado
--       final da consulta a _res).
--
-- COMO O USUÁRIO É SIMULADO
--   auth.uid() lê o "sub" de request.jwt.claims. A função pg_temp.como(uuid)
--   define esse claim, de modo que as funções SECURITY DEFINER (007) e as
--   policies enxergam aquele usuário. Os testes de VISIBILIDADE (3, 4, 5)
--   avaliam fn_pode_ver_demanda/fn_pode_ver_tarefa — que são EXATAMENTE os
--   predicados USING das policies pol_sel_demandas/pol_sel_tarefas (005);
--   logo, o que elas retornam é o que a API entrega linha a linha. O critério
--   3 traz ainda uma checagem "ao vivo" trocando para o papel `authenticated`.
--
-- OBSERVAÇÕES
--   • now() é congelado por transação: onde o teste precisa de uma movimentação
--     POSTERIOR de terceiro (critério 7), ela é inserida com criado_em explícito.
--   • Critérios 11 (relatório PDF — fn_emitir_relatorio é da Sessão 10) e 13
--     (uso em celular — front-end) NÃO são verificáveis por SQL: saem como
--     IGNORADO, com nota.
--   • Não altere o schema aqui. Depois de rodar, corrija só o que falhar.
--
-- Usuários/unidades usam os UUIDs fixos do seed (008_seed.sql).
-- =====================================================================

begin;

set local search_path = gestao, extensions, public, pg_temp;

-- Coletor de resultados.
create temp table _res(
  criterio text,
  passou   boolean,
  detalhe  text,
  ordem    int
) on commit drop;

-- Helper: passa a "agir como" o usuário informado (define auth.uid()).
create function pg_temp.como(p_usuario uuid) returns void
language plpgsql as $f$
begin
  perform set_config('request.jwt.claims',
                     json_build_object('sub', p_usuario::text, 'role', 'authenticated')::text,
                     true);
end;
$f$;

-- Atalhos de UUID do seed (constantes só para leitura visual).
--   Unidades: GEF=33..01  GTI=33..04  SAI=44..01  SFO=44..04  SSI=44..05
--   Usuários: gerGEF=aa..05 gerGTI=aa..06 chSAI=aa..07 chSSI=aa..08
--             agSAI=aa..09  agSFO=aa..10  adminTI=aa..11 gabinete=aa..01

-- =====================================================================
-- Critério 1 — UPDATE/DELETE em movimentacoes, anexos e auditoria falham,
-- mesmo executados pelo dono (aqui rodamos como o próprio dono das tabelas;
-- o front, papel `authenticated`, sequer tem grant de UPDATE/DELETE).
-- =====================================================================
do $$
declare
  v_dem uuid; v_mov uuid; v_anx uuid; v_aud uuid;
  v_falhou_update boolean; v_falhou_delete boolean;
  v_ok boolean := true; v_det text := '';
begin
  perform pg_temp.como('aaaaaaaa-0000-0000-0000-000000000009');   -- agente SAI
  v_dem := gestao.fn_criar_demanda('Imutabilidade', 'Objeto imutabilidade');
  select id into v_mov from gestao.movimentacoes where demanda_id = v_dem limit 1;
  select id into v_aud from gestao.auditoria
    where entidade = 'demandas' and entidade_id = v_dem limit 1;
  insert into gestao.anexos(demanda_id, nome_original, nome_storage, storage_path, anexado_por)
    values (v_dem, 'a.pdf', 'a.pdf', 'x/a.pdf', 'aaaaaaaa-0000-0000-0000-000000000009')
    returning id into v_anx;

  -- movimentacoes
  v_falhou_update := false; v_falhou_delete := false;
  begin update gestao.movimentacoes set texto = 'hack' where id = v_mov;
  exception when others then v_falhou_update := true; end;
  begin delete from gestao.movimentacoes where id = v_mov;
  exception when others then v_falhou_delete := true; end;
  if not (v_falhou_update and v_falhou_delete) then
    v_ok := false; v_det := v_det || 'movimentacoes alterável; ';
  end if;

  -- anexos
  v_falhou_update := false; v_falhou_delete := false;
  begin update gestao.anexos set nome_original = 'hack' where id = v_anx;
  exception when others then v_falhou_update := true; end;
  begin delete from gestao.anexos where id = v_anx;
  exception when others then v_falhou_delete := true; end;
  if not (v_falhou_update and v_falhou_delete) then
    v_ok := false; v_det := v_det || 'anexos alterável; ';
  end if;

  -- auditoria
  v_falhou_update := false; v_falhou_delete := false;
  begin update gestao.auditoria set acao = 'hack' where id = v_aud;
  exception when others then v_falhou_update := true; end;
  begin delete from gestao.auditoria where id = v_aud;
  exception when others then v_falhou_delete := true; end;
  if not (v_falhou_update and v_falhou_delete) then
    v_ok := false; v_det := v_det || 'auditoria alterável; ';
  end if;

  insert into _res values ('1', v_ok,
    coalesce(nullif(v_det,''), 'UPDATE/DELETE bloqueados em movimentacoes, anexos e auditoria.'), 1);
exception when others then
  insert into _res values ('1', false, 'erro inesperado: ' || sqlerrm, 1);
end;
$$;

-- =====================================================================
-- Critério 2 — Encaminhar muda responsavel_atual_id, cria exatamente 1
-- movimentação e 1 notificação, na mesma transação.
-- =====================================================================
do $$
declare
  v_dem uuid; v_resp_antes uuid; v_resp_depois uuid;
  v_mov_antes int; v_mov_depois int; v_not_antes int; v_not_depois int;
  v_ok boolean;
begin
  perform pg_temp.como('aaaaaaaa-0000-0000-0000-000000000005');   -- gerente GEF (autor = responsável)
  v_dem := gestao.fn_criar_demanda('Encaminhar', 'Objeto encaminhar');
  select responsavel_atual_id into v_resp_antes from gestao.demandas where id = v_dem;
  select count(*) into v_mov_antes from gestao.movimentacoes where demanda_id = v_dem;
  select count(*) into v_not_antes from gestao.notificacoes where demanda_id = v_dem;

  perform gestao.fn_encaminhar('aaaaaaaa-0000-0000-0000-000000000009',  -- para agente SAI
                               'Providencie.', v_dem);

  select responsavel_atual_id into v_resp_depois from gestao.demandas where id = v_dem;
  select count(*) into v_mov_depois from gestao.movimentacoes where demanda_id = v_dem;
  select count(*) into v_not_depois from gestao.notificacoes where demanda_id = v_dem;

  v_ok := v_resp_antes = 'aaaaaaaa-0000-0000-0000-000000000005'
      and v_resp_depois = 'aaaaaaaa-0000-0000-0000-000000000009'
      and (v_mov_depois - v_mov_antes) = 1
      and (v_not_depois - v_not_antes) = 1;

  insert into _res values ('2', v_ok,
    format('responsável %s→%s; Δmov=%s; Δnotif=%s',
      right(v_resp_antes::text,4), right(v_resp_depois::text,4),
      v_mov_depois - v_mov_antes, v_not_depois - v_not_antes), 2);
exception when others then
  insert into _res values ('2', false, 'erro inesperado: ' || sqlerrm, 2);
end;
$$;

-- =====================================================================
-- Critério 3 — Agente de outra unidade não recebe nenhuma linha de uma
-- demanda alheia (RLS). Predicado da policy + checagem ao vivo no papel
-- `authenticated`.
-- =====================================================================
do $$
declare
  v_dem uuid;
  v_ve_dono boolean; v_ve_gerente boolean; v_ve_alheio boolean;
  v_live int; v_live_txt text := 'ao vivo não avaliado';
  v_ok boolean;
begin
  perform pg_temp.como('aaaaaaaa-0000-0000-0000-000000000009');   -- agente SAI cria em SAI/GEF
  v_dem := gestao.fn_criar_demanda('Sigilo de escopo', 'Objeto escopo');

  v_ve_dono    := gestao.fn_pode_ver_demanda(v_dem, 'aaaaaaaa-0000-0000-0000-000000000009'); -- autor
  v_ve_gerente := gestao.fn_pode_ver_demanda(v_dem, 'aaaaaaaa-0000-0000-0000-000000000005'); -- gerente GEF (escopo)
  v_ve_alheio  := gestao.fn_pode_ver_demanda(v_dem, 'aaaaaaaa-0000-0000-0000-000000000010'); -- agente SFO (alheio)

  -- Prova "ao vivo": no papel authenticated, o agente alheio conta 0 linhas.
  begin
    perform pg_temp.como('aaaaaaaa-0000-0000-0000-000000000010');
    set local role authenticated;
    select count(*) into v_live from gestao.demandas where id = v_dem;
    reset role;
    v_live_txt := format('ao vivo: %s linha(s)', v_live);
  exception when others then
    begin reset role; exception when others then null; end;
    v_live := null;
    v_live_txt := 'ao vivo não avaliado (' || sqlerrm || ')';
  end;

  v_ok := v_ve_dono and v_ve_gerente and not v_ve_alheio
          and (v_live is null or v_live = 0);

  insert into _res values ('3', v_ok,
    format('dono=%s gerente=%s alheio=%s; %s',
      v_ve_dono, v_ve_gerente, v_ve_alheio, v_live_txt), 3);
exception when others then
  begin reset role; exception when others then null; end;
  insert into _res values ('3', false, 'erro inesperado: ' || sqlerrm, 3);
end;
$$;

-- =====================================================================
-- Critério 4 — Quem recebeu uma subtarefa enxerga ela e suas descendentes,
-- e NÃO enxerga as tarefas irmãs.
-- =====================================================================
do $$
declare
  v_dem uuid; v_tp uuid; v_s1 uuid; v_s2 uuid; v_s1a uuid;
  v_ve_s1 boolean; v_ve_s1a boolean; v_ve_s2 boolean;
  v_ok boolean;
begin
  perform pg_temp.como('aaaaaaaa-0000-0000-0000-000000000005');   -- gerente GEF
  v_dem := gestao.fn_criar_demanda('Subtarefas', 'Objeto subtarefas');
  v_tp  := gestao.fn_encaminhar('aaaaaaaa-0000-0000-0000-000000000009', -- tarefa-mãe p/ agente SAI
                                'Analise.', v_dem);
  -- Duas subtarefas irmãs sob a tarefa-mãe (gerente ramifica no escopo).
  v_s1 := gestao.fn_criar_subtarefa(v_tp, 'aaaaaaaa-0000-0000-0000-000000000010', 'Sub 1'); -- p/ agente SFO
  v_s2 := gestao.fn_criar_subtarefa(v_tp, 'aaaaaaaa-0000-0000-0000-000000000008', 'Sub 2'); -- p/ chefe SSI

  -- Descendente de S1 (criada pelo próprio responsável de S1 = agente SFO).
  perform pg_temp.como('aaaaaaaa-0000-0000-0000-000000000010');
  v_s1a := gestao.fn_criar_subtarefa(v_s1, 'aaaaaaaa-0000-0000-0000-000000000007', 'Sub 1.a');

  v_ve_s1  := gestao.fn_pode_ver_tarefa(v_s1,  'aaaaaaaa-0000-0000-0000-000000000010'); -- própria
  v_ve_s1a := gestao.fn_pode_ver_tarefa(v_s1a, 'aaaaaaaa-0000-0000-0000-000000000010'); -- descendente
  v_ve_s2  := gestao.fn_pode_ver_tarefa(v_s2,  'aaaaaaaa-0000-0000-0000-000000000010'); -- irmã (deve ser falso)

  v_ok := v_ve_s1 and v_ve_s1a and not v_ve_s2;

  insert into _res values ('4', v_ok,
    format('própria=%s descendente=%s irmã=%s%s',
      v_ve_s1, v_ve_s1a, v_ve_s2,
      case when v_ve_s2 then ' — receber subtarefa torna o usuário participante da demanda (fn_garantir_participante em fn_criar_subtarefa), e fn_pode_ver_demanda libera as irmãs'
           else '' end), 4);
exception when others then
  insert into _res values ('4', false, 'erro inesperado: ' || sqlerrm, 4);
end;
$$;

-- =====================================================================
-- Critério 5 — Gerente vê seções subordinadas e não as de outra gerência;
-- mover a seção no organograma leva a visibilidade junto, sem código.
-- =====================================================================
do $$
declare
  v_dem uuid;
  v_gef_antes boolean; v_gti_antes boolean;
  v_gef_depois boolean; v_gti_depois boolean;
  v_ok boolean;
begin
  perform pg_temp.como('aaaaaaaa-0000-0000-0000-000000000009');   -- agente SAI cria em SAI (sob GEF)
  v_dem := gestao.fn_criar_demanda('Escopo por organograma', 'Objeto organograma');

  v_gef_antes := gestao.fn_pode_ver_demanda(v_dem, 'aaaaaaaa-0000-0000-0000-000000000005'); -- gerente GEF (sim)
  v_gti_antes := gestao.fn_pode_ver_demanda(v_dem, 'aaaaaaaa-0000-0000-0000-000000000006'); -- gerente GTI (não)

  -- Move a Seção de Anos Iniciais (SAI) da GEF para a GTI — só DADO, sem código.
  update gestao.unidades_organizacionais
     set parent_id = '33333333-0000-0000-0000-000000000004'          -- GTI
   where id = '44444444-0000-0000-0000-000000000001';                -- SAI

  v_gef_depois := gestao.fn_pode_ver_demanda(v_dem, 'aaaaaaaa-0000-0000-0000-000000000005'); -- GEF (agora não)
  v_gti_depois := gestao.fn_pode_ver_demanda(v_dem, 'aaaaaaaa-0000-0000-0000-000000000006'); -- GTI (agora sim)

  -- Restaura o organograma (a transação faz rollback, mas mantemos limpo).
  update gestao.unidades_organizacionais
     set parent_id = '33333333-0000-0000-0000-000000000001'          -- GEF
   where id = '44444444-0000-0000-0000-000000000001';

  v_ok := v_gef_antes and not v_gti_antes
          and not v_gef_depois and v_gti_depois;

  insert into _res values ('5', v_ok,
    format('antes GEF=%s GTI=%s; após mover SAI→GTI: GEF=%s GTI=%s',
      v_gef_antes, v_gti_antes, v_gef_depois, v_gti_depois), 5);
exception when others then
  insert into _res values ('5', false, 'erro inesperado: ' || sqlerrm, 5);
end;
$$;

-- =====================================================================
-- Critério 6 — Editar sem justificativa é rejeitado; com justificativa,
-- gera linha em auditoria com valores anterior e novo.
-- =====================================================================
do $$
declare
  v_dem uuid; v_rejeitou boolean := false;
  v_tit_antigo text; v_aud_ok boolean;
  v_ok boolean;
begin
  perform pg_temp.como('aaaaaaaa-0000-0000-0000-000000000005');   -- gerente GEF (edita no escopo)
  v_dem := gestao.fn_criar_demanda('Título original', 'Objeto edição');
  select titulo into v_tit_antigo from gestao.demandas where id = v_dem;

  -- Sem justificativa → rejeição.
  begin
    perform gestao.fn_editar_demanda(v_dem, '{"titulo":"Novo"}'::jsonb, '');
  exception when others then v_rejeitou := true; end;

  -- Com justificativa → sucesso + auditoria com anterior/novo.
  perform gestao.fn_editar_demanda(v_dem,
            '{"titulo":"Título corrigido"}'::jsonb, 'Correção do título a pedido.');

  select exists (
    select 1 from gestao.auditoria
     where entidade = 'demandas' and entidade_id = v_dem and acao = 'atualizacao'
       and dados_anteriores->>'titulo' = v_tit_antigo
       and dados_novos->>'titulo' = 'Título corrigido'
  ) into v_aud_ok;

  v_ok := v_rejeitou and v_aud_ok;

  insert into _res values ('6', v_ok,
    format('rejeitou sem justificativa=%s; auditoria anterior/novo=%s', v_rejeitou, v_aud_ok), 6);
exception when others then
  insert into _res values ('6', false, 'erro inesperado: ' || sqlerrm, 6);
end;
$$;

-- =====================================================================
-- Critério 7 — Retificar preserva o original e cria registro vinculado; é
-- rejeitada assim que outro usuário registra movimentação posterior — daí
-- resta apenas a ressalva.
-- =====================================================================
do $$
declare
  v_dem uuid; v_mov1 uuid; v_mov2 uuid; v_ret uuid; v_res uuid;
  v_orig_intacto boolean; v_vinculo boolean;
  v_janela_fechou boolean := false; v_ressalva_ok boolean := false;
  v_ok boolean;
begin
  perform pg_temp.como('aaaaaaaa-0000-0000-0000-000000000009');   -- agente SAI
  v_dem  := gestao.fn_criar_demanda('Retificação', 'Objeto retificação');
  select id into v_mov1 from gestao.movimentacoes
    where demanda_id = v_dem and tipo = 'criacao' limit 1;

  -- (A) Janela aberta: autor retifica a própria movimentação.
  v_ret := gestao.fn_retificar_movimentacao(v_mov1, 'Texto correto da criação.', 'Ajuste de redação.');
  select exists (select 1 from gestao.movimentacoes where id = v_mov1)            into v_orig_intacto;
  select (movimentacao_retificada_id = v_mov1) into v_vinculo
    from gestao.movimentacoes where id = v_ret;

  -- Nova movimentação do MESMO autor, alvo do teste de janela.
  perform gestao.fn_alterar_situacao(v_dem, 'em_andamento', 'Iniciando.');
  select id into v_mov2 from gestao.movimentacoes
    where demanda_id = v_dem and tipo = 'alteracao_situacao' limit 1;

  -- (B) Terceiro registra movimentação POSTERIOR (criado_em explícito: now()
  --     é congelado na transação). Isso deve fechar a janela de v_mov2.
  insert into gestao.movimentacoes(demanda_id, autor_id, tipo, texto, criado_em)
    values (v_dem, 'aaaaaaaa-0000-0000-0000-000000000005', 'comentario',
            'Intervenção de terceiro.', now() + interval '1 minute');

  begin
    perform gestao.fn_retificar_movimentacao(v_mov2, 'Outra correção.', 'Tentativa fora da janela.');
  exception when others then v_janela_fechou := true; end;

  -- (C) Fora da janela, resta a ressalva.
  begin
    v_res := gestao.fn_registrar_ressalva(v_mov2, 'Correção via ressalva.', 'Registro de ressalva.');
    v_ressalva_ok := v_res is not null;
  exception when others then v_ressalva_ok := false; end;

  v_ok := v_orig_intacto and v_vinculo and v_janela_fechou and v_ressalva_ok;

  insert into _res values ('7', v_ok,
    format('original intacto=%s vínculo=%s janela fechou=%s ressalva=%s',
      v_orig_intacto, v_vinculo, v_janela_fechou, v_ressalva_ok), 7);
exception when others then
  insert into _res values ('7', false, 'erro inesperado: ' || sqlerrm, 7);
end;
$$;

-- =====================================================================
-- Critério 8 — Inativar exige motivo, remove a demanda dos contadores
-- (ativo=false) e mantém a timeline íntegra.
-- =====================================================================
do $$
declare
  v_dem uuid; v_rejeitou boolean := false;
  v_mov_antes int; v_mov_depois int;
  v_ativo boolean; v_sit text;
  v_ok boolean;
begin
  perform pg_temp.como('aaaaaaaa-0000-0000-0000-000000000005');   -- gerente GEF (inativa no escopo)
  v_dem := gestao.fn_criar_demanda('Inativação', 'Objeto inativação');
  select count(*) into v_mov_antes from gestao.movimentacoes where demanda_id = v_dem;

  -- Sem motivo → rejeição.
  begin
    perform gestao.fn_inativar('demanda', v_dem, '');
  exception when others then v_rejeitou := true; end;

  -- Com motivo → inativa.
  perform gestao.fn_inativar('demanda', v_dem, 'Duplicidade com outra demanda.');

  select ativo, situacao into v_ativo, v_sit from gestao.demandas where id = v_dem;
  select count(*) into v_mov_depois from gestao.movimentacoes where demanda_id = v_dem;

  v_ok := v_rejeitou and (v_ativo = false) and (v_sit = 'inativa')
          and (v_mov_depois = v_mov_antes + 1);   -- timeline preservada + 1 (inativacao)

  insert into _res values ('8', v_ok,
    format('rejeitou sem motivo=%s ativo=%s situacao=%s timeline %s→%s',
      v_rejeitou, v_ativo, v_sit, v_mov_antes, v_mov_depois), 8);
exception when others then
  insert into _res values ('8', false, 'erro inesperado: ' || sqlerrm, 8);
end;
$$;

-- =====================================================================
-- Critério 9 — Concluir sem preencher a conclusão é rejeitado.
-- =====================================================================
do $$
declare
  v_dem uuid; v_rejeitou boolean := false; v_concluiu boolean; v_sit text;
  v_ok boolean;
begin
  perform pg_temp.como('aaaaaaaa-0000-0000-0000-000000000005');   -- gerente GEF
  v_dem := gestao.fn_criar_demanda('Conclusão obrigatória', 'Objeto conclusão');

  begin
    perform gestao.fn_concluir(v_dem, '');
  exception when others then v_rejeitou := true; end;

  perform gestao.fn_concluir(v_dem, 'Atendido: providência realizada.');
  select situacao into v_sit from gestao.demandas where id = v_dem;
  v_concluiu := v_sit = 'concluida';

  v_ok := v_rejeitou and v_concluiu;

  insert into _res values ('9', v_ok,
    format('rejeitou sem conclusão=%s; concluiu com conclusão=%s', v_rejeitou, v_concluiu), 9);
exception when others then
  insert into _res values ('9', false, 'erro inesperado: ' || sqlerrm, 9);
end;
$$;

-- =====================================================================
-- Critério 10 — Demanda com prazo suspenso por complementação não é contada
-- como atrasada durante a suspensão.
--   Obs.: o contador definitivo é da Sessão 8; aqui verificamos o bloco de
--   base (prazo_suspenso_em) com o predicado de atraso esperado.
-- =====================================================================
do $$
declare
  v_dem uuid; v_atrasada_antes boolean; v_atrasada_depois boolean; v_susp timestamptz;
  v_ok boolean;
begin
  perform pg_temp.como('aaaaaaaa-0000-0000-0000-000000000005');   -- gerente GEF
  v_dem := gestao.fn_criar_demanda('Prazo suspenso', 'Objeto prazo',
             p_prazo => current_date - 10);   -- prazo já vencido

  select (ativo and situacao not in ('concluida','inativa')
          and prazo is not null and prazo < current_date and prazo_suspenso_em is null)
    into v_atrasada_antes from gestao.demandas where id = v_dem;

  perform gestao.fn_solicitar_complementacao(v_dem, 'Faltam documentos.');

  select prazo_suspenso_em,
         (ativo and situacao not in ('concluida','inativa')
          and prazo is not null and prazo < current_date and prazo_suspenso_em is null)
    into v_susp, v_atrasada_depois from gestao.demandas where id = v_dem;

  v_ok := v_atrasada_antes and (v_susp is not null) and (v_atrasada_depois = false);

  insert into _res values ('10', v_ok,
    format('atrasada antes=%s; suspenso=%s; atrasada durante suspensão=%s',
      v_atrasada_antes, (v_susp is not null), v_atrasada_depois), 10);
exception when others then
  insert into _res values ('10', false, 'erro inesperado: ' || sqlerrm, 10);
end;
$$;

-- =====================================================================
-- Critério 11 — Relatório-resumo em PDF (hash no rodapé confere). NÃO
-- verificável por SQL: fn_emitir_relatorio e a Edge Function são da Sessão 10.
-- =====================================================================
insert into _res values ('11', null,
  'IGNORADO — relatório PDF/Edge Function (Sessão 10); fora do escopo SQL.', 11);

-- =====================================================================
-- Critério 12 — Transição de situação não prevista é rejeitada pelo banco.
-- =====================================================================
do $$
declare
  v_dem uuid; v_rejeitou boolean := false;
  v_ok boolean;
begin
  perform pg_temp.como('aaaaaaaa-0000-0000-0000-000000000005');   -- gerente GEF
  v_dem := gestao.fn_criar_demanda('Transição inválida', 'Objeto transição');

  -- 'aberta' → 'devolvida' não está na máquina de estados (007b).
  begin
    perform gestao.fn_alterar_situacao(v_dem, 'devolvida', 'Transição não prevista.');
  exception when others then v_rejeitou := true; end;

  v_ok := v_rejeitou;

  insert into _res values ('12', v_ok,
    format('rejeitou transição aberta→devolvida=%s', v_rejeitou), 12);
exception when others then
  insert into _res values ('12', false, 'erro inesperado: ' || sqlerrm, 12);
end;
$$;

-- =====================================================================
-- Critério 13 — Interface utilizável em celular. NÃO verificável por SQL
-- (front-end responsivo; ver Sessões 5+).
-- =====================================================================
insert into _res values ('13', null,
  'IGNORADO — responsividade da interface (front-end); fora do escopo SQL.', 13);

-- =====================================================================
-- Relatório final.
-- =====================================================================
do $$
declare r record; v_pass int := 0; v_fail int := 0; v_skip int := 0;
begin
  raise notice '======== CRITÉRIOS DE ACEITE (seção 22) ========';
  for r in select * from _res order by ordem loop
    if r.passou is null then
      v_skip := v_skip + 1;
      raise notice 'Critério %: IGNORADO — %', r.criterio, r.detalhe;
    elsif r.passou then
      v_pass := v_pass + 1;
      raise notice 'Critério %: PASSOU — %', r.criterio, r.detalhe;
    else
      v_fail := v_fail + 1;
      raise notice 'Critério %: FALHOU — %', r.criterio, r.detalhe;
    end if;
  end loop;
  raise notice '------------------------------------------------';
  raise notice 'Resumo: % PASSOU, % FALHOU, % IGNORADO', v_pass, v_fail, v_skip;
end;
$$;

-- Resultado tabular (para quem roda no SQL Editor).
select criterio,
       case when passou is null then 'IGNORADO'
            when passou then 'PASSOU' else 'FALHOU' end as resultado,
       detalhe
  from _res
 order by ordem;

-- Nada é persistido: o teste não altera schema nem seed.
rollback;
