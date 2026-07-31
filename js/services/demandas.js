// =====================================================================
// demandas.js — serviço de demandas (wrappers finos sobre as RPCs).
// Nenhuma regra de negócio aqui: tudo é validado no banco.
// =====================================================================

import { supabase, rpc } from './supabaseClient.js';

// Cria uma demanda. `dados.pessoas` é um array [{nome, vinculo, observacao}].
export function criarDemanda(dados = {}) {
  return rpc('fn_criar_demanda', {
    p_titulo: dados.titulo,
    p_objeto_queixa: dados.objetoQueixa,
    p_descricao: dados.descricao ?? null,
    p_tipo_id: dados.tipoId ?? null,
    p_categoria: dados.categoria ?? null,
    p_setor: dados.setor ?? null,
    p_prioridade: dados.prioridade ?? 'normal',
    p_prazo: dados.prazo ?? null,
    p_escola_id: dados.escolaId ?? null,
    p_aluno_nome: dados.alunoNome ?? null,
    p_numero_processo_solar: dados.numeroProcessoSolar ?? null,
    p_sigilo: dados.sigilo ?? 'normal',
    p_solicitante_id: dados.solicitanteId ?? null,
    p_responsavel_id: dados.responsavelId ?? null,
    p_pessoas: dados.pessoas ?? []
  });
}

// Edita campos da demanda (gerente+). `campos` é um objeto só com as chaves
// a alterar: titulo, descricao, objeto_queixa, categoria, prioridade, prazo,
// escola_id, aluno_nome. Justificativa obrigatória.
export function editarDemanda(id, campos, justificativa) {
  return rpc('fn_editar_demanda', {
    p_demanda_id: id, p_campos: campos, p_justificativa: justificativa
  });
}

export function concluir(id, conclusao) {
  return rpc('fn_concluir', { p_demanda_id: id, p_conclusao: conclusao });
}

export function reabrir(id, justificativa) {
  return rpc('fn_reabrir', { p_demanda_id: id, p_justificativa: justificativa });
}

export function alterarSituacao(id, novaSituacao, texto = null) {
  return rpc('fn_alterar_situacao', {
    p_demanda_id: id, p_nova_situacao: novaSituacao, p_texto: texto
  });
}

export function solicitarComplementacao(id, texto) {
  return rpc('fn_solicitar_complementacao', { p_demanda_id: id, p_texto: texto });
}

export function inativarDemanda(id, motivo) {
  return rpc('fn_inativar', { p_entidade: 'demanda', p_id: id, p_motivo: motivo });
}

export function reativarDemanda(id, motivo) {
  return rpc('fn_reativar', { p_entidade: 'demanda', p_id: id, p_motivo: motivo });
}

// Leitura de uma demanda por id (RLS decide a visibilidade).
export async function obterDemanda(id) {
  const { data, error } = await supabase
    .from('demandas').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}
