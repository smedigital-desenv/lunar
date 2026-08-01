-- =====================================================================
-- 011_relatorios.sql
-- Funções (RPC) de suporte aos relatórios do processo (Solar).
-- Sistema de Gestão de Demandas — SME Ribeirão Preto — Sessão 10 (seção 14).
--
-- A geração do PDF fica na Edge Function (Deno). Aqui ficam:
--  - fn_dados_relatorio: reúne os dados (com checagem de acesso e
--    anonimização opcional) para a Edge Function montar o documento;
--  - fn_emitir_relatorio: grava a linha em relatorios_emitidos E a
--    movimentação `emissao_relatorio` na MESMA transação (seção 14);
--  - fn_validar_relatorio: rota pública de validação por código.
--
-- Grants no fim do arquivo.
-- =====================================================================

set search_path = gestao, extensions, public;

-- ---------------------------------------------------------------------
-- fn_dados_relatorio — JSON com tudo que os dois documentos precisam.
-- Checa acesso via fn_pode_ver_demanda (RLS-equivalente). Se p_anonimizado,
-- oculta nome de aluno e de pessoas com vínculo aluno/responsável (seção 14).
-- Anexos ativos: exclui os inativados (última auditoria não é 'inativacao').
-- ---------------------------------------------------------------------
create or replace function gestao.fn_dados_relatorio(
  p_demanda_id uuid,
  p_anonimizado boolean default false)
returns jsonb
language plpgsql stable security definer
set search_path = gestao, pg_temp
as $$
declare
  v_usuario uuid := gestao.fn_usuario_corrente();
  v_anon boolean := coalesce(p_anonimizado, false);
  v_resultado jsonb;
begin
  if not gestao.fn_pode_ver_demanda(p_demanda_id, v_usuario) then
    raise exception 'Sem acesso a esta demanda.' using errcode = 'insufficient_privilege';
  end if;

  select jsonb_build_object(
    'demanda', jsonb_build_object(
      'numero', d.numero,
      'titulo', d.titulo,
      'objeto_queixa', d.objeto_queixa,
      'descricao', d.descricao,
      'categoria', d.categoria,
      'setor', d.setor,
      'prioridade', d.prioridade,
      'situacao', d.situacao,
      'sigilo', d.sigilo,
      'prazo', d.prazo,
      'data_conclusao', d.data_conclusao,
      'conclusao', d.conclusao,
      'aluno_nome', case when v_anon then null else d.aluno_nome end,
      'numero_processo_solar', d.numero_processo_solar,
      'criado_em', d.criado_em,
      'tipo', td.nome,
      'escola', esc.nome,
      'solicitante', sol.nome,
      'responsavel_atual', resp.nome,
      'unidade_responsavel', uni.nome,
      'unidade_sigla', uni.sigla
    ),
    'pessoas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'nome', case when v_anon and pe.vinculo in ('aluno','responsavel')
                     then '[anonimizado]' else pe.nome end,
        'vinculo', pe.vinculo,
        'observacao', pe.observacao) order by pe.criado_em)
      from gestao.pessoas_envolvidas pe
      where pe.demanda_id = d.id and pe.ativo), '[]'::jsonb),
    'movimentacoes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'tipo', m.tipo,
        'texto', m.texto,
        'situacao_nova', m.situacao_nova,
        'criado_em', m.criado_em,
        'autor', au.nome,
        'destinatario', de.nome) order by m.criado_em)
      from gestao.movimentacoes m
      join gestao.usuarios au on au.id = m.autor_id
      left join gestao.usuarios de on de.id = m.destinatario_id
      where m.demanda_id = d.id), '[]'::jsonb),
    'anexos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'nome_original', a.nome_original,
        'mime', a.mime,
        'tamanho_bytes', a.tamanho_bytes,
        'hash_sha256', a.hash_sha256,
        'anexado_por', an.nome,
        'criado_em', a.criado_em) order by a.criado_em)
      from gestao.anexos a
      join gestao.usuarios an on an.id = a.anexado_por
      where a.demanda_id = d.id
        and coalesce((
          select ad.acao from gestao.auditoria ad
          where ad.entidade = 'anexo' and ad.entidade_id = a.id
            and ad.acao in ('inativacao','reativacao')
          order by ad.criado_em desc limit 1), 'ativo') <> 'inativacao'), '[]'::jsonb)
  )
  into v_resultado
  from gestao.demandas d
  left join gestao.tipos_demanda td on td.id = d.tipo_id
  left join gestao.escolas esc on esc.id = d.escola_id
  join gestao.usuarios sol on sol.id = d.solicitante_id
  join gestao.usuarios resp on resp.id = d.responsavel_atual_id
  join gestao.unidades_organizacionais uni on uni.id = d.unidade_responsavel_id
  where d.id = p_demanda_id;

  if v_resultado is null then
    raise exception 'Demanda não encontrada.' using errcode = 'no_data_found';
  end if;
  return v_resultado;
