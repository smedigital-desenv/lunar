-- =====================================================================
-- 001_extensoes.sql
-- Schema da aplicação, extensões e configuração de fuso/pesquisa.
-- Sistema de Gestão de Demandas — SME Ribeirão Preto
--
-- Rodar como primeiro script. Idempotente (IF NOT EXISTS).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Schema próprio da aplicação.
-- Todas as tabelas, funções e views ficam em `gestao`, isolando o app
-- dos objetos internos do Supabase (schemas auth, storage, public, ...).
--
-- IMPORTANTE (passo manual no painel Supabase):
--   Settings → API → Exposed schemas: adicionar `gestao`.
--   Sem isso o supabase-js não enxerga as tabelas nem as funções RPC.
-- ---------------------------------------------------------------------
create schema if not exists gestao;

-- Papéis do PostgREST/Supabase precisam de USAGE no schema para que a
-- API o exponha. As permissões finas (SELECT/EXECUTE) vêm com o RLS e
-- os grants específicos nos scripts seguintes; aqui liberamos só o USAGE.
grant usage on schema gestao to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- Extensões (mantidas no schema `extensions`, padrão do Supabase).
-- ---------------------------------------------------------------------

-- pgcrypto: gen_random_uuid() para PKs e digest()/SHA-256 para hash de
-- anexos e de relatórios emitidos (seções 13 e 14 da ESPEC).
create extension if not exists pgcrypto with schema extensions;

-- unaccent: normalização de nomes de arquivo no storage (sem acentos) e
-- base para a busca textual insensível a acento (seções 13 e 17).
create extension if not exists unaccent with schema extensions;

-- pg_trgm: apoio à busca por similaridade em números de processo e títulos.
create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------
-- Configuração de busca textual em português, insensível a acento.
-- Fica dentro do schema `gestao` e é usada pelos índices tsvector das
-- demandas (seção 17).
--
-- O dicionário `unaccent` pode estar em `extensions` ou `public`,
-- dependendo de como a extensão foi instalada no projeto. Por isso
-- descobrimos o schema em tempo de execução e montamos o ALTER dinâmico.
-- ---------------------------------------------------------------------
do $$
declare
  v_schema_dict text;
begin
  if exists (
    select 1
      from pg_ts_config c
      join pg_namespace n on n.oid = c.cfgnamespace
     where c.cfgname = 'portugues_sem_acento'
       and n.nspname = 'gestao'
  ) then
    return;
  end if;

  select n.nspname
    into v_schema_dict
    from pg_ts_dict d
    join pg_namespace n on n.oid = d.dictnamespace
   where d.dictname = 'unaccent'
   limit 1;

  if v_schema_dict is null then
    raise exception
      'Dicionário unaccent não encontrado. Instale a extensão unaccent antes.';
  end if;

  create text search configuration gestao.portugues_sem_acento
    ( copy = pg_catalog.portuguese );

  execute format(
    'alter text search configuration gestao.portugues_sem_acento
       alter mapping for hword, hword_part, word
       with %I.unaccent, portuguese_stem',
    v_schema_dict);
end
$$;

-- ---------------------------------------------------------------------
-- Fuso horário padrão: America/Sao_Paulo.
-- Timestamps são gravados em timestamptz; exibição e cálculo de prazo
-- ocorrem neste fuso (regra 8 do CLAUDE.md, seção 2 da ESPEC).
-- ---------------------------------------------------------------------
-- Passo manual (executar com privilégio, fora deste script):
--   alter database postgres set timezone to 'America/Sao_Paulo';

-- Garante o fuso na sessão corrente de execução dos scripts seguintes.
set timezone to 'America/Sao_Paulo';
