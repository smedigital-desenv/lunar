// =====================================================================
// painel.js — dashboard e pesquisa (funções do banco filtradas por RLS).
// Os contadores e a busca são calculados NO BANCO (não no JavaScript).
// =====================================================================

import { rpc } from './supabaseClient.js';

// Contadores e quebras do painel (fn_dashboard retorna um objeto jsonb).
export function obterDashboard() {
  return rpc('fn_dashboard', {});
}

// Métricas gerenciais adicionais (por situação, unidade, tipo, evolução mensal).
export function obterGerencial() {
  return rpc('fn_dashboard_gerencial', {});
}

// Lista as demandas de um KPI do painel (drill-down). Retorna { total, itens }.
// `unidadeId` recorta pela subárvore de uma unidade (sql/045). Só
// ESTREITA: a RLS segue decidindo o que a pessoa pode ver.
export function listarPorKpi(kpi, pagina = 1, porPagina = 20, unidadeId = null) {
  return rpc('fn_listar_por_kpi', {
    p_kpi: kpi, p_pagina: pagina, p_por_pagina: porPagina,
    p_unidade_id: unidadeId || null
  });
}

// Busca textual + filtros, paginada. Retorna { total, itens }.
export function pesquisar({ termo, situacao, prioridade, setor, de, ate,
                            pagina = 1, porPagina = 10 } = {}) {
  return rpc('fn_pesquisar_demandas', {
    p_termo: termo || null,
    p_situacao: situacao || null,
    p_prioridade: prioridade || null,
    p_setor: setor || null,
    p_de: de || null,
    p_ate: ate || null,
    p_pagina: pagina,
    p_por_pagina: porPagina
  });
}
