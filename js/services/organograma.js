// =====================================================================
// organograma.js — leitura e manutenção da estrutura organizacional.
// Escrita sempre por RPC (SECURITY DEFINER); leitura por SELECT (RLS).
// Quem pode editar é decidido pelo banco, em
// `perfis.pode_gerir_organograma` — nunca por esconder botão (regra 4).
// =====================================================================

import { supabase, rpc, aguardarSessao } from './supabaseClient.js';

// --- Leitura ----------------------------------------------------------

// Estrutura inteira, ativas e inativas, com a contagem de pessoas de cada
// unidade. A contagem importa na tela: inativar uma unidade com gente
// dentro é recusado pelo banco, e é melhor avisar antes de a pessoa tentar.
export async function listarUnidades() {
  await aguardarSessao();
  const { data, error } = await supabase
    .from('unidades_organizacionais')
    .select('id, parent_id, tipo, nome, sigla, ativo, motivo_inativacao,'
      + ' usuarios ( id )')
    .order('nome');
  if (error) throw error;
  return (data ?? []).map(u => ({
    id: u.id,
    parent_id: u.parent_id,
    tipo: u.tipo,
    nome: u.nome,
    sigla: u.sigla,
    ativo: u.ativo,
    motivo_inativacao: u.motivo_inativacao,
    pessoas: (u.usuarios ?? []).length
  }));
}

// Titulares de uma unidade, para o painel de detalhe.
export async function listarPessoas(unidadeId) {
  await aguardarSessao();
  const { data, error } = await supabase
    .from('usuarios')
    .select('id, nome, email, perfil, ativo')
    .eq('unidade_id', unidadeId)
    .eq('ativo', true)
    .order('nome');
  if (error) throw error;
  return data ?? [];
}

// Se o perfil do usuário corrente pode editar a estrutura.
// A tela usa isto só para não oferecer o que vai ser recusado; a decisão
// de verdade acontece dentro de cada função do banco.
export async function podeGerir(usuarioId) {
  if (!usuarioId) return false;
  try {
    return !!await rpc('fn_pode_gerir_organograma', { p_usuario_id: usuarioId });
  } catch (_) {
    return false;
  }
}

// --- Escrita (RPC) ----------------------------------------------------

// Cria uma unidade sob `parentId`. O banco valida o encaixe do tipo:
// subsecretaria sob gabinete, gerência sob subsecretaria, seção sob
// gerência ou sob o próprio gabinete.
export function criarUnidade({ parentId, tipo, nome, sigla }) {
  return rpc('fn_criar_unidade', {
    p_parent_id: parentId,
    p_tipo: tipo,
    p_nome: nome,
    p_sigla: sigla || null
  });
}

// Renomeia. Justificativa obrigatória (regra 7).
export function editarUnidade({ id, nome, sigla, justificativa }) {
  return rpc('fn_editar_unidade', {
    p_id: id,
    p_nome: nome,
    p_sigla: sigla || null,
    p_justificativa: justificativa
  });
}

// Muda a unidade de lugar na hierarquia. O banco recusa ciclos e
// encaixes inválidos.
export function moverUnidade({ id, novoParentId, justificativa }) {
  return rpc('fn_mover_unidade', {
    p_id: id,
    p_novo_parent_id: novoParentId,
    p_justificativa: justificativa
  });
}

// Não existe exclusão (regra 1): a unidade é inativada com motivo, e o
// histórico das demandas que passaram por ela continua legível.
export function inativarUnidade({ id, motivo }) {
  return rpc('fn_inativar_unidade', { p_id: id, p_motivo: motivo });
}

export function reativarUnidade({ id, motivo }) {
  return rpc('fn_reativar_unidade', { p_id: id, p_motivo: motivo });
}

// --- Apoio à montagem da árvore --------------------------------------

// Transforma a lista plana em árvore, ordenada por tipo e nome.
// Fica aqui, e não na página, porque é a forma natural do dado — a UI
// só percorre o que já vem pronto.
const ORDEM_TIPO = { gabinete: 0, subsecretaria: 1, gerencia: 2, secao: 3 };

export function montarArvore(unidades) {
  const porId = new Map(unidades.map(u => [u.id, { ...u, filhas: [] }]));
  const raizes = [];
  for (const unidade of porId.values()) {
    const mae = unidade.parent_id ? porId.get(unidade.parent_id) : null;
    if (mae) mae.filhas.push(unidade);
    else raizes.push(unidade);
  }
  const ordenar = (lista) => {
    lista.sort((a, b) =>
      (ORDEM_TIPO[a.tipo] - ORDEM_TIPO[b.tipo])
      || a.nome.localeCompare(b.nome, 'pt-BR'));
    lista.forEach(u => ordenar(u.filhas));
  };
  ordenar(raizes);
  return raizes;
}

// Destinos válidos para mover `unidade`, segundo a mesma regra do banco.
// Exclui a própria unidade e toda a sua descendência, para não oferecer
// um movimento que criaria ciclo.
export function destinosValidos(unidade, unidades) {
  const proibidos = new Set([unidade.id]);
  let cresceu = true;
  while (cresceu) {
    cresceu = false;
    for (const u of unidades) {
      if (u.parent_id && proibidos.has(u.parent_id) && !proibidos.has(u.id)) {
        proibidos.add(u.id);
        cresceu = true;
      }
    }
  }
  const paiPermitido = {
    subsecretaria: ['gabinete'],
    gerencia: ['subsecretaria'],
    secao: ['gerencia', 'gabinete']
  }[unidade.tipo] ?? [];

  return unidades.filter(u =>
    u.ativo && !proibidos.has(u.id) && paiPermitido.includes(u.tipo));
}
