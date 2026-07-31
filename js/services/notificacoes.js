// =====================================================================
// notificacoes.js — leitura das notificações do usuário corrente.
//
// LEITURA apenas por enquanto. Marcar como lida exige uma função de banco
// (notificacoes não tem grant de UPDATE ao front) — a criar na Sessão 9.
// =====================================================================

import { supabase } from './supabaseClient.js';

// Lista as notificações do usuário (RLS já restringe às próprias).
export async function listar({ limite = 50 } = {}) {
  const { data, error } = await supabase
    .from('notificacoes').select('*')
    .order('criado_em', { ascending: false })
    .limit(limite);
  if (error) throw error;
  return data;
}

// Contagem de não lidas (para o badge do cabeçalho).
export async function contarNaoLidas() {
  const { count, error } = await supabase
    .from('notificacoes')
    .select('*', { count: 'exact', head: true })
    .eq('lida', false);
  if (error) throw error;
  return count ?? 0;
}

// marcarLida / marcarTodasLidas: PENDENTE — requer função SECURITY DEFINER
// no banco (Sessão 9). Não implementar via UPDATE direto (sem grant).
