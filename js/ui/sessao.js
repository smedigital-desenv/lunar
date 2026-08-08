// =====================================================================
// sessao.js — guarda de rota + identificação do usuário no cabeçalho.
// Usado pelas páginas internas (não pela tela de login). Em modo demo
// (sem config) — ou se o supabase-js não carregar — NÃO redireciona: a
// página segue com dados de exemplo. O acesso ao Supabase é carregado de
// forma preguiçosa (dynamic import) para não derrubar a página offline.
// =====================================================================

import { escapeHtml } from './componentes.js';

// Usuários do seed para o seletor "Testar como…" (somente ambiente de teste).
const USUARIOS_TESTE = [
  { email: 'admin.ti@educacao.pmrp.sp.gov.br',    rotulo: 'Kléber — Admin TI' },
  { email: 'secretario@educacao.pmrp.sp.gov.br',  rotulo: 'Ana — Gabinete' },
  { email: 'subped@educacao.pmrp.sp.gov.br',      rotulo: 'Bruno — Subsecretário (Pedag.)' },
  { email: 'gerente.gef@educacao.pmrp.sp.gov.br', rotulo: 'Eduardo — Gerente (GEF)' },
  { email: 'chefe.sai@educacao.pmrp.sp.gov.br',   rotulo: 'Gustavo — Chefe de seção (SAI)' },
  { email: 'agente.sai@educacao.pmrp.sp.gov.br',  rotulo: 'Igor — Agente (SAI)' },
  { email: 'agente.sfo@educacao.pmrp.sp.gov.br',  rotulo: 'Júlia — Agente (SFO)' }
];
const SENHA_TESTE = 'dev-123456';

// Barra "Testar como…": só aparece com MODO_TESTE ligado (config.js). Faz
// login rápido em cada usuário do seed para conferir a tramitação por perfil.
async function montarTrocaTeste(auth, emailAtual) {
  let cfg;
  try { cfg = await import('../config.js'); } catch (_) { return; }
  if (!cfg.MODO_TESTE) return;
  if (document.querySelector('.troca-teste')) return;

  const barra = document.createElement('div');
  barra.className = 'troca-teste';
  barra.innerHTML =
    `<span class="troca-teste__rot">🧪 Testar como:</span>`
    + `<select class="troca-teste__sel" aria-label="Trocar usuário de teste">`
    + USUARIOS_TESTE.map(u =>
        `<option value="${escapeHtml(u.email)}"${u.email === emailAtual ? ' selected' : ''}>`
        + `${escapeHtml(u.rotulo)}</option>`).join('')
    + `</select>`;
  document.body.insertBefore(barra, document.body.firstChild);
  document.body.classList.add('com-troca-teste');

  barra.querySelector('select').addEventListener('change', async (e) => {
    const email = e.target.value;
    if (!email || email === emailAtual) return;
    e.target.disabled = true;
    try {
      await auth.loginSenha(email, SENHA_TESTE);
      location.href = './caixa-entrada.html';
    } catch (err) {
      alert('Falha ao trocar de usuário: ' + (err.message || ''));
      e.target.disabled = false;
    }
  });
}

export async function iniciarSessao(elId = 'usuario-sessao') {
  let auth;
  try {
    auth = await import('../auth.js');           // puxa supabase-js só aqui
  } catch (_) {
    return null;                                 // indisponível → demo
  }
  if (!auth.estaConfigurado()) return null;      // sem config → demo

  const usuario = await auth.protegerRota();     // guarda (delegada ao central)
  if (!usuario) return null;

  montarTrocaTeste(auth, usuario.email);         // seletor de teste (se ligado)

  const el = document.getElementById(elId);
  if (el) {
    el.classList.add('sessao');
    el.innerHTML =
      `<span class="sessao__id" title="${escapeHtml(usuario.email)}">`
      + `<span class="sessao__nome">${escapeHtml(usuario.nome)}</span>`
      + `<span class="sessao__perfil">${escapeHtml(usuario.perfil_nome)}`
      + (usuario.unidade_sigla ? ` · ${escapeHtml(usuario.unidade_sigla)}` : '')
      + `</span></span>`
      + `<a class="sessao__admin" href="./ajuda.html" title="Como usar o sistema">Ajuda</a>`
      + (usuario.pode_administrar
          ? `<a class="sessao__admin" href="./admin.html">Admin</a>`
            + `<a class="sessao__admin" href="./equipes.html">Equipes</a>` : '')
      + `<button type="button" id="btn-sair" class="sessao__sair" aria-label="Sair">Sair</button>`;
    document.getElementById('btn-sair').addEventListener('click', () => auth.logout());
    // Alternar demonstração: discreto, e só para quem administra.
    const demo = await import('./demo.js');
    demo.montarBotao(el, usuario);
  }
  return usuario;
}
