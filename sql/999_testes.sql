-- =====================================================================
-- 999_testes.sql
-- Testes dos 13 critérios de aceite (seção 22 da ESPEC).
-- Sistema de Gestão de Demandas — SME Ribeirão Preto
--
-- COMO RODAR: cole o arquivo inteiro no SQL Editor do Supabase e execute.
--   • Tudo roda em UMA transação e termina com ROLLBACK — nada persiste
--     (o seed não é alterado). Sequências (número da demanda) não voltam,
--     então este teste "gasta" alguns números — comportamento esperado.
--   • O resultado aparece como TABELA no fim (criterio, status, detalhe);
--     mensagens extras saem em NOTICES.
--   • `auth.uid()` é simulado via GUC; RLS é testado com SET LOCAL ROLE.
--
-- NÃO altera o schema. Depende do seed (sql/008_seed.sql) já aplicado.
-- =====================================================================

begin;

set search_path = gestao, extensions, public;

create temporary table resultado (
  criterio int, titulo text, status text, detalhe text
) on commit drop;

-- Helper temporário: define o usuário corrente simulado (auth.uid()).
create or replace function pg_temp.login(p uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p::text, 'role', 'authenticated')::text, true);
end;
$$;

do $$
declare
  -- Usuários do seed
  u_gab        uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  u_ger_gef    uuid := 'aaaaaaaa-0000-0000-0000-000000000005';
  u_ger_gti    uuid := 'aaaaaaaa-0000-0000-0000-000000000006';
  u_chefe_sai  uuid := 'aaaaaaaa-0000-0000-0000-000000000007';
  u_chefe_ssi  uuid := 'aaaaaaaa-0000-0000-0000-000000000008';
  u_agente_sai uuid := 'aaaaaaaa-0000-0000-0000-000000000009';
  u_agente_sfo uuid := 'aaaaaaaa-0000-0000-0000-000000000010';
  u_admin      uuid := 'aaaaaaaa-0000-0000-0000-000000000011';
  -- Unidades do seed
  un_gef uuid := '33333333-0000-0000-0000-000000000001';
  un_gti uuid := '33333333-0000-0000-0000-000000000004';
  un_sai uuid := '44444444-0000-0000-0000-000000000001';
  un_ssi uuid := '44444444-0000-0000-0000-000000000005';

  v_dem uuid; v_dem2 uuid; v_tar uuid; v_t1 uuid;
  v_s1 uuid; v_s1a uuid; v_s2 uuid;
  v_mov uuid; v_mov2 uuid; v_anexo uuid; v_resp uuid;
  c_before int; c_after int; n_before int; n_after int;
  v1 int; v2 int; v3 int;
  b1 boolean; b2 boolean;
  v_sit text;
  v_antes boolean; v_depois boolean;
