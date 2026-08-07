// =====================================================================
// notificacoes.js — notificações do usuário corrente.
//
// Leitura via SELECT (RLS restringe às próprias). Marcar como lida passa
// por RPC SECURITY DEFINER (notificacoes não tem grant de UPDATE ao front).
// =====================================================================

import { supabase, aguardarSessao } from './supabaseClient.js';

// Lista as notificações do usuário (RLS já restringe às próprias).
// `aguardarSessao()` porque o sino é montado no topo do módulo da página,
// antes de a guarda terminar — sem isso a consulta sai como `anon` e volta 401.
export async function listar({ limite = 50 } = {}) {
  await aguardarSessao();
  const { data, error } = await supabase
    .from('notificacoes').select('*')
    .order('criado_em', { ascending: false })
    .limit(limite);
  if (error) throw error;
  return data;
}

// Contagem de não lidas (para o badge do cabeçalho).
export async function contarNaoLidas() {
  await aguardarSessao();
  const { count, error } = await supabase
    .from('notificacoes')
    .select('*', { count: 'exact', head: true })
    .eq('lida', false);
  if (error) throw error;
  return count ?? 0;
}

// Marca UMA notificação como lida (idempotente no banco).
export async function marcarLida(id) {
  const { error } = await supabase.rpc('fn_marcar_notificacao_lida', { p_id: id });
  if (error) throw error;
}

// Marca todas as não lidas do usuário como lidas. Retorna a quantidade.
export async function marcarTodasLidas() {
  const { data, error } = await supabase.rpc('fn_marcar_todas_notificacoes_lidas');
  if (error) throw error;
  return data ?? 0;
}