end;
$$;

-- ---------------------------------------------------------------------
-- fn_emitir_relatorio — registra a emissão (hash e código gerados pela
-- Edge Function) e grava a movimentação `emissao_relatorio`. Retorna o id.
-- ---------------------------------------------------------------------
create or replace function gestao.fn_emitir_relatorio(
  p_demanda_id uuid,
  p_tipo text,
  p_anonimizado boolean,
  p_hash text,
  p_codigo text,
  p_caminho text default null)
returns uuid
language plpgsql volatile security definer
set search_path = gestao, pg_temp
as $$
declare
  v_usuario uuid := gestao.fn_usuario_corrente();
  v_id uuid;
begin
  if p_tipo not in ('resumo','inteiro_teor') then
    raise exception 'Tipo de relatório inválido: %.', p_tipo using errcode = 'check_violation';
  end if;
  if not gestao.fn_pode_ver_demanda(p_demanda_id, v_usuario) then
    raise exception 'Sem acesso a esta demanda.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_hash), '') = '' or coalesce(trim(p_codigo), '') = '' then
    raise exception 'Hash e código de verificação são obrigatórios.' using errcode = 'check_violation';
  end if;

  insert into gestao.relatorios_emitidos(
    demanda_id, tipo, anonimizado, hash_sha256, codigo_verificacao,
    caminho_storage, emitido_por)
  values (
    p_demanda_id, p_tipo, coalesce(p_anonimizado, false), p_hash, p_codigo,
    p_caminho, v_usuario)
  returning id into v_id;

  perform gestao.fn_registrar_movimentacao(
    p_demanda_id, null, v_usuario, 'emissao_relatorio',
    format('Emissão de %s%s. Código de verificação: %s.',
      case p_tipo when 'resumo' then 'relatório-resumo' else 'inteiro teor' end,
      case when coalesce(p_anonimizado, false) then ' (versão anonimizada)' else '' end,
      p_codigo));

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- fn_validar_relatorio — rota PÚBLICA: dado o código, confirma se o
-- documento foi realmente emitido e devolve metadados mínimos + hash
-- (para o validador conferir contra o PDF em mãos). Não expõe conteúdo.
-- ---------------------------------------------------------------------
create or replace function gestao.fn_validar_relatorio(p_codigo text)
returns jsonb
language plpgsql stable security definer
set search_path = gestao, pg_temp
as $$
declare
  v jsonb;
begin
  select jsonb_build_object(
    'valido', true,
    'demanda_numero', d.numero,
    'tipo', r.tipo,
    'anonimizado', r.anonimizado,
    'hash_sha256', r.hash_sha256,
    'emitido_em', r.criado_em,
    'emitido_por', u.nome)
  into v
  from gestao.relatorios_emitidos r
  join gestao.demandas d on d.id = r.demanda_id
  join gestao.usuarios u on u.id = r.emitido_por
  where r.codigo_verificacao = p_codigo;

  return coalesce(v, jsonb_build_object('valido', false));
end;
$$;

-- ---------------------------------------------------------------------
-- Grants. Validação é pública (anon); as demais exigem sessão.
-- ---------------------------------------------------------------------
grant execute on function gestao.fn_dados_relatorio(uuid, boolean) to authenticated;
grant execute on function gestao.fn_emitir_relatorio(uuid, text, boolean, text, text, text) to authenticated;
grant execute on function gestao.fn_validar_relatorio(text) to anon, authenticated;
