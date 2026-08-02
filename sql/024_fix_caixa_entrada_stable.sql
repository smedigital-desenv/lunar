-- =====================================================================
-- 024_fix_caixa_entrada_stable.sql
-- Corrige fn_caixa_entrada: a versão anterior (sql/022) usava
-- CREATE TEMPORARY TABLE ... AS SELECT dentro de uma função STABLE, o que o
-- Postgres não permite (erro 0A000 "CREATE TABLE AS is not allowed in a
-- non-volatile function"). Isso fazia a chamada falhar SEMPRE, e o front
-- caía silenciosamente para a lista de exemplo (demo), escondendo o erro.
-- Substituído por uma única consulta com count(*) over() (sem DDL).
-- Sistema de Gestão de Demandas — SME Ribeirão Preto.
-- =====================================================================

set search_path = gestao, extensions, public;

create or replace function gestao.fn_caixa_entrada(
  p_filtro text default 'todos',
  p_pagina int default 1,
  p_por_pagina int default 10)
returns jsonb
language plpgsql stable
set search_path = gestao, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_de int := (greatest(p_pagina, 1) - 1) * greatest(p_por_pagina, 1);
  v_total int := 0;
  v_itens jsonb;
begin
  select coalesce(jsonb_agg(
           jsonb_build_object('id', id, 'numero', numero, 'titulo', titulo,
             'situacao', situacao, 'prioridade', prioridade, 'sigilo', sigilo, 'prazo', prazo)
           order by ord_prazo asc, criado_em desc), '[]'::jsonb),
         coalesce(max(total_count), 0)
    into v_itens, v_total
  from (
    select d.id, d.numero, d.titulo, d.situacao, d.prioridade, d.sigilo, d.prazo, d.criado_em,
           coalesce(d.prazo, 'infinity'::date) ord_prazo,
           count(*) over() as total_count
      from gestao.demandas d
     where d.ativo and d.situacao <> 'concluida'
       and (
         d.responsavel_atual_id = v_uid
         or exists (select 1 from gestao.tarefas t
                     where t.demanda_id = d.id and t.ativo
                       and t.responsavel_id = v_uid and t.situacao <> 'concluida')
       )
       and (case p_filtro
              when 'pendentes'    then d.situacao in ('aberta', 'aguardando_complementacao', 'devolvida')
              when 'em_andamento' then d.situacao in ('em_andamento', 'reaberta')
              when 'urgentes'     then d.prioridade = 'urgente'
              when 'encerrados'   then false   -- concluídas não ficam na entrada
              else true
            end)
     order by ord_prazo asc, criado_em desc
     offset v_de limit greatest(p_por_pagina, 1)
  ) t;

  return jsonb_build_object('total', v_total, 'itens', v_itens);
end;
$$;

grant execute on function gestao.fn_caixa_entrada(text, int, int) to authenticated;
