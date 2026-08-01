-- =====================================================================
-- 010_notificacoes.sql
-- Funções (RPC) de marcação de leitura de notificações.
-- Sistema de Gestão de Demandas — SME Ribeirão Preto — Sessão 9 (seção 15).
--
-- A tabela gestao.notificacoes tem apenas policy de SELECT (o front lê as
-- próprias via RLS). Marcar como lida é ESCRITA e, pela regra 2, não pode
-- vir direta do front: passa por estas funções SECURITY DEFINER, que só
-- alteram notificações do próprio usuário corrente.
--
-- Não é tramitação: não gera movimentação nem exige justificativa.
-- Grants de EXECUTE a `authenticated` no fim do arquivo.
-- =====================================================================

set search_path = gestao, extensions, public;

-- ---------------------------------------------------------------------
-- fn_marcar_notificacao_lida — marca UMA notificação como lida.
-- Idempotente: se já estava lida (ou não pertence ao usuário), não faz nada.
-- ---------------------------------------------------------------------
create or replace function gestao.fn_marcar_notificacao_lida(p_id uuid)
returns void
language plpgsql volatile security definer
set search_path = gestao, pg_temp
as $$
declare
  v_usuario uuid := gestao.fn_usuario_corrente();
begin
  update gestao.notificacoes
     set lida = true,
         lida_em = now()
   where id = p_id
     and usuario_id = v_usuario
     and not lida;
end;
$$;

-- ---------------------------------------------------------------------
-- fn_marcar_todas_notificacoes_lidas — marca todas as não lidas do
-- usuário corrente. Retorna a quantidade marcada.
-- ---------------------------------------------------------------------
create or replace function gestao.fn_marcar_todas_notificacoes_lidas()
returns integer
language plpgsql volatile security definer
set search_path = gestao, pg_temp
as $$
declare
  v_usuario uuid := gestao.fn_usuario_corrente();
  v_qtd integer;
begin
  update gestao.notificacoes
     set lida = true,
         lida_em = now()
   where usuario_id = v_usuario
     and not lida;
  get diagnostics v_qtd = row_count;
  return v_qtd;
end;
$$;

-- ---------------------------------------------------------------------
-- Grants (apenas EXECUTE; a tabela continua sem UPDATE ao front).
-- ---------------------------------------------------------------------
grant execute on function gestao.fn_marcar_notificacao_lida(uuid) to authenticated;
grant execute on function gestao.fn_marcar_todas_notificacoes_lidas() to authenticated;
