-- =====================================================================
-- 022_caixa_entrada.sql
-- Caixa de entrada baseada na DEMANDA (não só em subtarefa). Aparece para:
--   • quem é o responsável ATUAL da demanda (mesmo sem subtarefa), e
--   • quem tem uma SUBTAREFA ativa atribuída na demanda.
-- Uma demanda por linha. Exclui concluídas/inativas. Respeita a RLS
-- (SECURITY INVOKER). Sistema de Gestão de Demandas — SME Ribeirão Preto.
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
  v_total int;
  v_itens jsonb;
begin
  create temporary table _cx on commit drop as
    select d.id, d.numero, d.titulo, d.situacao, d.prioridade, d.sigilo, d.prazo, d.criado_em
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
            end);

  select count(*) into v_total from _cx;

  select coalesce(jsonb_agg(
           jsonb_build_object('id', id, 'numero', numero, 'titulo', titulo,
             'situacao', situacao, 'prioridade', prioridade, 'sigilo', sigilo, 'prazo', prazo)
           order by ord_prazo asc, ord_criado desc), '[]'::jsonb)
    into v_itens
  from (
    select id, numero, titulo, situacao, prioridade, sigilo, prazo,
           coalesce(prazo, 'infinity'::date) ord_prazo, criado_em ord_criado
      from _cx
     order by ord_prazo asc, ord_criado desc
     offset v_de limit greatest(p_por_pagina, 1)
  ) t;

  return jsonb_build_object('total', v_total, 'itens', v_itens);
end;
$$;

grant execute on function gestao.fn_caixa_entrada(text, int, int) to authenticated;
