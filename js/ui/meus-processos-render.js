// =====================================================================
// meus-processos-render.js — colunas e cartão da tela "Meus processos".
// O esqueleto (tabela ordenável + cartões + eventos) mora em
// tabela-processos.js, compartilhado com a tela "Todos".
// Módulo sem efeito colateral: recebe dados e devolve HTML.
// =====================================================================

import { escapeHtml, badgeSituacao, badgePrioridade, badgeSigilo, fmtPrazo } from './componentes.js';

// De quem o processo está esperando. Três estados que não se sobrepõem —
// cada processo é exatamente um deles:
//
//   aguardando_mim     tarefa minha em aberto, ou processo meu sem andamento
//   aguardando_outros  a responsabilidade está com outra pessoa
//   encerrado          o processo foi concluído
//
// Substitui o eixo entrada/saída, que dizia de onde o processo veio e não
// de quem ele espera — e obrigava a inventar 'ambos' para o caso mais comum
// de todos: criar um processo do qual você mesmo é o responsável.
//
// O verbo importa: "aguardando" diz o que falta acontecer. Rótulo de posse
// ("comigo", "com outra pessoa") se lê como propriedade e leva a perguntar
// se o outro tem tarefa — pergunta que a lista não responde nem precisa.
//
// A linha responde UMA pergunta: de quem este processo espera? Por que ele
// está na minha lista (criei, encaminhei, repartir, ou só executei uma
// tarefa nele) é outra pergunta, e o lugar dela seria um filtro — não uma
// quarta etiqueta colorida disputando a mesma leitura.
export const ROTULO_POSSE = {
  aguardando_mim: 'Aguardando minha resposta',
  aguardando_outros: 'Aguardando outras pessoas',
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
  { chave: 'posse', rotulo: 'Aguardando', celula: i => badgePosse(i.posse) },
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
