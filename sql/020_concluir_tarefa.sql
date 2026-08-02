-- =====================================================================
-- 020_concluir_tarefa.sql
-- "Concluir tarefa" — a contraparte de Devolver: indica que a pessoa
-- EXECUTOU a tarefa. Marca a tarefa como concluída, registra a resposta
-- (com anexos/link) e notifica quem delegou. Só o responsável atual.
-- Sistema de Gestão de Demandas — SME Ribeirão Preto.
-- =====================================================================

set search_path = gestao, extensions, public;

create or replace function gestao.fn_concluir_tarefa(
  p_tarefa_id uuid,
  p_texto text,
  p_anexos jsonb default '[]'::jsonb)
returns uuid
language plpgsql security definer
set search_path = gestao, pg_temp
as $$
declare
  v_autor uuid := gestao.fn_usuario_corrente();
  t gestao.tarefas%rowtype;
  v_mov uuid;
  v_anexo jsonb;
begin
  select * into t from gestao.tarefas where id = p_tarefa_id and ativo;
  if not found then
    raise exception 'Tarefa inexistente ou inativa.' using errcode = 'check_violation';
  end if;
  if p_texto is null or btrim(p_texto) = '' then
    raise exception 'Descreva o que foi feito (resposta/resultado).' using errcode = 'check_violation';
  end if;
  if t.responsavel_id <> v_autor then
    raise exception 'Apenas o responsável atual pode concluir a tarefa.'
      using errcode = 'insufficient_privilege';
  end if;
  if t.situacao = 'concluida' then
    raise exception 'Tarefa já concluída.' using errcode = 'check_violation';
  end if;

  update gestao.tarefas
     set situacao_anterior = situacao,
         situacao = 'concluida',
         conclusao = p_texto,
         data_conclusao = now()
   where id = p_tarefa_id;

  v_mov := gestao.fn_registrar_movimentacao(
    t.demanda_id, p_tarefa_id, v_autor, 'conclusao', p_texto,
    t.situacao, 'concluida', t.criado_por);

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
      values (t.criado_por, t.demanda_id, p_tarefa_id, 'conclusao',
              'Tarefa concluída', 'Uma tarefa que você delegou foi concluída.');
  end if;

  return v_mov;
end;
$$;

grant execute on function gestao.fn_concluir_tarefa(uuid, text, jsonb) to authenticated;
