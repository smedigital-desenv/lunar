-- =====================================================================
-- 028_responder_complementacao.sql
-- Fecha o ciclo da complementação (seção 7 do ESPEC).
--
-- fn_solicitar_complementacao já existia: devolve a responsabilidade a
-- quem agiu antes, põe a demanda em `aguardando_complementacao` e SUSPENDE
-- o prazo (prazo_suspenso_em). Faltava o outro lado: não havia função para
-- PRESTAR a complementação — quem recebia o pedido não tinha como anexar o
-- que faltava e devolver a demanda ao fluxo, e o prazo ficava suspenso
-- indefinidamente.
--
-- fn_responder_complementacao registra o texto e os anexos, retoma a
-- contagem de prazo (prazo_retomado_em) e devolve a demanda a
-- `em_andamento`, notificando quem havia solicitado.
--
-- Sistema de Gestão de Demandas — SME Ribeirão Preto.
-- =====================================================================

set search_path = gestao, extensions, public;

-- A movimentação da resposta ganha tipo próprio, para a linha do tempo
-- distinguir "pediram complementação" de "complementação prestada".
-- Remove QUALQUER check de `tipo` existente (o nome pode variar conforme
-- como a tabela foi criada; deixar a antiga viva rejeitaria o novo valor).
do $migra$
declare
  c record;
begin
  for c in
    select con.conname
      from pg_constraint con
      join pg_class cl on cl.oid = con.conrelid
      join pg_namespace ns on ns.oid = cl.relnamespace
     where ns.nspname = 'gestao' and cl.relname = 'movimentacoes'
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) like '%solicitacao_complementacao%'
  loop
    execute format('alter table gestao.movimentacoes drop constraint %I', c.conname);
  end loop;
end
$migra$;

alter table gestao.movimentacoes add constraint movimentacoes_tipo_check
  check (tipo in ('criacao','encaminhamento','subtarefa',
    'devolutiva','despacho','comentario','alteracao_situacao',
    'solicitacao_complementacao','complementacao','conclusao','reabertura',
    'edicao','retificacao','ressalva','inativacao',
    'reativacao','emissao_relatorio'));

create or replace function gestao.fn_responder_complementacao(
  p_demanda_id uuid,
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
  v_solicitante uuid;
  d gestao.demandas%rowtype;
begin
  if p_texto is null or btrim(p_texto) = '' then
    raise exception 'O texto da complementação é obrigatório.' using errcode = 'check_violation';
  end if;

  select * into d from gestao.demandas where id = p_demanda_id and ativo;
  if not found then
    raise exception 'Demanda inexistente ou inativa.' using errcode = 'check_violation';
  end if;
  if d.situacao <> 'aguardando_complementacao' then
    raise exception 'Esta demanda não está aguardando complementação.' using errcode = 'check_violation';
  end if;

  -- Quem presta a complementação é quem recebeu o pedido de volta
  -- (responsável atual); criador e solicitante também podem responder.
  if not (v_autor = d.responsavel_atual_id
          or v_autor = d.criado_por
          or v_autor = d.solicitante_id) then
    raise exception 'Apenas o responsável atual, o criador ou o solicitante podem prestar a complementação.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Retoma a contagem de prazo e devolve a demanda ao fluxo.
  update gestao.demandas
     set situacao_anterior = d.situacao,
         situacao = 'em_andamento',
         prazo_retomado_em = now()
   where id = p_demanda_id;

  v_mov := gestao.fn_registrar_movimentacao(
    p_demanda_id, null, v_autor, 'complementacao', p_texto,
    d.situacao, 'em_andamento');

  for v_anexo in select value from jsonb_array_elements(coalesce(p_anexos, '[]'::jsonb)) loop
    insert into gestao.anexos(
      demanda_id, tarefa_id, movimentacao_id, nome_original, nome_storage,
      mime, tamanho_bytes, hash_sha256, storage_path, link_externo, anexado_por)
    values (
      p_demanda_id, null, v_mov,
      v_anexo->>'nome_original',
      coalesce(v_anexo->>'nome_storage', v_anexo->>'nome_original'),
      v_anexo->>'mime', nullif(v_anexo->>'tamanho_bytes', '')::bigint,
      v_anexo->>'hash_sha256', v_anexo->>'storage_path', v_anexo->>'link_externo',
      v_autor);
  end loop;

  -- Avisa quem pediu a complementação (autor do pedido mais recente).
  select autor_id into v_solicitante
    from gestao.movimentacoes
   where demanda_id = p_demanda_id and tipo = 'solicitacao_complementacao'
   order by criado_em desc limit 1;

  if v_solicitante is not null and v_solicitante <> v_autor then
    insert into gestao.notificacoes(usuario_id, demanda_id, tipo, titulo, mensagem)
      values (v_solicitante, p_demanda_id, 'complementacao',
              'Complementação prestada', 'A complementação solicitada foi respondida.');
  end if;

  return v_mov;
end;
$$;

grant execute on function gestao.fn_responder_complementacao(uuid, text, jsonb) to authenticated;
