// =====================================================================
// licitacoes.js — lista de processos de licitação em linhas compactas,
// com filtros (também via URL, para os cliques do painel), busca e
// alerta de "parado". Dados via js/services/licitacoes.js; RLS decide.
// Filtros de URL: ?categoria= &fase= &prioridade= &parados=1 &busca=
// =====================================================================

import { escapeHtml, fmtData } from './componentes.js';
import {
  ROTULO_CATEGORIA, ROTULO_PRIORIDADE_LIC, COR_PRIORIDADE,
  estaParado, EXEMPLO_FASES, EXEMPLO_PROCESSOS
} from './licitacoes-comum.js';
import * as demo from './demo.js';

const POR_PAGINA = 15;

const url = new URLSearchParams(location.search);
const estado = {
  categoria: url.get('categoria') || '',
  faseId: url.get('fase') || '',
  prioridade: url.get('prioridade') || '',
  busca: url.get('busca') || '',
  soParados: url.get('parados') === '1',
  pagina: 1
};
let feriados = new Set();

async function carregarFases() {
  const dados = await demo.carregar(
    async () => {
      const s = await import('../services/licitacoes.js');
      const [fases, fer] = await Promise.all([s.listarFases(), s.listarFeriados()]);
      return { fases, feriados: fer };
    },
    () => ({ fases: EXEMPLO_FASES, feriados: [] })
  );
  feriados = new Set(dados.feriados);
  const sel = document.getElementById('f-fase');
  sel.innerHTML = '<option value="">Todas as fases</option>'
    + dados.fases.map(f =>
      `<option value="${escapeHtml(f.id)}">${escapeHtml(f.nome)}</option>`).join('');
  // Reflete os filtros vindos da URL nos controles.
  sel.value = estado.faseId;
  document.getElementById('f-categoria').value = estado.categoria;
  document.getElementById('f-prioridade').value = estado.prioridade;
  document.getElementById('f-busca').value = estado.busca;
  document.getElementById('f-parados').classList.toggle('btn-danger', estado.soParados);
  document.getElementById('f-parados').classList.toggle('btn-outline-danger', !estado.soParados);
}

function filtrarExemplo() {
  const b = estado.busca.toLowerCase();
  return EXEMPLO_PROCESSOS.filter(p =>
    (!estado.categoria || p.categoria === estado.categoria)
    && (!estado.faseId || p.fase.id === estado.faseId)
    && (!estado.prioridade || p.prioridade === estado.prioridade)
    && (!b || p.objeto.toLowerCase().includes(b) || p.numero.toLowerCase().includes(b)));
}

// "Só parados" é decidido no navegador (depende de feriados + prazo da
// fase), então nesse modo a busca traz a página inteira e pagina aqui.
async function carregar() {
  return demo.carregar(
    async () => {
      const s = await import('../services/licitacoes.js');
      const base = {
        categoria: estado.categoria || null,
        faseId: estado.faseId || null,
        prioridade: estado.prioridade || null,
        busca: estado.busca
      };
      if (!estado.soParados) {
        return s.listarProcessos({ ...base, pagina: estado.pagina, porPagina: POR_PAGINA });
      }
      const tudo = await s.listarProcessos({ ...base, pagina: 1, porPagina: 1000 });
      const parados = tudo.itens.filter(p => estaParado(p, feriados));
      const de = (estado.pagina - 1) * POR_PAGINA;
      return { itens: parados.slice(de, de + POR_PAGINA), total: parados.length };
    },
    () => {
      let itens = filtrarExemplo();
      if (estado.soParados) itens = itens.filter(p => estaParado(p, feriados));
      const de = (estado.pagina - 1) * POR_PAGINA;
      return { itens: itens.slice(de, de + POR_PAGINA), total: itens.length };
    }
  );
}

// Linha compacta: número + objeto na primeira linha; chips e meta na
// segunda. ~3x mais processos por tela que o cartão original.
function renderItem(p) {
  const parado = estaParado(p, feriados);
  const meta = [
    p.unidade?.sigla ?? null,
    p.local?.sigla ?? null,
    fmtData(p.ultima_movimentacao_em)
  ].filter(Boolean).join(' · ');
  return `<a class="cartao cartao--compacto d-block text-decoration-none text-reset"
      href="./processo-licitacao.html?id=${encodeURIComponent(p.id)}">
    <div class="compacto__linha1">
      <span class="demanda-cabecalho__numero">${escapeHtml(p.numero)}</span>
      <span class="compacto__objeto">${escapeHtml(p.objeto)}</span>
    </div>
    <div class="compacto__linha2">
      <span class="badge-chip badge-situacao badge-situacao--em_andamento">${escapeHtml(p.fase?.nome ?? '—')}</span>
      <span class="badge-chip badge-prioridade badge-prioridade--${COR_PRIORIDADE[p.prioridade] ?? 'normal'}">${escapeHtml(ROTULO_PRIORIDADE_LIC[p.prioridade] ?? p.prioridade)}</span>
      <span class="badge-chip">${escapeHtml(ROTULO_CATEGORIA[p.categoria] ?? p.categoria)}</span>
      ${parado ? '<span class="badge-chip badge-prioridade badge-prioridade--urgente">Parado</span>' : ''}
      <span class="texto-silencioso small ms-auto">${escapeHtml(meta)}</span>
    </div>
  </a>`;
}

async function atualizar() {
  const lista = document.getElementById('lista');
  const pag = document.getElementById('paginacao');
  const carr = document.getElementById('carregando');
  carr.hidden = false;
  let dados;
  try {
    dados = await carregar();
  } catch (e) {
    console.error(e);
    carr.textContent = `Erro ao carregar os processos: ${e.message || e}`;
    lista.innerHTML = ''; pag.innerHTML = '';
    return;
  }
  document.getElementById('tarja-demo').hidden = !dados.demo;
  lista.innerHTML = dados.itens.length
    ? dados.itens.map(renderItem).join('')
    : '<p class="texto-silencioso">Nenhum processo com esses filtros.</p>';

  const paginas = Math.max(1, Math.ceil(dados.total / POR_PAGINA));
  pag.innerHTML = `
    <button class="btn btn-sm btn-outline-secondary" data-pag="prev" ${estado.pagina <= 1 ? 'disabled' : ''}>Anterior</button>
    <span class="texto-silencioso small">Página ${estado.pagina} de ${paginas} · ${dados.total} processo(s)</span>
    <button class="btn btn-sm btn-outline-secondary" data-pag="next" ${estado.pagina >= paginas ? 'disabled' : ''}>Próxima</button>`;
  carr.hidden = true;
}

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
    estado.busca = e.target.value;
    estado.pagina = 1;
    atualizar();
  }, 350);
});
document.getElementById('f-parados').addEventListener('click', (e) => {
  estado.soParados = !estado.soParados;
  estado.pagina = 1;
  e.target.classList.toggle('btn-danger', estado.soParados);
  e.target.classList.toggle('btn-outline-danger', !estado.soParados);
  atualizar();
});
document.getElementById('filtros').addEventListener('submit', e => e.preventDefault());

document.getElementById('paginacao').addEventListener('click', (e) => {
  const b = e.target.closest('[data-pag]');
  if (!b || b.disabled) return;
  estado.pagina += b.dataset.pag === 'next' ? 1 : -1;
  atualizar();
});

carregarFases().then(atualizar);

import { montarSino } from './notificacoes.js';
import { iniciarSessao } from './sessao.js';
import { montarNavegacao } from './navegacao.js';
montarSino('sino-notificacoes');
iniciarSessao();
montarNavegacao('licitacoes');
