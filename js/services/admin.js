// =====================================================================
// admin.js — administração de usuários (Sessão 3).
// Provisiona/edita acesso, inativa/reativa e lista dados de apoio.
// Escrita sempre por RPC (SECURITY DEFINER); leitura por SELECT (RLS).
// Só surte efeito para quem administra — o banco valida o perfil.
// =====================================================================

import { supabase, rpc, aguardarSessao } from './supabaseClient.js';

// --- Leitura de apoio -------------------------------------------------

// Contas de login ainda sem acesso ao sistema (auth.users sem gestao.usuarios).
// Num projeto COMPARTILHADO, listar "toda conta sem acesso" traria os
// usuários dos sistemas vizinhos — 66, na conferência de 2026-08-07.
// Por isso a função só responde a uma busca por e-mail: sem termo, nada.
export function listarContasPendentes(busca) {
  return rpc('fn_listar_contas_pendentes', { p_busca: busca ?? null });
}

// Usuários já provisionados, com nome de perfil e unidade.
export async function listarUsuarios() {
  await aguardarSessao();
  const { data, error } = await supabase
    .from('usuarios')
    .select('id, nome, email, perfil, unidade_id, ativo,'
      + ' perfis ( nome ), unidades_organizacionais ( nome, sigla )')
    .order('nome');
  if (error) throw error;
  return data;
}

export async function listarPerfis() {
  await aguardarSessao();
  const { data, error } = await supabase
    .from('perfis').select('codigo, nome, nivel').order('nivel');
  if (error) throw error;
  return data;
}

export async function listarUnidades() {
  await aguardarSessao();
  const { data, error } = await supabase
    .from('unidades_organizacionais')
    .select('id, nome, sigla, tipo, ativo').eq('ativo', true).order('nome');
  if (error) throw error;
  return data;
}

// Organograma completo (com parent_id) para montar a árvore de equipes.
export async function listarOrganograma() {
  await aguardarSessao();
  const { data, error } = await supabase
    .from('unidades_organizacionais')
    .select('id, nome, sigla, tipo, parent_id, ativo').eq('ativo', true).order('nome');
  if (error) throw error;
  return data;
}

// Move uma pessoa para outra unidade (define/edita a equipe). Admin only (banco valida).
export function definirUnidadeUsuario(usuarioId, unidadeId) {
  return rpc('fn_definir_unidade_usuario', { p_usuario_id: usuarioId, p_unidade_id: unidadeId });
}

// Tipos de demanda — TODOS, inclusive os inativos. O referencias.js só
// traz os ativos (é o que o seletor de nova demanda precisa); a tela de
// administração precisa ver os inativos para poder reativá-los.
export async function listarTiposTodos() {
  await aguardarSessao();
  const { data, error } = await supabase
    .from('tipos_demanda').select('id, nome, descricao, ativo').order('nome');
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

// --- Tipos de demanda (RPC, sql/049) ----------------------------------

// Cria quando `id` é nulo; edita quando vem. Devolve o id.
export function salvarTipo({ id = null, nome, descricao = null, ativo = true }) {
  return rpc('fn_tipo_salvar', {
    p_nome: nome, p_descricao: descricao, p_id: id, p_ativo: ativo
  });
}

// Não existe excluir (regra 1): demandas.tipo_id aponta para cá, e apagar
// levaria junto a classificação de processos antigos. Inativar tira do
// seletor e preserva o histórico.
export function inativarTipo(id, motivo) {
  return rpc('fn_tipo_inativar', { p_id: id, p_motivo: motivo });
}

export function reativarTipo(id, motivo) {
  return rpc('fn_tipo_reativar', { p_id: id, p_motivo: motivo });
}
