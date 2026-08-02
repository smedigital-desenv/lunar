-- =====================================================================
-- 016_listar_kpi.sql
-- Lista as demandas de um KPI do painel (drill-down ao clicar no número).
-- Sistema de Gestão de Demandas — SME Ribeirão Preto.
--
-- Os predicados espelham EXATAMENTE os de fn_dashboard (seção 16), para a
-- lista bater com o contador. SECURITY INVOKER: respeita a RLS do usuário.
-- Retorna { total, itens:[{id,numero,titulo,situacao,prioridade,sigilo,prazo}] }.
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
  v_total int;
  v_itens jsonb;
begin
  create temporary table _base on commit drop as
    select d.id, d.numero, d.titulo, d.situacao, d.prioridade, d.sigilo,
           d.prazo, d.criado_em
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
       end);

  select count(*) into v_total from _base;

  select coalesce(jsonb_agg(j order by ord_prazo asc, ord_criado desc), '[]'::jsonb)
    into v_itens
  from (
    select jsonb_build_object(
             'id', id, 'numero', numero, 'titulo', titulo,
             'situacao', situacao, 'prioridade', prioridade,
             'sigilo', sigilo, 'prazo', prazo) j,
           coalesce(prazo, 'infinity'::date) ord_prazo, criado_em ord_criado
      from _base
     order by ord_prazo asc, ord_criado desc
     offset v_de limit greatest(p_por_pagina, 1)
  ) t;

  return jsonb_build_object('total', v_total, 'itens', v_itens);
end;
$$;

grant execute on function gestao.fn_listar_por_kpi(text, int, int) to authenticated;
