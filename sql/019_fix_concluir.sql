-- =====================================================================
-- 019_fix_concluir.sql
-- Conclusão de demanda: restringe quem pode concluir ao RESPONSÁVEL ATUAL
-- ou à CHEFIA (gerente+ no escopo, ou gabinete/escopo global). A conclusão
-- com subtarefas em aberto continua PERMITIDA (o aviso é dado na interface).
-- Sistema de Gestão de Demandas — SME Ribeirão Preto.
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

  -- Só o responsável atual ou a chefia (gerente+ no escopo / gabinete).
  if not (v_autor = d.responsavel_atual_id
          or gestao.fn_gerente_ou_superior_no_escopo(v_autor, d.unidade_responsavel_id)
          or gestao.fn_escopo_global(v_autor)) then
    raise exception 'Apenas o responsável atual ou a chefia podem concluir a demanda.'
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
