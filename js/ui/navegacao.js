// =====================================================================
// navegacao.js — barra de navegação principal, única para todo o app.
// Mobile: fixa no rodapé (alcance do polegar). Desktop: barra no topo.
// Cada página chama montarNavegacao('<secao ativa>') no fim do seu script.
// =====================================================================

import { escapeHtml } from './componentes.js';

// "Meus processos" abre o sistema: ela responde onde cada processo está,
// que era o que as antigas abas Entrada e Saída tentavam dizer em duas
// listas separadas — com a mesma demanda aparecendo nas duas quando a
// pessoa criava um processo do qual era responsável. As páginas
// caixa-entrada.html e caixa-saida.html continuam de pé para quem tiver
// um link salvo; só não têm mais lugar na barra.
const ABAS = [
  { chave: 'meus-processos', rotulo: 'Meus processos', icone: '\u{1F4DD}', href: 'meus-processos.html' },
  { chave: 'todos',   rotulo: 'Todos',   icone: '\u{1F4CB}', href: 'lista.html?kpi=todos' },
  { chave: 'nova',    rotulo: 'Nova',    icone: '+',         href: 'nova-demanda.html', destaque: true },
  { chave: 'licitacoes', rotulo: 'Licitações', icone: '⚖️', href: 'licitacoes.html' },
  { chave: 'painel',  rotulo: 'Painel',  icone: '\u{1F4CA}', href: 'dashboard.html' },
  { chave: 'buscar',  rotulo: 'Buscar',  icone: '\u{1F50E}', href: 'pesquisa.html' }
];

export function montarNavegacao(ativa) {
  if (document.querySelector('.nav-principal')) return; // idempotente
  const nav = document.createElement('nav');
  nav.className = 'nav-principal';
  nav.setAttribute('aria-label', 'Navegação principal');
  nav.innerHTML = ABAS.map(a => {
    const classe = 'nav-principal__item'
      + (a.chave === ativa ? ' nav-principal__item--ativo' : '')
      + (a.destaque ? ' nav-principal__item--destaque' : '');
    const atual = a.chave === ativa ? ' aria-current="page"' : '';
    return `<a class="${classe}" href="./${a.href}"${atual}>`
      + `<span class="nav-principal__icone" aria-hidden="true">${a.icone}</span>`
      + `<span class="nav-principal__rotulo">${escapeHtml(a.rotulo)}</span></a>`;
  }).join('');

  // Insere logo após o cabeçalho (fica no topo no desktop); no mobile o CSS
  // a fixa no rodapé. Fallback: fim do body.
  const header = document.querySelector('.app-header');
  if (header) header.insertAdjacentElement('afterend', nav);
  else document.body.appendChild(nav);
  document.body.classList.add('com-nav');
}
