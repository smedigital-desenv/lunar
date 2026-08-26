// =====================================================================
// meus-processos-render.js — colunas e cartão da tela "Meus processos".
// O esqueleto (tabela ordenável + cartões + eventos) mora em
// tabela-processos.js, compartilhado com a tela "Todos".
// Módulo sem efeito colateral: recebe dados e devolve HTML.
// =====================================================================

import { escapeHtml, badgeSituacao, badgePrioridade, badgeSigilo, fmtPrazo } from './componentes.js';

// Com quem o processo está, do ponto de vista de quem olha. Quatro estados
// que não se sobrepõem — cada processo é exatamente um deles:
//
//   comigo           há trabalho meu em aberto (é a minha fila)
//   com_outro        eu criei, encaminhei ou reparti; a bola está com outra pessoa
//   fiz_minha_parte  executei a tarefa que me deram e nada mais me prende
//   encerrado        o processo foi concluído
//
// Substitui o eixo entrada/saída, que dizia de onde o processo veio e não
// com quem ele está — e obrigava a inventar 'ambos' para o caso mais comum
// de todos: criar um processo do qual você mesmo é o responsável.
export const ROTULO_POSSE = {
  comigo: 'Comigo',
  com_outro: 'Com outra pessoa',
  fiz_minha_parte: 'Já fiz minha parte',
  encerrado: 'Encerrado'
};

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
export const chaveCronograma = (item) => `${item.posse}:${item.demandaId}`;

const lugarCronograma = (item) =>
  `<span class="cronograma-lugar" data-cronograma="${escapeHtml(chaveCronograma(item))}"></span>`;

const badgePosse = (posse) =>
  `<span class="badge-chip badge-posse badge-posse--${escapeHtml(posse)}">`
  + `${escapeHtml(ROTULO_POSSE[posse] ?? posse)}</span>`;

export const COLUNAS = [
  { chave: 'numero', rotulo: 'Número',
    celula: i => `<span class="demanda-cabecalho__numero">${escapeHtml(i.numero)}</span>` },
  { chave: 'titulo', rotulo: 'Título', classe: 'tabela-lista__titulo',
    celula: i => escapeHtml(i.titulo) },
  { chave: 'posse', rotulo: 'Com quem está', celula: i => badgePosse(i.posse) },
  { chave: 'situacao', rotulo: 'Situação', celula: i => badgeSituacao(i.situacao) },
  { chave: 'prioridade', rotulo: 'Prioridade', celula: i => badgePrioridade(i.prioridade) },
  { chave: 'cronograma', rotulo: 'Cronograma', classe: 'tabela-lista__cronograma',
    celula: lugarCronograma },
  { chave: 'prazo', rotulo: 'Prazo', classe: 'text-nowrap',
    celula: i => escapeHtml(fmtPrazo(i.prazo)) }
];

export const linhaClasse = (item) => `linha-posse--${item.posse}`;

export function cartao(item) {
  return `<a class="cartao cartao--compacto cartao-processo cartao-posse--${escapeHtml(item.posse)}
      d-block text-decoration-none text-reset" href="${escapeHtml(item.href)}">
    <div class="compacto__topo">
      <span class="demanda-cabecalho__numero">${escapeHtml(item.numero)}</span>
      ${item.prazo ? `<span class="compacto__prazo">${escapeHtml(fmtPrazo(item.prazo))}</span>` : ''}
    </div>
    <div class="compacto__objeto">${escapeHtml(item.titulo)}</div>
    <div class="compacto__linha2">
      ${badgePosse(item.posse)} ${badgeSituacao(item.situacao)}
      ${badgePrioridade(item.prioridade)} ${item.sigilo ? badgeSigilo(item.sigilo) : ''}
    </div>
    <div class="compacto__cronograma">${lugarCronograma(item)}</div>
  </a>`;
}
