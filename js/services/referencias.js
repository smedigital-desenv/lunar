// =====================================================================
// referencias.js — listas de apoio para formulários (tipos, escolas,
// usuários). Leitura por SELECT (RLS permite a autenticados).
// =====================================================================

import { supabase } from './supabaseClient.js';

export async function listarTipos() {
  const { data, error } = await supabase
    .from('tipos_demanda').select('id, nome').eq('ativo', true).order('nome');
  if (error) throw error;
  return data;
}

export async function listarEscolas() {
  const { data, error } = await supabase
    .from('escolas').select('id, nome').eq('ativo', true).order('nome');
  if (error) throw error;
  return data;
}

// Usuários ativos, para selects de responsável/solicitante.
export async function listarUsuariosAtivos() {
  const { data, error } = await supabase
    .from('usuarios').select('id, nome, email').eq('ativo', true).order('nome');
  if (error) throw error;
  return data;
}
