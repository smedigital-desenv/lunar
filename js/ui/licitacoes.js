// =====================================================================
// licitacoes.js — lista de processos: tabela ordenável por coluna no
// desktop (como planilha), cartões compactos no celular. Com ~centenas
// de processos, busca TUDO uma vez (RLS filtra) e filtra/ordena/pagina
// no navegador; se a base chegar a milhares, voltar à paginação servida.
// Filtros de URL: ?categoria= &fase= &prioridade= &parados=1 &busca=
// =====================================================================

import './filtros-exp.js';
import { escapeHtml, fmtData } from './componentes.js';
import {
  ROTULO_CATEGORIA, ROTULO_PRIORIDADE_LIC, COR_PRIORIDADE,
  estaParado, EXEMPLO_FASES, EXEMPLO_PROCESSOS
} from './licitacoes-comum.js';
import * as demo from './demo.js';
import { abrirModalProcesso } from './modal-processo.js';

const POR_PAGINA = 20;

// O modal do processo avisa quando gravou algo; ao fechar, recarregamos.
let listaSuja = false;
window.marcarListaSuja = () => { listaSuja = true; };

async function abrirProcesso(href) {
  abrirModalProcesso(href, async () => {
    if (!listaSuja) return;
    listaSuja = false;
    try { await carregarTudo(); } catch (e) { console.error(e); }
    atualizar();
  });
}

const url = new URLSearchParams(location.search);
const estado = {
  categoria: url.get('categoria') || '',
  faseId: url.get('fase') || '',
  prioridade: url.get('prioridade') || '',
  busca: url.get('busca') || '',
  soParados: url.get('parados') === '1',
  ordem: 'atualizado', asc: false,
  pagina: 1
};
let feriados = new Set();
let todos = null;          // cache da carga única

// Colunas ordenáveis (rótulo + extrator do valor de comparação).
const COLUNAS = [
  ['numero', 'Número', p => p.numero],
  ['objeto', 'Objeto', p => (p.objeto || '').toLowerCase()],
  ['fase', 'Fase', p => p.fase?.ordem ?? 999],
  ['prioridade', 'Prioridade', p => p.prioridade],
  ['categoria', 'Categoria', p => p.categoria],
  ['solicitante', 'Solicitante', p => p.unidade?.sigla ?? ''],
  ['local', 'Local', p => p.local?.sigla ?? ''],
  ['atualizado', 'Atualizado', p => p.ultima_movimentacao_em ?? '']
];

async function carregarTudo() {
  const dados = await demo.carregar(
    async () => {
      const s = await import('../services/licitacoes.js');
      const [fases, fer, tudo] = await Promise.all([
        s.listarFases(), s.listarFeriados(),
        s.listarProcessos({ pagina: 1, porPagina: 1000 })
      ]);
      return { fases, feriados: fer, processos: tudo.itens };
    },
    () => ({ fases: EXEMPLO_FASES, feriados: [], processos: EXEMPLO_PROCESSOS })
  );
  feriados = new Set(dados.feriados);
  todos = dados.processos;
  const sel = document.getElementById('f-fase');
  sel.innerHTML = '<option value="">Todas as fases</option>'
    + dados.fases.map(f =>
      `<option value="${escapeHtml(f.id)}">${escapeHtml(f.nome)}</option>`).join('');
  sel.value = estado.faseId;
  document.getElementById('f-categoria').value = estado.categoria;
  document.getElementById('f-prioridade').value = estado.prioridade;
  document.getElementById('f-busca').value = estado.busca;
  pintarParados();
  return dados.demo;
}

