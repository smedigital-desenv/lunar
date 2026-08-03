-- =====================================================================
-- 031_bloquear_inativacao_com_pendencias.sql
-- Corrige item 5 da revisão de fluxo: fn_inativar_usuario só marcava
-- ativo=false, sem checar se a pessoa ainda tinha demanda ou tarefa em
-- aberto sob responsabilidade dela. Servidor sai, muda de setor, entra em
-- licença — e as demandas dele ficavam apontando para alguém que não
-- loga mais: não aparecem na caixa de entrada de ninguém, somem do radar
-- operacional.
--
-- Agora a inativação é BLOQUEADA enquanto houver demanda (responsável
-- atual) ou tarefa (responsável) ativa e não concluída. A mensagem indica
-- a quantidade, para o administrador redistribuir antes (por Encaminhar,
-- na própria demanda) e tentar de novo. Não inativa nem redistribui
-- silenciosamente: quem decide para onde vai o trabalho é o administrador.
-- Sistema de Gestão de Demandas — SME Ribeirão Preto.
-- =====================================================================

set search_path = gestao, extensions, public;

create or replace function gestao.fn_inativar_usuario(p_id uuid, p_motivo text)
returns void
language plpgsql volatile security definer
set search_path = gestao, pg_temp
as $$
declare
  v_admin uuid := gestao.fn_usuario_corrente();
  v_qtd_demandas int;
  v_qtd_tarefas int;
begin
  if not gestao.fn_pode_administrar(v_admin) then
    raise exception 'Apenas administradores.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Justificativa obrigatória.' using errcode = 'check_violation';
  end if;
  if p_id = v_admin then
    raise exception 'Não é possível inativar o próprio usuário.' using errcode = 'check_violation';
  end if;

  select count(*) into v_qtd_demandas
    from gestao.demandas
   where responsavel_atual_id = p_id and ativo and situacao <> 'concluida';

  select count(*) into v_qtd_tarefas
    from gestao.tarefas
   where responsavel_id = p_id and ativo and situacao <> 'concluida';

  if v_qtd_demandas > 0 or v_qtd_tarefas > 0 then
    raise exception
      'Não é possível inativar: % demanda(s) e % tarefa(s) em aberto sob responsabilidade deste usuário. Redistribua (Encaminhar / Trocar destinatário) e tente novamente.',
      v_qtd_demandas, v_qtd_tarefas
      using errcode = 'check_violation';
  end if;

  update gestao.usuarios
     set ativo = false,
         inativado_em = now(),
         inativado_por = v_admin,
         motivo_inativacao = p_motivo
   where id = p_id and ativo;
  if not found then
    raise exception 'Usuário não encontrado ou já inativo.' using errcode = 'no_data_found';
  end if;

  insert into gestao.auditoria(usuario_id, acao, entidade, entidade_id, dados_novos)
  values (v_admin, 'inativacao', 'usuario', p_id, jsonb_build_object('motivo', p_motivo));
end;
$$;
