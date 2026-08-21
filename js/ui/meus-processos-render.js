// =====================================================================
// meus-processos-render.js — desenho da lista de "Meus processos".
// Tabela ordenável (desktop) e cartões compactos (celular), no mesmo
// padrão da lista de Licitações. Módulo sem efeito colateral: só recebe
// dados e devolve HTML.
// =====================================================================

import { escapeHtml, badgeSituacao, badgePrioridade, badgeSigilo, fmtPrazo } from './componentes.js';

// Fluxo do processo em relação a quem olha. Uma demanda pode ser as duas
// coisas (eu criei E estou responsável), daí 'ambos'.
export const ROTULO_FLUXO = { entrada: 'Entrada', saida: 'Saída', ambos: 'Entrada e saída' };

export const COLUNAS = [
  ['numero', 'Número'], ['titulo', 'Título'], ['fluxo', 'Fluxo'],
  ['situacao', 'Situação'], ['prioridade', 'Prioridade'],
  ['cronograma', 'Cronograma'], ['prazo', 'Prazo']
];

// Marcos = tarefas de 1º nível ainda em aberto. Chegam depois da lista
// (uma consulta por processo visível), então o lugar fica reservado no
// HTML e é preenchido quando a resposta volta.
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

function linhaTabela(item) {
  return `<tr data-href="${escapeHtml(item.href)}" class="linha-fluxo linha-fluxo--${escapeHtml(item.fluxo)}">
    <td class="demanda-cabecalho__numero">${escapeHtml(item.numero)}</td>
    <td class="tabela-lista__titulo">${escapeHtml(item.titulo)}</td>
    <td>${badgeFluxo(item.fluxo)}</td>
    <td>${badgeSituacao(item.situacao)}</td>
    <td>${badgePrioridade(item.prioridade)}</td>
    <td class="tabela-lista__cronograma">${lugarCronograma(item)}</td>
    <td class="text-nowrap">${escapeHtml(fmtPrazo(item.prazo))}</td>
  </tr>`;
}

function cartao(item) {
  return `<a class="cartao cartao--compacto cartao-fluxo cartao-fluxo--${escapeHtml(item.fluxo)}
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

function tabela(itens, ordem, asc) {
  const th = COLUNAS.map(([c, rotulo]) => {
    const ativa = ordem === c;
    const seta = ativa ? (asc ? ' ▲' : ' ▼') : '';
    return `<th><button type="button" class="tabela-lic__ordenar${ativa ? ' tabela-lic__ordenar--ativa' : ''}"
      data-ordem="${c}">${escapeHtml(rotulo)}${seta}</button></th>`;
  }).join('');
  return `<div class="table-responsive d-none d-md-block">
    <table class="table table-hover align-middle tabela-lic tabela-lista">
      <thead><tr>${th}</tr></thead>
      <tbody>${itens.map(linhaTabela).join('')}</tbody>
    </table></div>`;
}

// Tabela e cartões saem juntos; o CSS mostra um ou outro pela largura.
export function renderLista(itens, ordem, asc) {
  return tabela(itens, ordem, asc)
    + `<div class="d-md-none">${itens.map(cartao).join('')}</div>`;
}
