// =====================================================================
// meus-processos-render.js — colunas e cartão da tela "Meus processos".
// O esqueleto (tabela ordenável + cartões + eventos) mora em
// tabela-processos.js, compartilhado com a tela "Todos".
// Módulo sem efeito colateral: recebe dados e devolve HTML.
// =====================================================================

import { escapeHtml, badgeSituacao, badgePrioridade, badgeSigilo, fmtPrazo } from './componentes.js';

// Fluxo do processo em relação a quem olha. Uma demanda pode ser as duas
// coisas (eu criei E estou responsável), daí 'ambos'.
export const ROTULO_FLUXO = { entrada: 'Entrada', saida: 'Saída', ambos: 'Entrada e saída' };

// Marcos = tarefas de 1º nível ainda em aberto. Chegam depois da lista
// (uma consulta por processo visível), então o lugar fica reservado no
// HTML e é preenchido quando a resposta volta.
//
// Vazio devolve vazio: na tabela o CSS põe um traço para a coluna não
// desalinhar; no cartão o lugar simplesmente some, em vez de virar ruído.
export function renderCronograma(marcos) {
  if (!marcos?.length) return '';
  return marcos.map(m =>
    `<span class="marco" title="${escapeHtml(m.titulo)}">
      <span class="marco__nome">${escapeHtml(m.titulo)}</span>
      <span class="marco__data">${escapeHtml(fmtPrazo(m.prazo))}</span>
    </span>`).join('');
}

// A mesma chave endereça o lugar do cronograma na linha da tabela E no
// cartão: os dois convivem no DOM (um escondido por CSS conforme a
// largura), então quem preenche precisa alcançar os dois.
export const chaveCronograma = (item) => `${item.fluxo}:${item.demandaId}`;

const lugarCronograma = (item) =>
  `<span class="cronograma-lugar" data-cronograma="${escapeHtml(chaveCronograma(item))}"></span>`;

const badgeFluxo = (fluxo) =>
  `<span class="badge-chip badge-fluxo badge-fluxo--${escapeHtml(fluxo)}">`
  + `${escapeHtml(ROTULO_FLUXO[fluxo] ?? fluxo)}</span>`;

export const COLUNAS = [
  { chave: 'numero', rotulo: 'Número',
    celula: i => `<span class="demanda-cabecalho__numero">${escapeHtml(i.numero)}</span>` },
  { chave: 'titulo', rotulo: 'Título', classe: 'tabela-lista__titulo',
    celula: i => escapeHtml(i.titulo) },
  { chave: 'fluxo', rotulo: 'Fluxo', celula: i => badgeFluxo(i.fluxo) },
  { chave: 'situacao', rotulo: 'Situação', celula: i => badgeSituacao(i.situacao) },
  { chave: 'prioridade', rotulo: 'Prioridade', celula: i => badgePrioridade(i.prioridade) },
  { chave: 'cronograma', rotulo: 'Cronograma', classe: 'tabela-lista__cronograma',
    celula: lugarCronograma },
  { chave: 'prazo', rotulo: 'Prazo', classe: 'text-nowrap',
    celula: i => escapeHtml(fmtPrazo(i.prazo)) }
];

export const linhaClasse = (item) => `linha-fluxo--${item.fluxo}`;

export function cartao(item) {
  return `<a class="cartao cartao--compacto cartao-processo cartao-fluxo--${escapeHtml(item.fluxo)}
      d-block text-decoration-none text-reset" href="${escapeHtml(item.href)}">
    <div class="compacto__linha1">
      <span class="demanda-cabecalho__numero">${escapeHtml(item.numero)}</span>
      <span class="compacto__objeto">${escapeHtml(item.titulo)}</span>
    </div>
    <div class="compacto__linha2">
      ${badgeFluxo(item.fluxo)} ${badgeSituacao(item.situacao)}
      ${badgePrioridade(item.prioridade)} ${item.sigilo ? badgeSigilo(item.sigilo) : ''}
      <span class="texto-silencioso small ms-auto">Prazo: ${escapeHtml(fmtPrazo(item.prazo))}</span>
    </div>
    <div class="compacto__cronograma">${lugarCronograma(item)}</div>
  </a>`;
}