begin
  -- =================================================================
  -- C1 — UPDATE/DELETE em tabelas imutáveis falha (mesmo como dono).
  -- =================================================================
  execute 'reset role';
  begin
    perform pg_temp.login(u_agente_sai);
    v_dem := gestao.fn_criar_demanda(p_titulo=>'C1', p_objeto_queixa=>'obj');
    select id into v_mov from gestao.movimentacoes where demanda_id=v_dem limit 1;
    -- anexo via devolutiva (para testar imutabilidade de anexos)
    v_tar := gestao.fn_encaminhar(p_destinatario_id=>u_chefe_sai, p_texto=>'e', p_demanda_id=>v_dem);
    perform pg_temp.login(u_chefe_sai);
    v_mov2 := gestao.fn_registrar_devolutiva(v_tar, 'dev',
      '[{"nome_original":"a.pdf","storage_path":"x/a.pdf"}]'::jsonb);
    select id into v_anexo from gestao.anexos where movimentacao_id=v_mov2 limit 1;

    b1 := true;  -- assume tudo bloqueado até que algo passe
    execute 'reset role';  -- como dono (postgres) — deve ser bloqueado por trigger
    begin update gestao.movimentacoes set texto='x' where id=v_mov; b1:=false; exception when others then end;
    begin delete from gestao.movimentacoes where id=v_mov;        b1:=false; exception when others then end;
    begin update gestao.anexos set nome_original='x' where id=v_anexo; b1:=false; exception when others then end;
    begin update gestao.auditoria set acao='x' where entidade_id=v_dem; b1:=false; exception when others then end;

    if b1 then insert into resultado values (1,'Imutabilidade (UPDATE/DELETE bloqueado)','PASSOU',null);
    else insert into resultado values (1,'Imutabilidade (UPDATE/DELETE bloqueado)','FALHOU','alteração não foi bloqueada'); end if;
  exception when others then
    insert into resultado values (1,'Imutabilidade','ERRO', sqlerrm);
  end;

  -- =================================================================
  -- C2 — Encaminhar: muda responsavel_atual, cria 1 mov e 1 notif.
  -- =================================================================
  execute 'reset role';
  begin
    perform pg_temp.login(u_agente_sai);
    v_dem := gestao.fn_criar_demanda(p_titulo=>'C2', p_objeto_queixa=>'obj');
    select count(*) into c_before from gestao.movimentacoes where demanda_id=v_dem;
    select count(*) into n_before from gestao.notificacoes where usuario_id=u_chefe_ssi and demanda_id=v_dem;
    perform gestao.fn_encaminhar(p_destinatario_id=>u_chefe_ssi, p_texto=>'enc', p_demanda_id=>v_dem);
    select responsavel_atual_id into v_resp from gestao.demandas where id=v_dem;
    select count(*) into c_after from gestao.movimentacoes where demanda_id=v_dem;
    select count(*) into n_after from gestao.notificacoes where usuario_id=u_chefe_ssi and demanda_id=v_dem;
    if v_resp=u_chefe_ssi and c_after-c_before=1 and n_after-n_before=1 then
      insert into resultado values (2,'Encaminhar (responsavel + 1 mov + 1 notif)','PASSOU',null);
    else
      insert into resultado values (2,'Encaminhar','FALHOU',
        format('resp=%s dmov=%s dnotif=%s', v_resp=u_chefe_ssi, c_after-c_before, n_after-n_before));
    end if;
  exception when others then
    insert into resultado values (2,'Encaminhar','ERRO', sqlerrm);
  end;

  -- =================================================================
  -- C3 — Agente de outra unidade NÃO recebe linha de demanda alheia (RLS).
  -- =================================================================
  execute 'reset role';
  begin
    perform pg_temp.login(u_agente_sai);
    v_dem := gestao.fn_criar_demanda(p_titulo=>'C3', p_objeto_queixa=>'obj');
    perform pg_temp.login(u_agente_sfo);
    execute 'set local role authenticated';
    select count(*) into v1 from gestao.demandas where id=v_dem;
    execute 'reset role';
    if v1=0 then insert into resultado values (3,'RLS: agente de outra unidade não vê demanda alheia','PASSOU',null);
    else insert into resultado values (3,'RLS: isolamento por unidade','FALHOU', format('viu %s linha(s)', v1)); end if;
  exception when others then
    execute 'reset role';
    insert into resultado values (3,'RLS: isolamento','ERRO', sqlerrm);
  end;

  -- =================================================================
  -- C4 — Recebedor de subtarefa vê ela e descendentes, não vê irmãs.
  -- =================================================================
  execute 'reset role';
  begin
    perform pg_temp.login(u_chefe_sai);
    v_dem := gestao.fn_criar_demanda(p_titulo=>'C4', p_objeto_queixa=>'obj');
    v_t1  := gestao.fn_encaminhar(p_destinatario_id=>u_agente_sfo, p_texto=>'t1', p_demanda_id=>v_dem);
    perform pg_temp.login(u_agente_sfo);
    v_s1  := gestao.fn_criar_subtarefa(v_t1, u_agente_sai, 'S1');
    v_s2  := gestao.fn_criar_subtarefa(v_t1, u_chefe_ssi, 'S2');   -- irmã de S1
    perform pg_temp.login(u_agente_sai);
    v_s1a := gestao.fn_criar_subtarefa(v_s1, u_ger_gti, 'S1a');    -- descendente de S1

    perform pg_temp.login(u_agente_sai);                           -- recebedor de S1
    execute 'set local role authenticated';
    select count(*) into v1 from gestao.tarefas where id=v_s1;     -- deve ver
    select count(*) into v2 from gestao.tarefas where id=v_s1a;    -- deve ver
    select count(*) into v3 from gestao.tarefas where id=v_s2;     -- NÃO deve ver
    execute 'reset role';
    if v1=1 and v2=1 and v3=0 then
      insert into resultado values (4,'Subtarefa: vê própria+descendentes, não vê irmã','PASSOU',null);
    else
      insert into resultado values (4,'Subtarefa: visibilidade da subárvore','FALHOU',
        format('vê S1=%s S1a=%s irmã=%s (esperado 1/1/0)', v1, v2, v3));
    end if;
  exception when others then
    execute 'reset role';
    insert into resultado values (4,'Subtarefa: visibilidade','ERRO', sqlerrm);
  end;

  -- =================================================================
  -- C5 — Gerente vê seções subordinadas; mover no organograma muda
  --      a visibilidade sem código.
  -- =================================================================
  execute 'reset role';
  begin
    perform pg_temp.login(u_agente_sai);
    v_dem := gestao.fn_criar_demanda(p_titulo=>'C5-SAI', p_objeto_queixa=>'obj');  -- unidade SAI (sob GEF)
    perform pg_temp.login(u_chefe_ssi);
    v_dem2 := gestao.fn_criar_demanda(p_titulo=>'C5-SSI', p_objeto_queixa=>'obj'); -- unidade SSI (sob GTI)

    perform pg_temp.login(u_ger_gef);
    execute 'set local role authenticated';
    select count(*) into v1 from gestao.demandas where id=v_dem;   -- deve ver (1)
    select count(*) into v2 from gestao.demandas where id=v_dem2;  -- não deve ver (0)
    execute 'reset role';

    -- move a seção SAI para a gerência GTI (fora do ramo de GEF)
    update gestao.unidades_organizacionais set parent_id=un_gti where id=un_sai;

    perform pg_temp.login(u_ger_gef);
    execute 'set local role authenticated';
    select count(*) into v3 from gestao.demandas where id=v_dem;   -- agora não deve ver (0)
    execute 'reset role';

    -- restaura o organograma (senão contamina os próximos critérios: a SAI
    -- ficaria fora do escopo do gerente da GEF nesta mesma transação).
    update gestao.unidades_organizacionais set parent_id=un_gef where id=un_sai;

    if v1=1 and v2=0 and v3=0 then
      insert into resultado values (5,'Escopo recursivo do organograma (com remanejo)','PASSOU',null);
    else
      insert into resultado values (5,'Escopo recursivo do organograma','FALHOU',
        format('SAI antes=%s SSI=%s SAI após mover=%s (esperado 1/0/0)', v1, v2, v3));
    end if;
  exception when others then
    execute 'reset role';
    insert into resultado values (5,'Escopo recursivo','ERRO', sqlerrm);
  end;

  -- =================================================================
  -- C6 — Editar sem justificativa é rejeitado; com justificativa gera
  --      auditoria com valores anterior e novo.
  -- =================================================================
  execute 'reset role';
  begin
    perform pg_temp.login(u_agente_sai);
    v_dem := gestao.fn_criar_demanda(p_titulo=>'C6', p_objeto_queixa=>'obj');
    perform pg_temp.login(u_ger_gef);  -- gerente no escopo de SAI

    b1 := false;  -- rejeição sem justificativa
    begin
      perform gestao.fn_editar_demanda(v_dem, '{"titulo":"Novo"}'::jsonb, '');
    exception when others then b1 := true; end;

    perform gestao.fn_editar_demanda(v_dem, '{"titulo":"Novo Título"}'::jsonb, 'ajuste de título');
    select count(*) into v1 from gestao.auditoria
      where entidade='demandas' and entidade_id=v_dem and acao='atualizacao'
        and dados_anteriores->>'titulo' is distinct from dados_novos->>'titulo';
    b2 := v1 > 0;

    if b1 and b2 then insert into resultado values (6,'Edição: justificativa + auditoria anterior/novo','PASSOU',null);
    else insert into resultado values (6,'Edição','FALHOU', format('rejeitou_sem_just=%s auditou_diff=%s', b1, b2)); end if;
  exception when others then
    insert into resultado values (6,'Edição','ERRO', sqlerrm);
  end;

  -- =================================================================
  -- C7 — Retificação: preserva original + registro vinculado; rejeitada
  --      após intervenção de terceiro; resta a ressalva.
  -- =================================================================
  execute 'reset role';
  begin
    -- Parte 1: janela aberta -> retifica com sucesso
    perform pg_temp.login(u_agente_sai);
    v_dem := gestao.fn_criar_demanda(p_titulo=>'C7a', p_objeto_queixa=>'obj');
    select id into v_mov from gestao.movimentacoes where demanda_id=v_dem and tipo='criacao' limit 1;
    perform gestao.fn_retificar_movimentacao(v_mov, 'texto correto', 'corrigindo');
    select count(*) into v1 from gestao.movimentacoes where id=v_mov;                         -- original intacto (1)
    select count(*) into v2 from gestao.movimentacoes where movimentacao_retificada_id=v_mov; -- vinculado (1)
    b1 := (v1=1 and v2=1);

    -- Parte 2: intervenção de terceiro fecha a janela
    perform pg_temp.login(u_agente_sfo);
    v_dem2 := gestao.fn_criar_demanda(p_titulo=>'C7b', p_objeto_queixa=>'obj');
    select id into v_mov2 from gestao.movimentacoes where demanda_id=v_dem2 and tipo='criacao' limit 1;
    perform pg_temp.login(u_gab);  -- terceiro com acesso global (gabinete)
    perform gestao.fn_alterar_situacao(v_dem2, 'em_andamento', 'andamento');  -- intervenção de terceiro
    perform pg_temp.login(u_agente_sfo);
    b2 := false;
    begin
      perform gestao.fn_retificar_movimentacao(v_mov2, 'tarde', 'tentativa');
    exception when others then b2 := true; end;  -- deve ser rejeitada
    -- resta a ressalva
    perform gestao.fn_registrar_ressalva(v_mov2, 'teor correto', 'ressalva');
    select count(*) into v3 from gestao.movimentacoes where movimentacao_ressalvada_id=v_mov2;

    if b1 and b2 and v3=1 then insert into resultado values (7,'Retificação: original+vínculo, janela, ressalva','PASSOU',null);
    else insert into resultado values (7,'Retificação','FALHOU', format('parte1=%s rejeitou_apos_terceiro=%s ressalva=%s', b1, b2, v3)); end if;
  exception when others then
    insert into resultado values (7,'Retificação','ERRO', sqlerrm);
  end;

  -- =================================================================
  -- C8 — Inativar exige motivo, sai dos contadores (ativo=false), timeline íntegra.
  -- =================================================================
  execute 'reset role';
  begin
    perform pg_temp.login(u_agente_sai);
    v_dem := gestao.fn_criar_demanda(p_titulo=>'C8', p_objeto_queixa=>'obj');
    select count(*) into c_before from gestao.movimentacoes where demanda_id=v_dem;
    perform pg_temp.login(u_ger_gef);
    b1 := false;
    begin perform gestao.fn_inativar('demanda', v_dem, ''); exception when others then b1 := true; end; -- sem motivo -> rejeita
    perform gestao.fn_inativar('demanda', v_dem, 'duplicada');
    select ativo, situacao into b2, v_sit from gestao.demandas where id=v_dem;
    select count(*) into c_after from gestao.movimentacoes where demanda_id=v_dem;
    -- b2 recebeu 'ativo' (deve ser false); timeline íntegra: criacao ainda presente + inativacao
    if b1 and (b2 = false) and v_sit = 'inativa' and c_after >= c_before + 1 then
      insert into resultado values (8,'Inativação: motivo + ativo=false + timeline íntegra','PASSOU',null);
    else
      insert into resultado values (8,'Inativação','FALHOU', format('rejeitou_sem_motivo=%s ativo=%s movs %s->%s', b1, b2, c_before, c_after));
    end if;
  exception when others then
    insert into resultado values (8,'Inativação','ERRO', sqlerrm);
  end;

  -- =================================================================
  -- C9 — Concluir sem conclusão é rejeitado.
  -- =================================================================
  execute 'reset role';
  begin
    perform pg_temp.login(u_agente_sai);
    v_dem := gestao.fn_criar_demanda(p_titulo=>'C9', p_objeto_queixa=>'obj');
    b1 := false;
    begin perform gestao.fn_concluir(v_dem, ''); exception when others then b1 := true; end;
    if b1 then insert into resultado values (9,'Concluir sem conclusão é rejeitado','PASSOU',null);
    else insert into resultado values (9,'Concluir sem conclusão','FALHOU','foi aceito'); end if;
  exception when others then
    insert into resultado values (9,'Concluir sem conclusão','ERRO', sqlerrm);
  end;

  -- =================================================================
  -- C10 — Prazo suspenso por complementação não conta como atrasada.
  --       (predicado de atraso avaliado no nível de dados; a função de
  --        painel da Sessão 8 deve usar a mesma regra.)
  -- =================================================================
  execute 'reset role';
  begin
    perform pg_temp.login(u_agente_sai);
    v_dem := gestao.fn_criar_demanda(p_titulo=>'C10', p_objeto_queixa=>'obj',
             p_prazo=>current_date - 5);
    select (ativo and situacao not in ('concluida','inativa') and prazo is not null
            and prazo < current_date and prazo_suspenso_em is null)
      into v_antes from gestao.demandas where id=v_dem;                    -- deve ser TRUE (atrasada)
    perform gestao.fn_solicitar_complementacao(v_dem, 'faltou anexo');
    select (ativo and situacao not in ('concluida','inativa') and prazo is not null
            and prazo < current_date and prazo_suspenso_em is null)
      into v_depois from gestao.demandas where id=v_dem;                   -- deve ser FALSE (suspensa)
    if v_antes and not v_depois then
      insert into resultado values (10,'Prazo suspenso não conta como atrasada','PASSOU',null);
    else
      insert into resultado values (10,'Prazo suspenso','FALHOU', format('atrasada antes=%s depois=%s', v_antes, v_depois));
    end if;
  exception when others then
    insert into resultado values (10,'Prazo suspenso','ERRO', sqlerrm);
  end;

  -- =================================================================
  -- C11 — Relatório PDF: Edge Function (Sessão 10). Não testável em SQL.
  -- =================================================================
  insert into resultado values (11,'Relatório PDF (hash no rodapé)','PENDENTE','Sessão 10 — Edge Function; validar após implementar');

  -- =================================================================
  -- C12 — Transição de situação inválida é rejeitada pelo banco.
  -- =================================================================
  execute 'reset role';
  begin
    perform pg_temp.login(u_agente_sai);
    v_dem := gestao.fn_criar_demanda(p_titulo=>'C12', p_objeto_queixa=>'obj');  -- situacao 'aberta'
    b1 := false;
    begin perform gestao.fn_alterar_situacao(v_dem, 'devolvida', 'x'); exception when others then b1 := true; end;
    if b1 then insert into resultado values (12,'Transição inválida rejeitada (aberta->devolvida)','PASSOU',null);
    else insert into resultado values (12,'Transição inválida','FALHOU','foi aceita'); end if;
  exception when others then
    insert into resultado values (12,'Transição inválida','ERRO', sqlerrm);
  end;

  -- =================================================================
  -- C13 — Interface mobile: verificação visual/manual (Sessões 5+).
  -- =================================================================
  insert into resultado values (13,'Interface mobile (uso em celular)','N/A','Front-end — verificar manualmente nas telas');

  execute 'reset role';
end;
$$;

-- Resultado consolidado (aparece como tabela no editor).
select criterio, status, titulo, detalhe
  from resultado
 order by criterio;

rollback;
