// =====================================================================
// demandas.js — serviço de demandas (wrappers finos sobre as RPCs).
// Nenhuma regra de negócio aqui: tudo é validado no banco.
// =====================================================================

import { supabase, rpc, aguardarSessao } from './supabaseClient.js';

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

// Presta a complementação pedida: registra texto + anexos, retoma a
// contagem de prazo e devolve a demanda a 'em_andamento'.
export function responderComplementacao(id, texto, anexos = []) {
  return rpc('fn_responder_complementacao', {
    p_demanda_id: id, p_texto: texto, p_anexos: anexos
  });
}

export function inativarDemanda(id, motivo) {
  return rpc('fn_inativar', { p_entidade: 'demanda', p_id: id, p_motivo: motivo });
}

export function reativarDemanda(id, motivo) {
  return rpc('fn_reativar', { p_entidade: 'demanda', p_id: id, p_motivo: motivo });
}

// Leitura de uma demanda por id (RLS decide a visibilidade), já com os
// nomes de responsável, solicitante, escola e tipo.
export async function obterDemanda(id) {
  await aguardarSessao();
  const { data, error } = await supabase
    .from('demandas')
    .select('*, responsavel:usuarios!responsavel_atual_id(nome),'
      + ' solicitante:usuarios!solicitante_id(nome),'
      + ' escola:escolas!escola_id(nome), tipo:tipos_demanda!tipo_id(nome)')
    .eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    ...data,
    responsavel_nome: data.responsavel?.nome ?? null,
    solicitante_nome: data.solicitante?.nome ?? null,
    escola_nome: data.escola?.nome ?? null,
    tipo_nome: data.tipo?.nome ?? null
  };
}

// Caixa de SAÍDA: demandas que o usuário criou OU encaminhou (mesmo que
// hoje não seja mais o criador nem o responsável) — o que ele acompanha
// "de fora". Inclui concluídas (filtro "Encerrados"): é o seu histórico.
export async function listarCaixaSaida({ filtro = 'todos', pagina = 1, porPagina = 10 } = {}) {
  const dados = await rpc('fn_caixa_saida', {
    p_filtro: filtro, p_pagina: pagina, p_por_pagina: porPagina
  });
  return { itens: dados?.itens ?? [], total: dados?.total ?? 0 };
}
