-- =====================================================================
-- 027_fix_listar_kpi_stable.sql
-- Mesmo defeito corrigido em sql/024 para a caixa de entrada, agora no
-- drill-down dos KPIs do painel: fn_listar_por_kpi é STABLE mas usava
-- CREATE TEMPORARY TABLE ... AS SELECT, o que o Postgres proíbe em função
-- não-volátil (erro 0A000). A chamada falhava sempre com 400 Bad Request
-- ao clicar num KPI. Substituído por uma única consulta com
-- count(*) over() (sem DDL).
-- Sistema de Gestão de Demandas — SME Ribeirão Preto.
-- =====================================================================

set search_path = gestao, extensions, public;

create or replace function gestao.fn_listar_por_kpi(
  p_kpi text,
  p_pagina int default 1,
  p_por_pagina int default 20)
returns jsonb
language plpgsql stable
set search_path = gestao, extensions, pg_temp
as $$
declare
  v_prox date := gestao.fn_adiciona_dias_uteis(current_date, 1);
  v_de int := (greatest(p_pagina, 1) - 1) * greatest(p_por_pagina, 1);
  v_total int := 0;
  v_itens jsonb;
begin
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id', id, 'numero', numero, 'titulo', titulo,
             'situacao', situacao, 'prioridade', prioridade,
             'sigilo', sigilo, 'prazo', prazo)
           order by ord_prazo asc, criado_em desc), '[]'::jsonb),
         coalesce(max(total_count), 0)
    into v_itens, v_total
  from (
    select d.id, d.numero, d.titulo, d.situacao, d.prioridade, d.sigilo,
           d.prazo, d.criado_em,
           coalesce(d.prazo, 'infinity'::date) ord_prazo,
           count(*) over() as total_count
      from gestao.demandas d
     where d.ativo and (
       case p_kpi
         when 'todos'          then true
         when 'abertas'        then d.situacao = 'aberta'
         when 'em_andamento'   then d.situacao in ('em_andamento', 'reaberta')
         when 'concluidas'     then d.situacao = 'concluida'
         when 'urgentes'       then d.prioridade = 'urgente'
                                    and d.situacao not in ('concluida', 'inativa')
         when 'atrasadas'      then d.prazo is not null and d.prazo < current_date
                                    and d.situacao not in ('concluida', 'inativa')
                                    and d.prazo_suspenso_em is null
         when 'proximas_prazo' then d.prazo is not null
                                    and d.prazo >= current_date and d.prazo <= v_prox
                                    and d.situacao not in ('concluida', 'inativa')
                                    and d.prazo_suspenso_em is null
         else false
       end)
     order by ord_prazo asc, d.criado_em desc
     offset v_de limit greatest(p_por_pagina, 1)
  ) t;

  return jsonb_build_object('total', v_total, 'itens', v_itens);
end;
$$;

grant execute on function gestao.fn_listar_por_kpi(text, int, int) to authenticated;
