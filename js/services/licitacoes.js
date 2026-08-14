// =====================================================================
// licitacoes.js — serviço do módulo de Licitações (wrappers finos).
// Nenhuma regra de negócio aqui: tudo é validado no banco (sql/041).
// Espec: docs/ESPEC-LICITACOES.md.
// =====================================================================

import { supabase, rpc, aguardarSessao } from './supabaseClient.js';

// ---------------------------------------------------------------------
// Catálogos (RLS: legíveis por qualquer autenticado).
// ---------------------------------------------------------------------
export async function listarFases() {
  await aguardarSessao();
  const { data, error } = await supabase
    .from('lic_fases').select('*').eq('ativo', true).order('ordem');
  if (error) throw error;
  return data ?? [];
}

export async function listarLocais() {
  await aguardarSessao();
  const { data, error } = await supabase
    .from('lic_locais').select('*').eq('ativo', true).order('sigla');
  if (error) throw error;
  return data ?? [];
}

// Feriados ativos — para contar dias úteis no alerta de "parado".
export async function listarFeriados() {
  await aguardarSessao();
  const { data, error } = await supabase
    .from('feriados').select('data').eq('ativo', true);
  if (error) throw error;
  return (data ?? []).map(f => f.data);
}

// ---------------------------------------------------------------------
// Listagem de processos (RLS decide a visibilidade — regra B+C).
// Embute fase, local, unidade solicitante e a data da última movimentação
// (para o alerta de parado por fase).
// ---------------------------------------------------------------------
export async function listarProcessos({
  categoria = null, faseId = null, prioridade = null, busca = '',
  incluirInativos = false, pagina = 1, porPagina = 10
} = {}) {
  await aguardarSessao();
  let q = supabase
    .from('lic_processos')
    .select('*, fase:lic_fases!fase_id(nome, ordem, desvio, prazo_alerta_dias),'
      + ' local:lic_locais!local_id(sigla),'
      + ' unidade:unidades_organizacionais!unidade_solicitante_id(sigla, nome),'
      + ' movs:lic_movimentacoes(criado_em)', { count: 'exact' })
    .order('criado_em', { referencedTable: 'lic_movimentacoes', ascending: false })
    .limit(1, { referencedTable: 'lic_movimentacoes' });

  if (!incluirInativos) q = q.eq('ativo', true);
  if (categoria) q = q.eq('categoria', categoria);
  if (faseId) q = q.eq('fase_id', faseId);
  if (prioridade) q = q.eq('prioridade', prioridade);

  const b = (busca ?? '').trim().replace(/[,()%]/g, ' ').trim();
  if (b) {
    q = q.or(['objeto', 'numero', 'numero_requisicao', 'numero_processo_compra',
      'numero_pregao', 'numero_processo_solar']
      .map(c => `${c}.ilike.%${b}%`).join(','));
  }

  const de = (pagina - 1) * porPagina;
  q = q.order('criado_em', { ascending: false }).range(de, de + porPagina - 1);

  const { data, error, count } = await q;
  if (error) throw error;
  const itens = (data ?? []).map(p => ({
    ...p,
    ultima_movimentacao_em: p.movs?.[0]?.criado_em ?? p.criado_em,
    movs: undefined
  }));
  return { itens, total: count ?? itens.length };
}

