// =====================================================================
// comentarios.js — registrar uma nota/informação livre na demanda (ou
// numa tarefa específica), sem alterar situação ou responsável.
// =====================================================================

import { rpc } from './supabaseClient.js';

export function criarComentario({ demandaId, texto, tarefaId = null }) {
  return rpc('fn_criar_comentario', {
    p_demanda_id: demandaId,
    p_texto: texto,
    p_tarefa_id: tarefaId
  });
}
