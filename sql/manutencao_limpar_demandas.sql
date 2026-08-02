-- =====================================================================
-- manutencao_limpar_demandas.sql
--
-- ATENÇÃO: script DESTRUTIVO e IRREVERSÍVEL. Apaga TODAS as demandas e
-- tudo que pende delas (tarefas, movimentações, comentários, anexos,
-- notificações, relatórios emitidos e a auditoria correspondente).
-- Destina-se a LIMPAR DADOS DE TESTE antes da entrada em produção.
--
-- NÃO é numerado de propósito: não faz parte da sequência de migrações
-- (001, 002, ...) e não deve ser executado junto com elas.
--
-- Observações importantes:
--
-- 1) Isto contraria a regra 1 do projeto ("não existe DELETE em nenhuma
--    tabela"). Aquela regra governa o COMPORTAMENTO DO SISTEMA — pela
--    aplicação, registros são apenas inativados. Este é um procedimento
--    de manutenção, executado à mão, para descartar massa de teste.
--    Depois que houver dado real, use a inativação (ver o fim do arquivo).
--
-- 2) As tabelas append-only (movimentacoes, comentarios, anexos,
--    auditoria, relatorios_emitidos) têm trigger BEFORE UPDATE OR DELETE
--    que levanta exceção. Um DELETE simples FALHA nelas. O script
--    desativa esses gatilhos e os reativa ao final.
--
-- 3) Tudo roda em UMA transação e é restrito ao schema `gestao`. Este
--    banco é COMPARTILHADO com outros sistemas (nutricao, presenca) —
--    nenhuma linha fora de `gestao` é tocada. Se qualquer passo falhar,
--    o ROLLBACK desfaz inclusive a desativação dos gatilhos.
--
-- 4) Usuários, perfis, unidades, escolas, tipos e feriados são
--    PRESERVADOS. Só o conteúdo operacional é apagado.
--
-- 5) Os ARQUIVOS no Storage não são removidos por SQL. Depois de rodar,
--    esvazie os buckets `anexos` e `relatorios` pelo painel do Supabase
--    (Storage → bucket → selecionar tudo → excluir).
--
-- Sistema de Gestão de Demandas — SME Ribeirão Preto.
-- =====================================================================

begin;

-- --- Confirmação do que será apagado (aparece no resultado) -----------
select 'ANTES' as momento,
       (select count(*) from gestao.demandas)      as demandas,
       (select count(*) from gestao.tarefas)       as tarefas,
       (select count(*) from gestao.movimentacoes) as movimentacoes,
       (select count(*) from gestao.anexos)        as anexos;

-- --- Libera as tabelas append-only apenas durante esta transação ------
alter table gestao.movimentacoes       disable trigger trg_imutavel;
alter table gestao.comentarios         disable trigger trg_imutavel;
alter table gestao.anexos              disable trigger trg_imutavel;
alter table gestao.auditoria           disable trigger trg_imutavel;
alter table gestao.relatorios_emitidos disable trigger trg_imutavel;

-- --- Apaga do filho para o pai (respeitando as chaves estrangeiras) ---
delete from gestao.relatorios_emitidos;
delete from gestao.anexos;
delete from gestao.comentarios;
delete from gestao.notificacoes;
delete from gestao.movimentacoes;
delete from gestao.participantes;
delete from gestao.pessoas_envolvidas;
delete from gestao.tarefas;
delete from gestao.demandas;

-- Auditoria: só o que se refere ao conteúdo apagado. As linhas de
-- administração de usuários permanecem (não há FK aqui; o filtro é por
-- `entidade`).
delete from gestao.auditoria where entidade in ('demanda', 'tarefa', 'anexo');

-- --- Restaura a imutabilidade ----------------------------------------
alter table gestao.movimentacoes       enable trigger trg_imutavel;
alter table gestao.comentarios         enable trigger trg_imutavel;
alter table gestao.anexos              enable trigger trg_imutavel;
alter table gestao.auditoria           enable trigger trg_imutavel;
alter table gestao.relatorios_emitidos enable trigger trg_imutavel;

-- --- Reinicia a numeração (volta a DEM-AAAA-000001) -------------------
-- Há uma sequence por ano (seq_demanda_2026, ...), criada sob demanda.
do $$
declare
  s record;
begin
  for s in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'gestao' and c.relkind = 'S'
       and c.relname like 'seq_demanda_%'
  loop
    execute format('alter sequence gestao.%I restart with 1', s.relname);
  end loop;
end
$$;

select 'DEPOIS' as momento,
       (select count(*) from gestao.demandas)      as demandas,
       (select count(*) from gestao.tarefas)       as tarefas,
       (select count(*) from gestao.movimentacoes) as movimentacoes,
       (select count(*) from gestao.anexos)        as anexos;

commit;

-- =====================================================================
-- ALTERNATIVA NÃO DESTRUTIVA (a partir do momento em que houver dado
-- real): inativar em vez de apagar. Preserva todo o histórico, some das
-- listas e é reversível. Rode SOMENTE o bloco abaixo, sem o de cima.
-- =====================================================================
-- begin;
-- update gestao.demandas
--    set ativo = false,
--        situacao_anterior = situacao,
--        situacao = 'inativa',
--        inativado_em = now(),
--        motivo_inativacao = 'Limpeza da base de homologação.'
--  where ativo;
-- commit;
