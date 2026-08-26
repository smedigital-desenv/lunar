// =====================================================================
// tabela-processos.js — tabela ordenável (desktop) + cartões compactos
// (celular) para listas de demandas. Módulo sem efeito colateral.
//
// Nasceu do render de "Meus processos" quando a tela "Todos" passou a
// usar o mesmo formato: as duas mudam só nas COLUNAS e no miolo do
// cartão, então o esqueleto virou um lugar só.
//
// Tabela e cartões saem JUNTOS no HTML; o CSS mostra um ou outro pela
// largura. Quem preenche algo depois da carga (o cronograma, por
// exemplo) precisa lembrar que a mesma chave existe DUAS vezes no DOM.
// =====================================================================

import { escapeHtml } from './componentes.js';

// `colunas`: [{ chave, rotulo, celula(item) -> html, classe? }]
//   · `chave` também é o campo de ordenação (o clique no cabeçalho a
//     devolve para a tela, que decide como ordenar).
// `cartao(item) -> html`: o miolo do cartão do celular.
// `linhaClasse(item) -> string`: classe extra da <tr> (faixa de cor).
export function renderLista(itens, { colunas, cartao, linhaClasse }, ordem, asc) {
  const th = colunas.map(c => {
    const ativa = ordem === c.chave;
    const seta = ativa ? (asc ? ' ▲' : ' ▼') : '';
    return `<th><button type="button" class="tabela-lic__ordenar${ativa ? ' tabela-lic__ordenar--ativa' : ''}"
      data-ordem="${escapeHtml(c.chave)}">${escapeHtml(c.rotulo)}${seta}</button></th>`;
  }).join('');

  const linhas = itens.map(item => {
    const tds = colunas.map(c =>
      `<td${c.classe ? ` class="${escapeHtml(c.classe)}"` : ''}>${c.celula(item)}</td>`).join('');
    const extra = linhaClasse ? ` ${escapeHtml(linhaClasse(item))}` : '';
    return `<tr data-href="${escapeHtml(item.href)}" class="linha-posse${extra}">${tds}</tr>`;
  }).join('');

  return `<div class="table-responsive d-none d-md-block">
      <table class="table table-hover align-middle tabela-lic tabela-lista">
        <thead><tr>${th}</tr></thead>
        <tbody>${linhas}</tbody>
      </table></div>
    <div class="d-md-none">${itens.map(cartao).join('')}</div>`;
}

// Paginação padrão das listas.
export function renderPaginacao(pagina, paginas, total, rotulo = 'processo(s)') {
  return `
    <button class="btn btn-sm btn-outline-secondary" data-pag="prev"
      ${pagina <= 1 ? 'disabled' : ''}>Anterior</button>
    <span class="texto-silencioso small">Página ${pagina} de ${paginas} · ${total} ${escapeHtml(rotulo)}</span>
    <button class="btn btn-sm btn-outline-secondary" data-pag="next"
      ${pagina >= paginas ? 'disabled' : ''}>Próxima</button>`;
}

// Liga ordenação do cabeçalho e abertura do detalhe em modal.
// `aoOrdenar(chave)` e `aoAbrir(href)` ficam com a tela.
export function ligarEventos(elLista, { aoOrdenar, aoAbrir }) {
  elLista.addEventListener('click', (e) => {
    const th = e.target.closest('[data-ordem]');
    if (th) { aoOrdenar(th.dataset.ordem); return; }

    const tr = e.target.closest('tr[data-href]');
    if (tr) { aoAbrir(tr.dataset.href); return; }

    // Ctrl/⌘/Shift no cartão seguem abrindo em aba nova.
    const cartaoEl = e.target.closest('a.cartao-processo');
    if (cartaoEl && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      e.preventDefault();
      aoAbrir(cartaoEl.getAttribute('href'));
    }
  });
}
