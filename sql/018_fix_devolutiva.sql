-- =====================================================================
-- 018_fix_devolutiva.sql
-- Correção: ao registrar devolutiva, a responsabilidade deve VOLTAR a quem
-- delegou (criador da tarefa). Antes, a tarefa só mudava para 'devolvida' e
-- continuava com o mesmo responsável — então ficava na Caixa de entrada dele.
-- Sistema de Gestão de Demandas — SME Ribeirão Preto.
-- =====================================================================

set search_path = gestao, extensions, public;

create or replace function gestao.fn_registrar_devolutiva(
  p_tarefa_id uuid,
  p_texto text,
  p_anexos jsonb default '[]'::jsonb)
returns uuid
language plpgsql security definer
set search_path = gestao, pg_temp
as $$
declare
  v_autor uuid := gestao.fn_usuario_corrente();
  v_mov uuid;
  v_anexo jsonb;
  t gestao.tarefas%rowtype;
  v_unidade_delegador uuid;
begin
  select * into t from gestao.tarefas where id = p_tarefa_id and ativo;
  if not found then
    raise exception 'Tarefa inexistente ou inativa.' using errcode = 'check_violation';
  end if;
  if p_texto is null or btrim(p_texto) = '' then
    raise exception 'Texto da devolutiva é obrigatório.' using errcode = 'check_violation';
  end if;

  -- Devolve a responsabilidade a quem delegou (criador da tarefa), movendo a
  -- tarefa para a unidade dele. Assim ela sai da Entrada de quem devolveu.
  select unidade_id into v_unidade_delegador
    from gestao.usuarios where id = t.criado_por and ativo;

  update gestao.tarefas
     set situacao = 'devolvida',
         responsavel_id = t.criado_por,
         unidade_responsavel_id = coalesce(v_unidade_delegador, unidade_responsavel_id)
   where id = p_tarefa_id;

  v_mov := gestao.fn_registrar_movimentacao(
    t.demanda_id, p_tarefa_id, v_autor, 'devolutiva', p_texto,
    null, null, t.criado_por);

  for v_anexo in select value from jsonb_array_elements(coalesce(p_anexos, '[]'::jsonb)) loop
    insert into gestao.anexos(
      demanda_id, tarefa_id, movimentacao_id, nome_original, nome_storage,
      mime, tamanho_bytes, hash_sha256, storage_path, link_externo, anexado_por)
    values (
      t.demanda_id, p_tarefa_id, v_mov,
      v_anexo->>'nome_original',
      coalesce(v_anexo->>'nome_storage', v_anexo->>'nome_original'),
      v_anexo->>'mime', nullif(v_anexo->>'tamanho_bytes', '')::bigint,
      v_anexo->>'hash_sha256', v_anexo->>'storage_path', v_anexo->>'link_externo',
      v_autor);
  end loop;

  if t.criado_por <> v_autor then
    insert into gestao.notificacoes(usuario_id, demanda_id, tarefa_id, tipo, titulo, mensagem)
      values (t.criado_por, t.demanda_id, p_tarefa_id, 'devolutiva',
              'Devolutiva recebida', 'Uma tarefa que você delegou foi devolvida.');
  end if;

  return v_mov;
end;
$$;
