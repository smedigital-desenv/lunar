-- =====================================================================
-- 045_listar_por_unidade.sql
-- Filtro por secretaria/unidade na lista de demandas.
--
-- Pedido do usuário (2026-08-21): quem é gabinete vê tudo e precisa
-- separar o que é de cada subsecretaria. `fn_listar_por_kpi` não
-- devolvia a unidade da demanda nem aceitava recorte por unidade, então
-- não havia como filtrar no front.
--
-- ⚠️ Isto NÃO amplia o que ninguém enxerga: a função é SECURITY INVOKER
-- e a RLS continua decidindo. O parâmetro só ESTREITA o resultado —
-- escolher uma subsecretaria fora do escopo devolve lista vazia, nunca
-- dados a mais (regra 4: controle de acesso é RLS).
-- Sistema de Gestão de Demandas — SME Ribeirão Preto
-- =====================================================================

set search_path = gestao, extensions, public;

-- Unidade + toda a sua descendência. A recursão é sobre `parent_id`,
-- como manda a regra 5 — nada de lista fixa de siglas. Existia recursão
-- equivalente presa dentro de fn_unidades_no_escopo (por usuário) e da
-- RLS; aqui ela vira reutilizável para uma unidade qualquer.
create or replace function gestao.fn_unidades_descendentes(p_unidade uuid)
returns setof uuid
language sql stable
set search_path = gestao, pg_temp
as $$
  with recursive arvore as (
    select id from gestao.unidades_organizacionais where id = p_unidade
    union all
    select u.id
      from gestao.unidades_organizacionais u
      join arvore a on u.parent_id = a.id
  )
  select id from arvore;
$$;

grant execute on function gestao.fn_unidades_descendentes(uuid) to authenticated;

-- fn_listar_por_kpi ganha o recorte por unidade e passa a devolver a
-- unidade responsável de cada demanda (o front resolve a secretaria
-- subindo a árvore que já carrega).
--
-- ⚠️ Esta versão parte do sql/027, NÃO do 016: o 016 usava
-- CREATE TEMPORARY TABLE dentro de função STABLE, o que o Postgres
-- proíbe (0A000) e fazia todo clique em KPI dar 400. O 027 trocou por
-- uma consulta única com count(*) over(). Reescrever a partir do 016
-- ressuscitaria o defeito — foi o que o teste local pegou.
--
-- DROP antes do CREATE: parâmetro a mais criaria sobrecarga e o
-- PostgREST não resolve (lição do 043/044).
drop function if exists gestao.fn_listar_por_kpi(text, int, int);

create or replace function gestao.fn_listar_por_kpi(
  p_kpi text,
  p_pagina int default 1,
  p_por_pagina int default 20,
  p_unidade_id uuid default null)
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
             'sigilo', sigilo, 'prazo', prazo,
             'unidade_id', unidade_responsavel_id,
             'unidade_sigla', unidade_sigla,
             'unidade_nome', unidade_nome)
           order by ord_prazo asc, criado_em desc), '[]'::jsonb),
         coalesce(max(total_count), 0)
    into v_itens, v_total
  from (
    select d.id, d.numero, d.titulo, d.situacao, d.prioridade, d.sigilo,
           d.prazo, d.criado_em, d.unidade_responsavel_id,
           u.sigla as unidade_sigla, u.nome as unidade_nome,
           coalesce(d.prazo, 'infinity'::date) ord_prazo,
           count(*) over() as total_count
      from gestao.demandas d
      join gestao.unidades_organizacionais u
        on u.id = d.unidade_responsavel_id
     where d.ativo
       -- null = sem recorte; com valor, restringe à subárvore da unidade.
       and (p_unidade_id is null
            or d.unidade_responsavel_id in
               (select gestao.fn_unidades_descendentes(p_unidade_id)))
       and (
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

grant execute on function gestao.fn_listar_por_kpi(text, int, int, uuid) to authenticated;
