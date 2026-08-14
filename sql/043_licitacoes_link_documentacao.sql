-- =====================================================================
-- 043_licitacoes_link_documentacao.sql
-- Licitações: link para a documentação do processo (ex.: pasta/arquivo
-- no Google Drive), informável já no pedido e editável depois (com
-- justificativa, pela equipe/admins). Pedido do usuário, 2026-08-14.
-- Sistema de Gestão de Demandas — SME Ribeirão Preto
-- =====================================================================

set search_path = gestao, extensions, public;

alter table gestao.lic_processos
  add column if not exists link_documentacao text
  check (link_documentacao is null or link_documentacao ~* '^https?://');

-- fn_lic_criar_processo ganha o parâmetro do link. DROP antes do
-- CREATE: um parâmetro a mais criaria uma SOBRECARGA, e o PostgREST
-- não resolve RPC com duas assinaturas do mesmo nome.
drop function if exists gestao.fn_lic_criar_processo(text,text,text,uuid,text,text,uuid);

create or replace function gestao.fn_lic_criar_processo(
  p_objeto text,
  p_categoria text,
  p_prioridade text default '3_normal',
  p_unidade_solicitante_id uuid default null,
  p_texto text default null,
  p_numero_processo_solar text default null,
  p_demanda_id uuid default null,
  p_link_documentacao text default null)
returns uuid
language plpgsql security definer
set search_path = gestao, pg_temp
as $$
declare
  v_autor uuid := gestao.fn_usuario_corrente();
  v_nivel_gerente smallint;
  v_unidade uuid;
  v_fase uuid;
  v_processo uuid;
begin
  select nivel into v_nivel_gerente from gestao.perfis where codigo = 'gerente';
  if not (gestao.fn_escopo_global(v_autor)
          or gestao.fn_nivel(v_autor) >= v_nivel_gerente) then
    raise exception 'Apenas gerente ou superior pode registrar novo pedido.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_objeto is null or btrim(p_objeto) = '' then
    raise exception 'Objeto é obrigatório.' using errcode = 'check_violation';
  end if;
  if p_link_documentacao is not null and btrim(p_link_documentacao) <> ''
     and p_link_documentacao !~* '^https?://' then
    raise exception 'Link da documentação deve começar com http(s)://.'
      using errcode = 'check_violation';
  end if;

  select unidade_id into v_unidade from gestao.usuarios where id = v_autor;
  if p_unidade_solicitante_id is not null
     and p_unidade_solicitante_id <> v_unidade then
    if p_unidade_solicitante_id not in
       (select gestao.fn_unidades_no_escopo(v_autor)) then
      raise exception 'Unidade solicitante fora do seu escopo.'
        using errcode = 'insufficient_privilege';
    end if;
    v_unidade := p_unidade_solicitante_id;
  end if;

  select id into v_fase from gestao.lic_fases
   where ativo and not desvio order by ordem limit 1;
  if v_fase is null then
    raise exception 'Catálogo de fases vazio.' using errcode = 'check_violation';
  end if;

  insert into gestao.lic_processos(
    objeto, categoria, prioridade, fase_id, numero_processo_solar,
    unidade_solicitante_id, demanda_id, link_documentacao, criado_por)
  values (
    p_objeto, p_categoria, coalesce(p_prioridade,'3_normal'), v_fase,
    p_numero_processo_solar, v_unidade, p_demanda_id,
    nullif(btrim(coalesce(p_link_documentacao,'')), ''), v_autor)
  returning id into v_processo;

  perform gestao.fn_lic_registrar_movimentacao(
    v_processo, v_autor, 'criacao',
    coalesce(p_texto, 'Pedido registrado.'), null, v_fase);

  return v_processo;
end;
$$;

grant execute on function gestao.fn_lic_criar_processo(text,text,text,uuid,text,text,uuid,text) to authenticated;

-- fn_lic_editar: o link entra na lista branca de campos editáveis.
create or replace function gestao.fn_lic_editar(
  p_processo_id uuid, p_campos jsonb, p_justificativa text)
returns void
language plpgsql security definer
set search_path = gestao, pg_temp
as $$
declare
  p gestao.lic_processos%rowtype := gestao.fn_lic_exigir_equipe(p_processo_id);
  v_chave text;
  v_permitidas text[] := array[
    'objeto','categoria','prioridade','numero_requisicao',
    'numero_processo_compra','numero_pregao','numero_processo_solar',
    'valor_requisicao','valor_arrematado','valor_frustrado_deserto',
    'unidade_solicitante_id','demanda_id','link_documentacao'];
begin
  perform gestao.fn_exige_justificativa(p_justificativa);
  if p_campos is null or p_campos = '{}'::jsonb then
    raise exception 'Nenhum campo a alterar.' using errcode = 'check_violation';
  end if;

  for v_chave in select jsonb_object_keys(p_campos) loop
    if not (v_chave = any(v_permitidas)) then
      raise exception 'Campo não editável: %', v_chave using errcode = 'check_violation';
    end if;
  end loop;

  update gestao.lic_processos set
    objeto     = coalesce(p_campos->>'objeto', objeto),
    categoria  = coalesce(p_campos->>'categoria', categoria),
    prioridade = coalesce(p_campos->>'prioridade', prioridade),
    numero_requisicao      = case when p_campos ? 'numero_requisicao'
      then nullif(p_campos->>'numero_requisicao','') else numero_requisicao end,
    numero_processo_compra = case when p_campos ? 'numero_processo_compra'
      then nullif(p_campos->>'numero_processo_compra','') else numero_processo_compra end,
    numero_pregao          = case when p_campos ? 'numero_pregao'
      then nullif(p_campos->>'numero_pregao','') else numero_pregao end,
    numero_processo_solar  = case when p_campos ? 'numero_processo_solar'
      then nullif(p_campos->>'numero_processo_solar','') else numero_processo_solar end,
    valor_requisicao        = case when p_campos ? 'valor_requisicao'
      then (nullif(p_campos->>'valor_requisicao',''))::numeric else valor_requisicao end,
    valor_arrematado        = case when p_campos ? 'valor_arrematado'
      then (nullif(p_campos->>'valor_arrematado',''))::numeric else valor_arrematado end,
    valor_frustrado_deserto = case when p_campos ? 'valor_frustrado_deserto'
      then (nullif(p_campos->>'valor_frustrado_deserto',''))::numeric else valor_frustrado_deserto end,
    unidade_solicitante_id = coalesce((p_campos->>'unidade_solicitante_id')::uuid,
      unidade_solicitante_id),
    demanda_id = case when p_campos ? 'demanda_id'
      then (nullif(p_campos->>'demanda_id',''))::uuid else demanda_id end,
    link_documentacao = case when p_campos ? 'link_documentacao'
      then nullif(btrim(p_campos->>'link_documentacao'),'') else link_documentacao end
  where id = p.id;

  perform gestao.fn_lic_registrar_movimentacao(
    p.id, gestao.fn_usuario_corrente(), 'edicao',
    format('Campos alterados: %s. Justificativa: %s',
      (select string_agg(k, ', ') from jsonb_object_keys(p_campos) k),
      p_justificativa));
end;
$$;
