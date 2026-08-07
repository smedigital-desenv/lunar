// =====================================================================
// tarefas.js — encaminhamento, subtarefas e devolutivas.
// =====================================================================

import { supabase, rpc, aguardarSessao } from './supabaseClient.js';

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

// Cria subtarefa. Sob uma tarefa (parentId) OU direto na demanda (demandaId,
// quando não há tarefa-mãe). Informe pelo menos um dos dois.
export function criarSubtarefa({ parentId = null, demandaId = null, responsavelId, titulo,
                                 descricao = null, prazo = null, prioridade = null }) {
  return rpc('fn_criar_subtarefa', {
    p_parent_id: parentId,
    p_responsavel_id: responsavelId,
    p_titulo: titulo,
    p_descricao: descricao,
    p_prazo: prazo,
    p_prioridade: prioridade,
    p_demanda_id: demandaId
  });
}

// Devolutiva com anexos. `anexos` é um array de metadados vindos de
// anexos.subirAnexo() (nome_original, nome_storage, mime, tamanho_bytes,
// hash_sha256, storage_path).
// Devolver = a pessoa NÃO vai executar (recusa); volta ao delegador.
export function registrarDevolutiva(tarefaId, texto, anexos = []) {
  return rpc('fn_registrar_devolutiva', {
    p_tarefa_id: tarefaId, p_texto: texto, p_anexos: anexos
  });
}

// Concluir tarefa = a pessoa EXECUTOU; registra a resposta/resultado.
export function concluirTarefa(tarefaId, texto, anexos = []) {
  return rpc('fn_concluir_tarefa', {
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
  await aguardarSessao();
  const { data, error } = await supabase
    .from('tarefas')
    .select('*, responsavel:usuarios!responsavel_id(nome)')
    .eq('demanda_id', demandaId)
    .order('criado_em', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(t => ({ ...t, responsavel_nome: t.responsavel?.nome ?? null }));
}

// Troca o destinatário de uma tarefa já encaminhada (só enquanto o
// destinatário não agiu). Regra e permissão validadas no banco.
export function reencaminhar({ tarefaId, novoDestinatarioId, texto }) {
  return rpc('fn_reencaminhar_tarefa', {
    p_tarefa_id: tarefaId,
    p_novo_destinatario_id: novoDestinatarioId,
    p_texto: texto || null
  });
}

// Aplica o filtro do painel a uma query (situação/prioridade).
function filtroCaixa(q, filtro) {
  switch (filtro) {
    case 'pendentes':    return q.in('situacao', ['aberta', 'aguardando_complementacao', 'devolvida']);
    case 'em_andamento': return q.in('situacao', ['em_andamento', 'reaberta']);
    case 'urgentes':     return q.eq('prioridade', 'urgente');
    case 'encerrados':   return q.eq('situacao', 'concluida');
    default:             return q; // todos
  }
}

// Caixa de ENTRADA (baseada na demanda): demandas em que sou o responsável
// atual OU tenho subtarefa ativa. Uma demanda por item; exclui concluídas.
export async function listarCaixaEntrada({ filtro = 'todos', pagina = 1, porPagina = 10 } = {}) {
  const dados = await rpc('fn_caixa_entrada', {
    p_filtro: filtro, p_pagina: pagina, p_por_pagina: porPagina
  });
  return { itens: dados?.itens ?? [], total: dados?.total ?? 0 };
}
