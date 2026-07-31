-- =====================================================================
-- 009_dashboard_pesquisa.sql
-- Contadores do painel (seção 16) e busca textual (seção 17).
-- Sistema de Gestão de Demandas — SME Ribeirão Preto
--
-- IMPORTANTE: estas funções são SECURITY INVOKER (padrão) e STABLE — rodam
-- como o usuário autenticado, então TODAS as contagens e resultados já saem
-- filtrados pelo RLS. Nada é calculado no JavaScript.
-- =====================================================================

set search_path = gestao, extensions, public;

-- Índice GIN para busca nas movimentações/devolutivas (seção 17).
create index if not exists idx_mov_busca on gestao.movimentacoes
  using gin (to_tsvector('gestao.portugues_sem_acento', coalesce(texto, '')));

-- ---------------------------------------------------------------------
-- fn_dashboard — contadores e quebras, respeitando permissões (RLS).
-- "próximas do prazo" = vencendo em até 1 dia útil; "atrasadas" ignora
-- demandas com prazo suspenso por complementação (seção 7).
-- ---------------------------------------------------------------------
create or replace function gestao.fn_dashboard()
returns jsonb
language plpgsql stable
set search_path = gestao, extensions, pg_temp
as $$
declare
  v jsonb;
  v_prox date := gestao.fn_adiciona_dias_uteis(current_date, 1);
begin
  select jsonb_build_object(
    'total',          count(*),
    'abertas',        count(*) filter (where situacao = 'aberta'),
    'em_andamento',   count(*) filter (where situacao in ('em_andamento', 'reaberta')),
    'concluidas',     count(*) filter (where situacao = 'concluida'),
    'urgentes',       count(*) filter (where prioridade = 'urgente'
                        and situacao not in ('concluida', 'inativa')),
    'atrasadas',      count(*) filter (where prazo is not null and prazo < current_date
                        and situacao not in ('concluida', 'inativa') and prazo_suspenso_em is null),
    'proximas_prazo', count(*) filter (where prazo is not null
                        and prazo >= current_date and prazo <= v_prox
                        and situacao not in ('concluida', 'inativa') and prazo_suspenso_em is null)
  ) into v
  from gestao.demandas
  where ativo;

  v := v || jsonb_build_object(
    'por_prioridade', (
      select coalesce(jsonb_object_agg(prioridade, c), '{}'::jsonb)
      from (select prioridade, count(*) c from gestao.demandas where ativo group by prioridade) t),
    'por_setor', (
      select coalesce(jsonb_object_agg(coalesce(setor, '(sem setor)'), c), '{}'::jsonb)
      from (select setor, count(*) c from gestao.demandas where ativo group by setor) t),
    'por_responsavel', (
      select coalesce(jsonb_object_agg(nome, c), '{}'::jsonb)
      from (select u.nome, count(*) c
              from gestao.demandas d join gestao.usuarios u on u.id = d.responsavel_atual_id
             where d.ativo group by u.nome order by count(*) desc limit 10) t),
    'tempo_medio_dias', (
      select round(avg(extract(epoch from (data_conclusao - criado_em)) / 86400)::numeric, 1)
        from gestao.demandas where situacao = 'concluida' and data_conclusao is not null)
  );

  return v;
end;
$$;

-- ---------------------------------------------------------------------
-- fn_pesquisar_demandas — busca textual (tsvector PT) + filtros, paginada.
-- Pesquisa em número, título, objeto/queixa, processo Solar, aluno e no
-- texto das movimentações/devolutivas. Retorna { total, itens }.
-- ---------------------------------------------------------------------
create or replace function gestao.fn_pesquisar_demandas(
  p_termo text default null,
  p_situacao text default null,
  p_prioridade text default null,
  p_setor text default null,
  p_de date default null,
  p_ate date default null,
  p_pagina int default 1,
  p_por_pagina int default 10)
returns jsonb
language plpgsql stable
set search_path = gestao, extensions, pg_temp
as $$
declare
  v jsonb;
  v_query tsquery := null;
  v_de int := (greatest(p_pagina, 1) - 1) * p_por_pagina;
begin
  if p_termo is not null and btrim(p_termo) <> '' then
    v_query := websearch_to_tsquery('gestao.portugues_sem_acento', p_termo);
  end if;

  with base as (
    select d.id, d.numero, d.titulo, d.situacao, d.prioridade, d.sigilo, d.prazo, d.criado_em
      from gestao.demandas d
     where d.ativo
       and (p_situacao   is null or d.situacao = p_situacao)
       and (p_prioridade is null or d.prioridade = p_prioridade)
       and (p_setor      is null or d.setor = p_setor)
       and (p_de  is null or d.criado_em >= p_de)
       and (p_ate is null or d.criado_em < (p_ate + 1))
       and (
         v_query is null
         or to_tsvector('gestao.portugues_sem_acento',
              coalesce(d.numero, '') || ' ' || coalesce(d.titulo, '') || ' ' ||
              coalesce(d.descricao, '') || ' ' || coalesce(d.objeto_queixa, '') || ' ' ||
              coalesce(d.numero_processo_solar, '') || ' ' || coalesce(d.aluno_nome, '')
            ) @@ v_query
         or exists (select 1 from gestao.movimentacoes mo
                     where mo.demanda_id = d.id and mo.texto is not null
                       and to_tsvector('gestao.portugues_sem_acento', mo.texto) @@ v_query)
       )
  ),
  tot as (select count(*) c from base),
  pag as (select * from base order by criado_em desc offset v_de limit p_por_pagina)
  select jsonb_build_object(
    'total', (select c from tot),
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id, 'numero', numero, 'titulo', titulo, 'situacao', situacao,
        'prioridade', prioridade, 'sigilo', sigilo, 'prazo', prazo) order by criado_em desc)
      from pag), '[]'::jsonb)
  ) into v;

  return v;
end;
$$;

grant execute on function gestao.fn_dashboard() to authenticated;
grant execute on function gestao.fn_pesquisar_demandas(text, text, text, text, date, date, int, int) to authenticated;
