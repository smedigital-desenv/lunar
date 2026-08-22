// =====================================================================
// lista-render.js — colunas e cartão da tela "Todos" (drill-down do KPI).
// O esqueleto (tabela ordenável + cartões + eventos) vem de
// tabela-processos.js, o mesmo de "Meus processos".
// Módulo sem efeito colateral.
// =====================================================================

import { escapeHtml, badgeSituacao, badgePrioridade, badgeSigilo, fmtPrazo } from './componentes.js';

// Onde "Meus processos" mostra o fluxo (entrada/saída), aqui o eixo é a
// unidade: quem vê tudo precisa saber de quem é cada demanda. Mostra a
// secretaria (subsecretaria ancestral) e a sigla da unidade em si.
const chipUnidade = (i) => {
  const sec = i.secretaria_sigla || '—';
  const sub = i.unidade_sigla && i.unidade_sigla !== i.secretaria_sigla
    ? ` <span class="texto-silencioso">· ${escapeHtml(i.unidade_sigla)}</span>` : '';
  return `<span class="badge-chip" title="${escapeHtml(i.unidade_nome || '')}">`
    + `${escapeHtml(sec)}</span>${sub}`;
};

export const COLUNAS = [
  { chave: 'numero', rotulo: 'Número',
    celula: i => `<span class="demanda-cabecalho__numero">${escapeHtml(i.numero)}</span>` },
  { chave: 'titulo', rotulo: 'Título', classe: 'tabela-lista__titulo',
    celula: i => escapeHtml(i.titulo) },
  { chave: 'secretaria_sigla', rotulo: 'Secretaria', celula: chipUnidade },
  { chave: 'situacao', rotulo: 'Situação', celula: i => badgeSituacao(i.situacao) },
  { chave: 'prioridade', rotulo: 'Prioridade', celula: i => badgePrioridade(i.prioridade) },
  { chave: 'prazo', rotulo: 'Prazo', classe: 'text-nowrap',
    celula: i => escapeHtml(fmtPrazo(i.prazo)) }
];

export function cartao(item) {
  return `<a class="cartao cartao--compacto cartao-processo d-block text-decoration-none text-reset"
      href="${escapeHtml(item.href)}">
    <div class="compacto__topo">
      <span class="demanda-cabecalho__numero">${escapeHtml(item.numero)}</span>
      ${item.prazo ? `<span class="compacto__prazo">${escapeHtml(fmtPrazo(item.prazo))}</span>` : ''}
    </div>
    <div class="compacto__objeto">${escapeHtml(item.titulo)}</div>
    <div class="compacto__linha2">
      ${chipUnidade(item)} ${badgeSituacao(item.situacao)}
      ${badgePrioridade(item.prioridade)} ${item.sigilo ? badgeSigilo(item.sigilo) : ''}
    </div>
  </a>`;
}
