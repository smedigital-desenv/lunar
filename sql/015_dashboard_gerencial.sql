-- =====================================================================
-- 015_dashboard_gerencial.sql
-- Métricas gerenciais adicionais para os gráficos do painel (Sessão 8+).
-- Sistema de Gestão de Demandas — SME Ribeirão Preto.
--
-- SECURITY INVOKER (sem `security definer`): as contagens respeitam a RLS
-- do usuário, como fn_dashboard. Complementa (não substitui) fn_dashboard.
-- Fuso America/Sao_Paulo para agrupar por mês (regra 8).
-- =====================================================================

set search_path = gestao, extensions, public;

create or replace function gestao.fn_dashboard_gerencial()
returns jsonb
language plpgsql stable
set search_path = gestao, extensions, pg_temp
as $$
declare
  v jsonb;
begin
  select jsonb_build_object(
    -- Distribuição por situação (todas as situações ativas).
    'por_situacao', (
      select coalesce(jsonb_object_agg(situacao, c), '{}'::jsonb)
      from (select situacao, count(*) c
              from gestao.demandas where ativo group by situacao) t),

    -- Por unidade responsável (top 12 por volume; sigla quando houver).
    'por_unidade', (
      select coalesce(jsonb_object_agg(rot, c), '{}'::jsonb)
      from (select coalesce(u.sigla, u.nome) rot, count(*) c
              from gestao.demandas d
              join gestao.unidades_organizacionais u on u.id = d.unidade_responsavel_id
             where d.ativo
             group by coalesce(u.sigla, u.nome)
             order by count(*) desc limit 12) t),

    -- Por tipo de demanda.
    'por_tipo', (
      select coalesce(jsonb_object_agg(rot, c), '{}'::jsonb)
      from (select coalesce(td.nome, '(sem tipo)') rot, count(*) c
              from gestao.demandas d
              left join gestao.tipos_demanda td on td.id = d.tipo_id
             where d.ativo
             group by coalesce(td.nome, '(sem tipo)')) t),

    -- Evolução dos últimos 6 meses: criadas x concluídas por mês.
    'evolucao_mensal', (
      select coalesce(jsonb_agg(
               jsonb_build_object('mes', to_char(gs.m, 'YYYY-MM'),
                                  'criadas', cr, 'concluidas', co)
               order by gs.m), '[]'::jsonb)
      from generate_series(
             date_trunc('month', current_date - interval '5 months'),
             date_trunc('month', current_date),
             interval '1 month') gs(m)
      cross join lateral (
        select
          (select count(*) from gestao.demandas d
            where d.ativo
              and date_trunc('month', d.criado_em at time zone 'America/Sao_Paulo') = gs.m) cr,
          (select count(*) from gestao.demandas d
            where d.ativo and d.data_conclusao is not null
              and date_trunc('month', d.data_conclusao at time zone 'America/Sao_Paulo') = gs.m) co
      ) x)
  ) into v;

  return v;
end;
$$;

grant execute on function gestao.fn_dashboard_gerencial() to authenticated;
