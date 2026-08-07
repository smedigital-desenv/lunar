// =====================================================================
// referencias.js — listas de apoio para formulários (tipos, escolas,
// usuários). Leitura por SELECT (RLS permite a autenticados).
// =====================================================================

import { supabase, aguardarSessao } from './supabaseClient.js';

export async function listarTipos() {
  await aguardarSessao();
  const { data, error } = await supabase
    .from('tipos_demanda').select('id, nome').eq('ativo', true).order('nome');
  if (error) throw error;
  return data;
}

export async function listarEscolas() {
  await aguardarSessao();
  const { data, error } = await supabase
    .from('escolas').select('id, nome').eq('ativo', true).order('nome');
  if (error) throw error;
  return data;
}

// Usuários ativos, para selects de responsável/solicitante.
export async function listarUsuariosAtivos() {
  await aguardarSessao();
  const { data, error } = await supabase
    .from('usuarios').select('id, nome, email').eq('ativo', true).order('nome');
  if (error) throw error;
  return data;
}
