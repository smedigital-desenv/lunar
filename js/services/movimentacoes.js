// =====================================================================
// movimentacoes.js — timeline, retificação e ressalva.
// A tabela é imutável: só há leitura + funções de retificação/ressalva
// (que criam NOVAS linhas vinculadas à original).
// =====================================================================

import { supabase, rpc } from './supabaseClient.js';

// Timeline cronológica completa da demanda (inclui movimentações de tarefas).
export async function listarPorDemanda(demandaId) {
  const { data, error } = await supabase
    .from('movimentacoes').select('*')
    .eq('demanda_id', demandaId)
    .order('criado_em', { ascending: true });
  if (error) throw error;
  return data;
}

// Retifica uma movimentação (só enquanto a janela estiver aberta).
export function retificar(movimentacaoId, textoCorreto, justificativa) {
  return rpc('fn_retificar_movimentacao', {
    p_movimentacao_id: movimentacaoId,
    p_texto_correto: textoCorreto,
    p_justificativa: justificativa
  });
}

// Registra ressalva (aponta o erro após a janela fechada).
export function registrarRessalva(movimentacaoId, textoCorreto, justificativa) {
  return rpc('fn_registrar_ressalva', {
    p_movimentacao_id: movimentacaoId,
    p_texto_correto: textoCorreto,
    p_justificativa: justificativa
  });
}
