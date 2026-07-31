// =====================================================================
// tarefas.js — encaminhamento, subtarefas e devolutivas.
// =====================================================================

import { supabase, rpc } from './supabaseClient.js';

// Encaminha: informe demandaId (cria tarefa ao destinatário) OU tarefaId
// (redistribui uma tarefa existente — redistribuir de terceiro exige chefia).
export function encaminhar({ destinatarioId, texto, demandaId = null,
                             tarefaId = null, prioridade = null, prazo = null }) {
  return rpc('fn_encaminhar', {
    p_destinatario_id: destinatarioId,
    p_texto: texto,
    p_demanda_id: demandaId,
    p_tarefa_id: tarefaId,
    p_prioridade: prioridade,
    p_prazo: prazo
  });
}

// Cria subtarefa sob uma tarefa (parentId).
export function criarSubtarefa({ parentId, responsavelId, titulo,
                                 descricao = null, prazo = null, prioridade = null }) {
  return rpc('fn_criar_subtarefa', {
    p_parent_id: parentId,
    p_responsavel_id: responsavelId,
    p_titulo: titulo,
    p_descricao: descricao,
    p_prazo: prazo,
    p_prioridade: prioridade
  });
}

// Devolutiva com anexos. `anexos` é um array de metadados vindos de
// anexos.subirAnexo() (nome_original, nome_storage, mime, tamanho_bytes,
// hash_sha256, storage_path).
export function registrarDevolutiva(tarefaId, texto, anexos = []) {
  return rpc('fn_registrar_devolutiva', {
    p_tarefa_id: tarefaId, p_texto: texto, p_anexos: anexos
  });
}

export function inativarTarefa(id, motivo) {
  return rpc('fn_inativar', { p_entidade: 'tarefa', p_id: id, p_motivo: motivo });
}

export function reativarTarefa(id, motivo) {
  return rpc('fn_reativar', { p_entidade: 'tarefa', p_id: id, p_motivo: motivo });
}

// Árvore de tarefas de uma demanda (para montar a hierarquia no front).
export async function listarPorDemanda(demandaId) {
  const { data, error } = await supabase
    .from('tarefas').select('*')
    .eq('demanda_id', demandaId)
    .order('criado_em', { ascending: true });
  if (error) throw error;
  return data;
}
