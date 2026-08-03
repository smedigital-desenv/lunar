-- =====================================================================
-- 030_caixa_saida.sql
-- Corrige a Caixa de saída (item 4 da revisão de fluxo): ela só mostrava
-- demandas CRIADAS pelo usuário (criado_por). Uma demanda recebida e
-- encaminhada adiante não aparecia — quem encaminha ficava sem lista de
-- acompanhamento, exatamente quem mais precisa cobrar andamento.
--
-- Agora inclui também as demandas em que o usuário registrou algum
-- encaminhamento (autor de uma movimentação tipo 'encaminhamento'), ainda
-- que hoje não seja mais o criador nem o responsável. SECURITY INVOKER:
-- respeita a RLS do usuário, mesmo padrão de fn_caixa_entrada (sql/022).
-- Sistema de Gestão de Demandas — SME Ribeirão Preto.
-- =====================================================================

set search_path = gestao, extensions, public;

create or replace function gestao.fn_caixa_saida(
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
           order by criado_em desc), '[]'::jsonb),
         coalesce(max(total_count), 0)
    into v_itens, v_total
  from (
    select d.id, d.numero, d.titulo, d.situacao, d.prioridade, d.sigilo,
           d.prazo, d.criado_em,
           count(*) over() as total_count
      from gestao.demandas d
     where d.ativo
       and (
         d.criado_por = v_uid
         or exists (select 1 from gestao.movimentacoes m
                     where m.demanda_id = d.id and m.tipo = 'encaminhamento'
                       and m.autor_id = v_uid)
       )
       and (case p_filtro
              when 'pendentes'    then d.situacao in ('aberta', 'aguardando_complementacao', 'devolvida')
              when 'em_andamento' then d.situacao in ('em_andamento', 'reaberta')
              when 'urgentes'     then d.prioridade = 'urgente'
              when 'encerrados'   then d.situacao = 'concluida'
              else true
            end)
     order by criado_em desc
     offset v_de limit greatest(p_por_pagina, 1)
  ) t;

  return jsonb_build_object('total', v_total, 'itens', v_itens);
end;
$$;

grant execute on function gestao.fn_caixa_saida(text, int, int) to authenticated;
