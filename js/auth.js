// =====================================================================
// auth.js — autenticação (Sessão 3).
// Login Google (OAuth) e e-mail/senha (acesso de teste), logout, guarda de
// rota e obtenção do usuário corrente com perfil e unidade.
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
function paginaLogin() {
  return location.pathname.includes('/pages/') ? './login.html' : './pages/login.html';
}
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

export async function logout() {
  await supabase.auth.signOut();
  location.href = paginaLogin();
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
// página seguir com dados de exemplo. Com config: exige sessão válida e
// usuário provisionado; caso contrário, manda ao login.
// Retorna o usuário corrente, ou null em demo.
export async function protegerRota() {
  if (!estaConfigurado()) return null;
  const sessao = await sessaoAtual();
  if (!sessao) { location.href = paginaLogin(); return null; }
  try {
    return await usuarioCorrente();
  } catch (e) {
    console.warn('Acesso negado:', e.message);
    location.href = `${paginaLogin()}?erro=${encodeURIComponent(e.message)}`;
    return null;
  }
}