// Um processo por id, com os mesmos vínculos (tela de detalhe).
export async function obterProcesso(id) {
  await aguardarSessao();
  const { data, error } = await supabase
    .from('lic_processos')
    .select('*, fase:lic_fases!fase_id(id, nome, ordem, desvio, prazo_alerta_dias),'
      + ' local:lic_locais!local_id(id, sigla, nome),'
      + ' unidade:unidades_organizacionais!unidade_solicitante_id(id, sigla, nome),'
      + ' criador:usuarios!criado_por(nome)')
    .eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

// Timeline do processo (imutável; mais recente primeiro).
export async function listarMovimentacoes(processoId) {
  await aguardarSessao();
  const { data, error } = await supabase
    .from('lic_movimentacoes')
    .select('*, autor:usuarios!autor_id(nome),'
      + ' fase_anterior:lic_fases!fase_anterior_id(nome),'
      + ' fase_nova:lic_fases!fase_nova_id(nome),'
      + ' local_anterior:lic_locais!local_anterior_id(sigla),'
      + ' local_novo:lic_locais!local_novo_id(sigla)')
    .eq('processo_id', processoId)
    .order('criado_em', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// O usuário corrente pode escrever no módulo? Equipe de licitações OU
// administrador (sql/042). Gate de botões na interface; a trava real é
// o RLS/RPC — regra 4 do CLAUDE.md. A guarda do central devolve o
// USUÁRIO (id direto); uma sessão Supabase traria user.id — aceitamos
// os dois formatos. Cai em fn_lic_e_equipe caso o 042 ainda não tenha
// sido aplicado no banco.
export async function souEquipe() {
  const sessao = await aguardarSessao();
  const usuarioId = sessao?.user?.id ?? sessao?.id;
  if (!usuarioId) return false;
  try {
    return !!await rpc('fn_lic_pode_editar', { p_usuario_id: usuarioId });
  } catch (_) {
    return !!await rpc('fn_lic_e_equipe', { p_usuario_id: usuarioId });
  }
}

// ---------------------------------------------------------------------
// Escritas — sempre por RPC SECURITY DEFINER.
// ---------------------------------------------------------------------

// Novo pedido (gerente ou acima).
export function criarProcesso(dados = {}) {
  return rpc('fn_lic_criar_processo', {
    p_objeto: dados.objeto,
    p_categoria: dados.categoria,
    p_prioridade: dados.prioridade ?? '3_normal',
    p_unidade_solicitante_id: dados.unidadeSolicitanteId ?? null,
    p_texto: dados.texto ?? null,
    p_numero_processo_solar: dados.numeroProcessoSolar ?? null,
    p_demanda_id: dados.demandaId ?? null
  });
}

export function registrarAndamento(processoId, texto) {
  return rpc('fn_lic_registrar_andamento', {
    p_processo_id: processoId, p_texto: texto
  });
}

export function mudarFase(processoId, faseId, texto = null) {
  return rpc('fn_lic_mudar_fase', {
    p_processo_id: processoId, p_fase_id: faseId, p_texto: texto
  });
}

export function mudarLocal(processoId, localId, texto = null) {
  return rpc('fn_lic_mudar_local', {
    p_processo_id: processoId, p_local_id: localId, p_texto: texto
  });
}

export function agendarPregao(processoId, data, texto = null) {
  return rpc('fn_lic_agendar_pregao', {
    p_processo_id: processoId, p_data: data, p_texto: texto
  });
}

// `campos` só com as chaves a alterar (lista branca no banco).
export function editarProcesso(processoId, campos, justificativa) {
  return rpc('fn_lic_editar', {
    p_processo_id: processoId, p_campos: campos, p_justificativa: justificativa
  });
}

export function inativarProcesso(processoId, motivo) {
  return rpc('fn_lic_inativar', { p_processo_id: processoId, p_motivo: motivo });
}

export function reativarProcesso(processoId, motivo) {
  return rpc('fn_lic_reativar', { p_processo_id: processoId, p_motivo: motivo });
}

// Retificação: só o autor, com a janela da regra 6 (validada no banco).
export function retificarMovimentacao(movimentacaoId, textoCorreto, justificativa) {
  return rpc('fn_lic_retificar', {
    p_movimentacao_id: movimentacaoId,
    p_texto_correto: textoCorreto,
    p_justificativa: justificativa
  });
}

export function registrarRessalva(movimentacaoId, textoCorreto, justificativa) {
  return rpc('fn_lic_registrar_ressalva', {
    p_movimentacao_id: movimentacaoId,
    p_texto_correto: textoCorreto,
    p_justificativa: justificativa
  });
}
