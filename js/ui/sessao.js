// =====================================================================
// sessao.js — guarda de rota + identificação do usuário no cabeçalho.
// Usado pelas páginas internas (não pela tela de login). Em modo demo
// (sem config) — ou se o supabase-js não carregar — NÃO redireciona: a
// página segue com dados de exemplo. O acesso ao Supabase é carregado de
// forma preguiçosa (dynamic import) para não derrubar a página offline.
// =====================================================================

import { escapeHtml } from './componentes.js';

export async function iniciarSessao(elId = 'usuario-sessao') {
  let auth;
  try {
    auth = await import('../auth.js');           // puxa supabase-js só aqui
  } catch (_) {
    return null;                                 // indisponível → demo
  }
  if (!auth.estaConfigurado()) return null;      // sem config → demo

  const usuario = await auth.protegerRota();     // redireciona ao login se preciso
  if (!usuario) return null;

  const el = document.getElementById(elId);
  if (el) {
    el.classList.add('sessao');
    el.innerHTML =
      `<span class="sessao__id" title="${escapeHtml(usuario.email)}">`
      + `<span class="sessao__nome">${escapeHtml(usuario.nome)}</span>`
      + `<span class="sessao__perfil">${escapeHtml(usuario.perfil_nome)}`
      + (usuario.unidade_sigla ? ` · ${escapeHtml(usuario.unidade_sigla)}` : '')
      + `</span></span>`
      + (usuario.pode_administrar
          ? `<a class="sessao__admin" href="./admin.html">Admin</a>`
            + `<a class="sessao__admin" href="./equipes.html">Equipes</a>` : '')
      + `<button type="button" id="btn-sair" class="sessao__sair" aria-label="Sair">Sair</button>`;
    document.getElementById('btn-sair').addEventListener('click', () => auth.logout());
  }
  return usuario;
}