function selecionar() {
  const b = estado.busca.trim().toLowerCase();
  const filtrados = todos.filter(p =>
    (!estado.categoria || p.categoria === estado.categoria)
    && (!estado.faseId || (p.fase_id ?? p.fase?.id) === estado.faseId)
    && (!estado.prioridade || p.prioridade === estado.prioridade)
    && (!estado.soParados || estaParado(p, feriados))
    && (!b || [p.objeto, p.numero, p.numero_requisicao, p.numero_processo_compra,
               p.numero_pregao, p.numero_processo_solar]
          .some(v => v && String(v).toLowerCase().includes(b))));
  const col = COLUNAS.find(([c]) => c === estado.ordem) ?? COLUNAS[7];
  const valor = col[2];
  filtrados.sort((a, z) => {
    const va = valor(a), vz = valor(z);
    const cmp = va < vz ? -1 : va > vz ? 1 : 0;
    return estado.asc ? cmp : -cmp;
  });
  return filtrados;
}

const chips = (p) => `
  <span class="badge-chip badge-situacao badge-situacao--em_andamento">${escapeHtml(p.fase?.nome ?? '—')}</span>
  <span class="badge-chip badge-prioridade badge-prioridade--${COR_PRIORIDADE[p.prioridade] ?? 'normal'}">${escapeHtml(ROTULO_PRIORIDADE_LIC[p.prioridade] ?? p.prioridade)}</span>`;

function cartao(p) {
  const meta = [p.unidade?.sigla, p.local?.sigla, fmtData(p.ultima_movimentacao_em)]
    .filter(Boolean).join(' · ');
  return `<a class="cartao cartao--compacto d-block text-decoration-none text-reset"
      href="./processo-licitacao.html?id=${encodeURIComponent(p.id)}">
    <div class="compacto__linha1">
      <span class="demanda-cabecalho__numero">${escapeHtml(p.numero)}</span>
      <span class="compacto__objeto">${escapeHtml(p.objeto)}</span>
    </div>
    <div class="compacto__linha2">
      ${chips(p)}
      <span class="badge-chip">${escapeHtml(ROTULO_CATEGORIA[p.categoria] ?? p.categoria)}</span>
      ${estaParado(p, feriados) ? '<span class="badge-chip badge-prioridade badge-prioridade--urgente">Parado</span>' : ''}
      <span class="texto-silencioso small ms-auto">${escapeHtml(meta)}</span>
    </div>
  </a>`;
}

function linhaTabela(p) {
  const parado = estaParado(p, feriados);
  return `<tr data-href="./processo-licitacao.html?id=${encodeURIComponent(p.id)}">
    <td class="demanda-cabecalho__numero">${escapeHtml(p.numero)}</td>
    <td class="tabela-lic__objeto">${escapeHtml(p.objeto)}</td>
    <td>${escapeHtml(p.fase?.nome ?? '—')}</td>
    <td><span class="badge-chip badge-prioridade badge-prioridade--${COR_PRIORIDADE[p.prioridade] ?? 'normal'}">${escapeHtml(ROTULO_PRIORIDADE_LIC[p.prioridade] ?? p.prioridade)}</span></td>
    <td>${escapeHtml(ROTULO_CATEGORIA[p.categoria] ?? p.categoria)}</td>
    <td>${escapeHtml(p.unidade?.sigla ?? '—')}</td>
    <td>${escapeHtml(p.local?.sigla ?? '—')}</td>
    <td class="text-nowrap">${escapeHtml(fmtData(p.ultima_movimentacao_em))}
      ${parado ? ' <span class="badge-chip badge-prioridade badge-prioridade--urgente">Parado</span>' : ''}</td>
  </tr>`;
}

function tabela(itens) {
  const th = COLUNAS.map(([c, rotulo]) => {
    const ativa = estado.ordem === c;
    const seta = ativa ? (estado.asc ? ' ▲' : ' ▼') : '';
    return `<th><button type="button" class="tabela-lic__ordenar${ativa ? ' tabela-lic__ordenar--ativa' : ''}"
      data-ordem="${c}">${escapeHtml(rotulo)}${seta}</button></th>`;
  }).join('');
  return `<div class="table-responsive d-none d-md-block">
    <table class="table table-hover align-middle tabela-lic">
      <thead><tr>${th}</tr></thead>
      <tbody>${itens.map(linhaTabela).join('')}</tbody>
    </table></div>`;
}

