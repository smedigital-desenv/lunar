// =====================================================================
// caixa.js — lógica compartilhada das caixas de entrada e de saída.
// Filtros + paginação + render da lista. Reutiliza app.css e componentes.js.
// Cada página (entrada/saída) fornece: título, carregar() e renderItem().
// =====================================================================

import { escapeHtml, badgeSituacao, badgePrioridade, badgeSigilo } from './componentes.js';

// Filtros do painel. "urgentes" filtra por PRIORIDADE, não por situação.
export const FILTROS = [
  ['todos', 'Todos'], ['pendentes', 'Pendentes'], ['em_andamento', 'Em andamento'],
  ['urgentes', 'Urgentes'], ['encerrados', 'Encerrados']
];
const PREDICADOS = {
  todos: () => true,
  pendentes: i => ['aberta', 'aguardando_complementacao', 'devolvida'].includes(i.situacao),
  em_andamento: i => ['em_andamento', 'reaberta'].includes(i.situacao),
  urgentes: i => i.prioridade === 'urgente',
  encerrados: i => i.situacao === 'concluida'
};

// Filtro + paginação client-side (usado no modo de exemplo).
export function filtrarPaginar(itens, filtro, pagina, porPagina) {
  const filtrados = itens.filter(PREDICADOS[filtro] || PREDICADOS.todos);
  const de = (pagina - 1) * porPagina;
  return { itens: filtrados.slice(de, de + porPagina), total: filtrados.length };
}

// Cartão de item da lista (reutiliza classes do app.css + utilitários Bootstrap).
export function cartaoLista({ href, numero, titulo, situacao, prioridade, sigilo, meta }) {
  return `<a class="cartao d-block text-decoration-none text-reset" href="${escapeHtml(href)}">
    <div class="demanda-cabecalho__numero">${escapeHtml(numero)}</div>
    <div class="fw-semibold mb-2">${escapeHtml(titulo)}</div>
    <div class="demanda-cabecalho__chips mb-1">
      ${badgeSituacao(situacao)} ${badgePrioridade(prioridade)} ${badgeSigilo(sigilo)}
    </div>
    ${meta ? `<div class="texto-silencioso small">${escapeHtml(meta)}</div>` : ''}
  </a>`;
}

// Inicializa a caixa. config = { titulo, porPagina, carregar(filtro,pagina,porPagina)
// → {itens,total,demo}, renderItem(item)→html }.
export async function iniciarCaixa(config) {
  const porPagina = config.porPagina || 10;
  const estado = { filtro: 'todos', pagina: 1 };

  const elFiltros = document.getElementById('filtros');
  const elLista = document.getElementById('lista');
  const elPag = document.getElementById('paginacao');
  const elCarregando = document.getElementById('carregando');
  const elTarja = document.getElementById('tarja-demo');

  document.getElementById('titulo-pagina').textContent = config.titulo;
  document.title = `${config.titulo} — SME Ribeirão Preto`;

  const renderFiltros = () => {
    elFiltros.innerHTML = FILTROS.map(([c, r]) =>
      `<button class="btn btn-sm ${c === estado.filtro ? 'btn-primary' : 'btn-outline-primary'}"`
      + ` data-filtro="${c}">${r}</button>`).join('');
  };

  async function atualizar() {
    elCarregando.hidden = false;
    let dados;
    try {
      dados = await config.carregar(estado.filtro, estado.pagina, porPagina);
    } catch (e) {
      console.error(e);
      elCarregando.textContent = 'Erro ao carregar a lista.';
      return;
    }
    const { itens, total, demo } = dados;
    elTarja.hidden = !demo;
    elLista.innerHTML = itens.length
      ? itens.map(config.renderItem).join('')
      : '<p class="texto-silencioso">Nenhum item neste filtro.</p>';

    const paginas = Math.max(1, Math.ceil(total / porPagina));
    elPag.innerHTML = `
      <button class="btn btn-sm btn-outline-secondary" data-pag="prev"
        ${estado.pagina <= 1 ? 'disabled' : ''}>Anterior</button>
      <span class="texto-silencioso small">Página ${estado.pagina} de ${paginas} · ${total} item(ns)</span>
      <button class="btn btn-sm btn-outline-secondary" data-pag="next"
        ${estado.pagina >= paginas ? 'disabled' : ''}>Próxima</button>`;
    elCarregando.hidden = true;
  }

  elFiltros.addEventListener('click', (e) => {
    const b = e.target.closest('[data-filtro]');
    if (!b) return;
    estado.filtro = b.dataset.filtro;
    estado.pagina = 1;
    renderFiltros();
    atualizar();
  });
  elPag.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pag]');
    if (!b || b.disabled) return;
    estado.pagina += b.dataset.pag === 'next' ? 1 : -1;
    atualizar();
  });

  // Permite que o painel de detalhe (iframe) peça a atualização da lista
  // após uma tramitação, sem precisar de F5.
  window.recarregarLista = () => atualizar();

  renderFiltros();
  await atualizar();
}
