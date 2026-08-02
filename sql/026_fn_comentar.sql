-- =====================================================================
-- 026_fn_comentar.sql
-- fn_criar_comentario — registra um comentário livre (informação, nota,
-- observação) na demanda ou numa tarefa específica, sem alterar situação
-- nem responsável. Preenche a lacuna apontada em docs/ESTADO.md: até
-- agora só existiam ações de tramitação (encaminhar, subtarefa,
-- devolutiva, complementação, concluir) — não havia como só anotar algo.
-- Sistema de Gestão de Demandas — SME Ribeirão Preto.
-- =====================================================================

set search_path = gestao, extensions, public;

create or replace function gestao.fn_criar_comentario(
  p_demanda_id uuid,
  p_texto text,
  p_tarefa_id uuid default null)
returns uuid
language plpgsql security definer
set search_path = gestao, pg_temp
as $$
declare
  v_autor uuid := gestao.fn_usuario_corrente();
  v_comentario uuid;
  d gestao.demandas%rowtype;
begin
  if p_texto is null or btrim(p_texto) = '' then
    raise exception 'Texto do comentário é obrigatório.' using errcode = 'check_violation';
  end if;

  select * into d from gestao.demandas where id = p_demanda_id and ativo;
  if not found then
    raise exception 'Demanda inexistente ou inativa.' using errcode = 'check_violation';
  end if;

  if p_tarefa_id is not null then
    if not gestao.fn_pode_ver_tarefa(p_tarefa_id, v_autor) then
      raise exception 'Sem acesso à tarefa.' using errcode = 'insufficient_privilege';
    end if;
  else
    if not gestao.fn_pode_ver_demanda(p_demanda_id, v_autor) then
      raise exception 'Sem acesso à demanda.' using errcode = 'insufficient_privilege';
    end if;
  end if;

  insert into gestao.comentarios(demanda_id, tarefa_id, autor_id, texto)
    values (p_demanda_id, p_tarefa_id, v_autor, p_texto)
    returning id into v_comentario;

  perform gestao.fn_registrar_movimentacao(
    p_demanda_id, p_tarefa_id, v_autor, 'comentario', p_texto, null, null);

  return v_comentario;
end;
$$;

grant execute on function gestao.fn_criar_comentario(uuid, text, uuid) to authenticated;