function pintarParados() {
  const b = document.getElementById('f-parados');
  b.classList.toggle('btn-danger', estado.soParados);
  b.classList.toggle('btn-outline-danger', !estado.soParados);
}

function atualizar() {
  const itens = selecionar();
  const paginas = Math.max(1, Math.ceil(itens.length / POR_PAGINA));
  estado.pagina = Math.min(estado.pagina, paginas);
  const de = (estado.pagina - 1) * POR_PAGINA;
  const pagina = itens.slice(de, de + POR_PAGINA);

  document.getElementById('lista').innerHTML = pagina.length
    ? tabela(pagina) + `<div class="d-md-none">${pagina.map(cartao).join('')}</div>`
    : '<p class="texto-silencioso">Nenhum processo com esses filtros.</p>';

  document.getElementById('paginacao').innerHTML = `
    <button class="btn btn-sm btn-outline-secondary" data-pag="prev" ${estado.pagina <= 1 ? 'disabled' : ''}>Anterior</button>
    <span class="texto-silencioso small">Página ${estado.pagina} de ${paginas} · ${itens.length} processo(s)</span>
    <button class="btn btn-sm btn-outline-secondary" data-pag="next" ${estado.pagina >= paginas ? 'disabled' : ''}>Próxima</button>`;
}

// ------------------------------------------------------------- Eventos
for (const [id, chave] of [['f-categoria', 'categoria'], ['f-fase', 'faseId'], ['f-prioridade', 'prioridade']]) {
  document.getElementById(id).addEventListener('change', (e) => {
    estado[chave] = e.target.value;
    estado.pagina = 1;
    atualizar();
  });
}
let timerBusca;
document.getElementById('f-busca').addEventListener('input', (e) => {
  clearTimeout(timerBusca);
  timerBusca = setTimeout(() => {
    estado.busca = e.target.value; estado.pagina = 1; atualizar();
  }, 250);
});
document.getElementById('f-parados').addEventListener('click', () => {
  estado.soParados = !estado.soParados;
  estado.pagina = 1;
  pintarParados();
  atualizar();
});
document.getElementById('filtros').addEventListener('submit', e => e.preventDefault());
document.getElementById('paginacao').addEventListener('click', (e) => {
  const b = e.target.closest('[data-pag]');
  if (!b || b.disabled) return;
  estado.pagina += b.dataset.pag === 'next' ? 1 : -1;
  atualizar();
});
// Ordenação pelo cabeçalho (repetir a coluna inverte a direção); linha
// da tabela e cartão abrem o processo em MODAL sobre a lista (Ctrl/⌘/
// botão do meio no cartão seguem abrindo em aba nova).
document.getElementById('lista').addEventListener('click', (e) => {
  const th = e.target.closest('[data-ordem]');
  if (th) {
    const c = th.dataset.ordem;
    estado.asc = estado.ordem === c ? !estado.asc : true;
    estado.ordem = c;
    atualizar();
    return;
  }
  const tr = e.target.closest('tr[data-href]');
  if (tr) { abrirProcesso(tr.dataset.href); return; }
  const cartaoEl = e.target.closest('a.cartao--compacto');
  if (cartaoEl && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
    e.preventDefault();
    abrirProcesso(cartaoEl.getAttribute('href'));
  }
});

(async () => {
  const carr = document.getElementById('carregando');
  try {
    const emDemo = await carregarTudo();
    document.getElementById('tarja-demo').hidden = !emDemo;
  } catch (e) {
    console.error(e);
    carr.textContent = `Erro ao carregar os processos: ${e.message || e}`;
    return;
  }
  carr.hidden = true;
  atualizar();
})();

import { montarSino } from './notificacoes.js';
import { iniciarSessao } from './sessao.js';
import { montarNavegacao } from './navegacao.js';
montarSino('sino-notificacoes');
iniciarSessao();
montarNavegacao('licitacoes');
