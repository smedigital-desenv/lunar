-- =====================================================================
-- 025_concluir_sem_escopo_global.sql
-- Ajuste de permissão de conclusão: remove o override de ESCOPO GLOBAL
-- (gabinete, admin_ti). Esses perfis só concluem uma demanda se forem
-- responsável atual, criador ou solicitante — igual a qualquer usuário.
-- A chefia de verdade (gerente/subsecretário) continua podendo concluir
-- dentro do seu próprio ramo hierárquico, como antes.
--
-- Não dá para simplesmente remover a cláusula de escopo global e manter
-- fn_gerente_ou_superior_no_escopo: essa função (via fn_unidades_no_escopo)
-- já embute um atalho que devolve TODAS as unidades para quem tem
-- escopo_global = true, e fn_pode_administrar (admin_ti) também entra
-- nela por outra via. Por isso a checagem de nível+ramo aqui é feita à
-- parte, excluindo explicitamente quem tem escopo_global.
-- Substitui a versão de sql/021. Sistema de Gestão de Demandas — SME RP.
-- =====================================================================

set search_path = gestao, extensions, public;

create or replace function gestao.fn_concluir(
  p_demanda_id uuid,
  p_conclusao text)
returns void
language plpgsql security definer
set search_path = gestao, pg_temp
as $$
declare
  v_autor uuid := gestao.fn_usuario_corrente();
  v_nivel_gerente smallint;
  d gestao.demandas%rowtype;
begin
  if p_conclusao is null or btrim(p_conclusao) = '' then
    raise exception 'Conclusão/desfecho é obrigatório para concluir.' using errcode = 'check_violation';
  end if;

  select * into d from gestao.demandas where id = p_demanda_id and ativo;
  if not found then
    raise exception 'Demanda inexistente ou inativa.' using errcode = 'check_violation';
  end if;
  if not gestao.fn_pode_ver_demanda(p_demanda_id, v_autor) then
    raise exception 'Sem acesso à demanda.' using errcode = 'insufficient_privilege';
  end if;

  select nivel into v_nivel_gerente from gestao.perfis where codigo = 'gerente';

  -- Responsável atual, criador, solicitante ou chefia (gerente/subsecretário)
  -- dentro do próprio ramo hierárquico. Escopo global (gabinete/admin_ti)
  -- NÃO dá acesso automático: só concluem se estiverem diretamente
  -- envolvidos na demanda.
  if not (v_autor = d.responsavel_atual_id
          or v_autor = d.criado_por
          or v_autor = d.solicitante_id
          or (gestao.fn_nivel(v_autor) >= v_nivel_gerente
              and not gestao.fn_escopo_global(v_autor)
              and d.unidade_responsavel_id in (select gestao.fn_unidades_no_escopo(v_autor)))) then
    raise exception 'Apenas o responsável, o criador/solicitante ou a chefia no escopo podem concluir a demanda.'
      using errcode = 'insufficient_privilege';
  end if;

  if not gestao.fn_transicao_valida(d.situacao, 'concluida') then
    raise exception 'Não é possível concluir a partir de %.', d.situacao using errcode = 'check_violation';
  end if;

  update gestao.demandas
     set situacao_anterior = d.situacao,
         situacao = 'concluida',
         conclusao = p_conclusao,
         data_conclusao = now()
   where id = p_demanda_id;

  perform gestao.fn_registrar_movimentacao(
    p_demanda_id, null, v_autor, 'conclusao', p_conclusao, d.situacao, 'concluida');
end;
$$;
