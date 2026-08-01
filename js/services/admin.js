// =====================================================================
// admin.js — administração de usuários (Sessão 3).
// Provisiona/edita acesso, inativa/reativa e lista dados de apoio.
// Escrita sempre por RPC (SECURITY DEFINER); leitura por SELECT (RLS).
// Só surte efeito para quem administra — o banco valida o perfil.
// =====================================================================

import { supabase, rpc } from './supabaseClient.js';

// --- Leitura de apoio -------------------------------------------------

// Contas de login ainda sem acesso ao sistema (auth.users sem gestao.usuarios).
export function listarContasPendentes() {
  return rpc('fn_listar_contas_pendentes', {});
}

// Usuários já provisionados, com nome de perfil e unidade.
export async function listarUsuarios() {
  const { data, error } = await supabase
    .from('usuarios')
    .select('id, nome, email, perfil, unidade_id, ativo,'
      + ' perfis ( nome ), unidades_organizacionais ( nome, sigla )')
    .order('nome');
  if (error) throw error;
  return data;
}

export async function listarPerfis() {
  const { data, error } = await supabase
    .from('perfis').select('codigo, nome, nivel').order('nivel');
  if (error) throw error;
  return data;
}

export async function listarUnidades() {
  const { data, error } = await supabase
    .from('unidades_organizacionais')
    .select('id, nome, sigla, tipo, ativo').eq('ativo', true).order('nome');
  if (error) throw error;
  return data;
}

// --- Escrita (RPC) ----------------------------------------------------

// Cria ou ajusta o acesso de uma conta (idempotente). Retorna o id.
export function provisionarUsuario({ authId, nome, perfil, unidadeId }) {
  return rpc('fn_provisionar_usuario', {
    p_auth_id: authId, p_nome: nome, p_perfil: perfil, p_unidade_id: unidadeId
  });
}

export function inativarUsuario(id, motivo) {
  return rpc('fn_inativar_usuario', { p_id: id, p_motivo: motivo });
}

export function reativarUsuario(id, motivo) {
  return rpc('fn_reativar_usuario', { p_id: id, p_motivo: motivo });
}
