// =====================================================================
// auth.js — autenticação (Sessão 3; guarda delegada ao central na Fase 4).
// Obtenção do usuário corrente com perfil e unidade, logout e guarda de rota.
//
// A GUARDA e o LOGIN passaram para o Controle de Acesso central da rede
// (js/auth-central.js). `loginGoogle`/`loginSenha` continuam aqui apenas para
// o MODO_TESTE de desenvolvimento — em produção o único caminho de entrada é
// /central/login.html.
//
// Acesso restrito ao domínio @educacao.pmrp.sp.gov.br (front + banco). Sem
// linha em gestao.usuarios, o login é RECUSADO ("não autorizado"): a conta
// precisa ser provisionada por um admin (fn_provisionar_usuario).
//
// Este módulo pertence à camada de acesso (pode falar com o Supabase); as
// páginas usam apenas as funções exportadas aqui.
// =====================================================================

import { supabase } from './services/supabaseClient.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, CONFIG } from './config.js';

const DOMINIO = CONFIG.dominioPermitido; // '@educacao.pmrp.sp.gov.br'

// true quando config.js tem valores reais (evita guardas/redirect em demo).
export function estaConfigurado() {
  return !!SUPABASE_URL && !SUPABASE_URL.includes('SEU-PROJETO')
    && !!SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.includes('COLE_AQUI');
}

export function emailNoDominio(email) {
  return typeof email === 'string' && email.toLowerCase().endsWith(DOMINIO);
}

// Resolve caminhos relativos independentemente de estarmos em /pages/.
function paginaInicial() {
  return location.pathname.includes('/pages/') ? './caixa-entrada.html' : './pages/caixa-entrada.html';
}

// ---------------------------------------------------------------- Login
export async function loginGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: new URL(paginaInicial(), location.href).href,
      // `hd` sugere o domínio ao Google; a trava real é no callback/banco.
      queryParams: { hd: DOMINIO.replace('@', ''), prompt: 'select_account' }
    }
  });
  if (error) throw error;
}

export async function loginSenha(email, senha) {
  if (!emailNoDominio(email)) {
    throw new Error(`Use um e-mail ${DOMINIO}.`);
  }
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
  if (error) throw error;
  // Confirma que o usuário está provisionado; senão, recusa e desloga.
  return await usuarioCorrente();
}

// Sair encerra as DUAS sessões: a deste projeto e a do central. Sem isso a
// sessão local sobreviveria ao logout e a próxima pessoa no mesmo navegador
// entraria com a conta anterior.
export async function logout() {
  const central = await import('./auth-central.js');
  return central.logoutCentral();
}

// ---------------------------------------------------------------- Sessão
export async function sessaoAtual() {
  const { data } = await supabase.auth.getSession();
  return data?.session ?? null;
}

// Usuário corrente com perfil e unidade. Lança se fora do domínio ou não
// provisionado (nesses casos desloga, para não deixar sessão órfã).
export async function usuarioCorrente() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  if (!emailNoDominio(user.email)) {
    await supabase.auth.signOut();
    throw new Error(`Acesso restrito ao domínio ${DOMINIO}.`);
  }

  const { data, error } = await supabase
    .from('usuarios')
    .select('id, nome, email, perfil, unidade_id, ativo,'
      + ' perfis ( nome, nivel, escopo_global, pode_administrar ),'
      + ' unidades_organizacionais ( nome, sigla )')
    .eq('id', user.id)
    .maybeSingle();
  if (error) throw error;

  if (!data || data.ativo === false) {
    await supabase.auth.signOut();
    throw new Error('Usuário não autorizado. Solicite cadastro a um administrador.');
  }

  return {
    id: data.id,
    nome: data.nome,
    email: data.email,
    perfil: data.perfil,
    unidade_id: data.unidade_id,
    perfil_nome: data.perfis?.nome ?? data.perfil,
    nivel: data.perfis?.nivel ?? 0,
    escopo_global: data.perfis?.escopo_global ?? false,
    pode_administrar: data.perfis?.pode_administrar ?? false,
    unidade_nome: data.unidades_organizacionais?.nome ?? null,
    unidade_sigla: data.unidades_organizacionais?.sigla ?? null
  };
}

// ---------------------------------------------------------------- Guarda
// Protege uma página. Em modo demo (sem config), NÃO redireciona — deixa a
// página seguir com dados de exemplo.
//
// Com config, a guarda é DELEGADA ao Controle de Acesso central da rede
// (auth-central.js): é ele que confere a sessão da rede, libera ou bloqueia
// esta tela e abre a sessão local pela ponte. O perfil e a unidade continuam
// vindo de gestao.usuarios via usuarioCorrente() — a RLS é que manda nos
// dados. O import é dinâmico de propósito: quebra o ciclo entre os dois
// módulos e mantém a página de pé quando o central está fora do ar.
// Retorna o usuário corrente, ou null em demo/bloqueio.
export async function protegerRota() {
  if (!estaConfigurado()) return null;
  const central = await import('./auth-central.js');
  return central.protegerRotaCentral();
}
