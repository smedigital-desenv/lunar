// =====================================================================
// licitacoes.js — lista de processos de licitação, com filtros, busca e
// alerta de "parado" (dias úteis sem andamento > prazo da fase atual).
// Dados via js/services/licitacoes.js; visibilidade decidida pelo RLS.
// =====================================================================

import { escapeHtml, fmtData } from './componentes.js';
import * as demo from './demo.js';

const POR_PAGINA = 10;

export const ROTULO_CATEGORIA = {
  almox_sede: 'Almox e Sede', nutricao: 'Nutrição', servicos_obras: 'Serviços e Obras'
};
export const ROTULO_PRIORIDADE_LIC = {
  '1_secretario': '1 - Secretário', '2_alta': '2 - Alta', '3_normal': '3 - Normal'
};
// Reusa as cores dos badges de prioridade das demandas (app.css).
const COR_PRIORIDADE = {
  '1_secretario': 'urgente', '2_alta': 'alta', '3_normal': 'normal'
};

// Dias ÚTEIS entre duas datas (exclusivo no início, inclusivo no fim),
// descontando os feriados cadastrados (regra 8 do CLAUDE.md).
export function diasUteisDesde(inicioIso, feriados) {
  const umDia = 86400000;
  const d = new Date(`${String(inicioIso).slice(0, 10)}T12:00:00`);
  const hoje = new Date(); hoje.setHours(12, 0, 0, 0);
  let n = 0;
  for (let t = d.getTime() + umDia; t <= hoje.getTime(); t += umDia) {
    const dia = new Date(t);
    const semana = dia.getDay();
    const iso = dia.toISOString().slice(0, 10);
    if (semana !== 0 && semana !== 6 && !feriados.has(iso)) n++;
  }
  return n;
}

const EXEMPLO_FASES = [
  { id: 'f1', nome: 'DFD', ordem: 10, desvio: false, prazo_alerta_dias: 10 },
  { id: 'f5', nome: 'Elaborar edital', ordem: 50, desvio: false, prazo_alerta_dias: 10 },
  { id: 'f9', nome: 'Pregão em andamento', ordem: 90, desvio: false, prazo_alerta_dias: 10 },
  { id: 'f14', nome: 'Em execução', ordem: 140, desvio: false, prazo_alerta_dias: 10 },
  { id: 'f90', nome: 'Suspenso', ordem: 900, desvio: true, prazo_alerta_dias: 10 }
];
const EXEMPLO = [
  { id: 'p1', numero: 'LIC-2026-0001', objeto: 'Material escolar – Lista 1', categoria: 'almox_sede', prioridade: '2_alta', fase: EXEMPLO_FASES[3], local: { sigla: 'EDUC-ALMOX' }, unidade: { sigla: 'GCP' }, valor_requisicao: 1114490.20, valor_arrematado: 980210.55, ultima_movimentacao_em: '2026-08-10' },
  { id: 'p2', numero: 'LIC-2026-0002', objeto: 'Uniforme escolar - 2027', categoria: 'almox_sede', prioridade: '1_secretario', fase: EXEMPLO_FASES[1], local: { sigla: 'EDUC-LICITAÇÕES' }, unidade: { sigla: 'GCP' }, valor_requisicao: 6363000, valor_arrematado: null, ultima_movimentacao_em: '2026-07-20' },
  { id: 'p3', numero: 'LIC-2026-0003', objeto: 'Gêneros alimentícios — hortifrúti', categoria: 'nutricao', prioridade: '2_alta', fase: EXEMPLO_FASES[2], local: { sigla: 'ADM-222' }, unidade: { sigla: 'GNA' }, valor_requisicao: 2861416.68, valor_arrematado: null, ultima_movimentacao_em: '2026-08-12' },
  { id: 'p4', numero: 'LIC-2026-0004', objeto: 'Manutenção predial — telhados', categoria: 'servicos_obras', prioridade: '3_normal', fase: EXEMPLO_FASES[4], local: { sigla: 'PGM-PJ' }, unidade: { sigla: 'GOB' }, valor_requisicao: null, valor_arrematado: null, ultima_movimentacao_em: '2026-06-30' }
];

const estado = { categoria: '', faseId: '', prioridade: '', busca: '', pagina: 1 };
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
}

function filtrarExemplo() {
  const b = estado.busca.toLowerCase();
  const itens = EXEMPLO.filter(p =>
    (!estado.categoria || p.categoria === estado.categoria)
    && (!estado.faseId || p.fase.id === estado.faseId)
    && (!estado.prioridade || p.prioridade === estado.prioridade)
    && (!b || p.objeto.toLowerCase().includes(b) || p.numero.toLowerCase().includes(b)));
  const de = (estado.pagina - 1) * POR_PAGINA;
  return { itens: itens.slice(de, de + POR_PAGINA), total: itens.length };
}

function fmtValor(v) {
  if (v == null) return null;
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function renderItem(p) {
  const parado = diasUteisDesde(p.ultima_movimentacao_em, feriados);
  const limite = p.fase?.prazo_alerta_dias ?? 10;
  const alerta = parado > limite
    ? `<span class="badge-chip badge-prioridade badge-prioridade--urgente">
         Parado há ${parado} dias úteis</span>`
    : '';
  const economia = (p.valor_requisicao != null && p.valor_arrematado != null)
    ? p.valor_requisicao - p.valor_arrematado : null;
  const meta = [
    p.unidade?.sigla ? `Solicitante: ${p.unidade.sigla}` : null,
    p.local?.sigla ? `Local: ${p.local.sigla}` : null,
    fmtValor(p.valor_requisicao) ? `Requisição: ${fmtValor(p.valor_requisicao)}` : null,
    economia != null ? `Economia: ${fmtValor(economia)}` : null,
    `Atualizado: ${fmtData(p.ultima_movimentacao_em)}`
  ].filter(Boolean).join(' · ');

  return `<a class="cartao d-block text-decoration-none text-reset"
      href="./processo-licitacao.html?id=${encodeURIComponent(p.id)}">
    <div class="demanda-cabecalho__numero">${escapeHtml(p.numero)}</div>
    <div class="fw-semibold mb-2">${escapeHtml(p.objeto)}</div>
    <div class="demanda-cabecalho__chips mb-1">
      <span class="badge-chip badge-situacao badge-situacao--em_andamento">${escapeHtml(p.fase?.nome ?? '—')}</span>
      <span class="badge-chip badge-prioridade badge-prioridade--${COR_PRIORIDADE[p.prioridade] ?? 'normal'}">${escapeHtml(ROTULO_PRIORIDADE_LIC[p.prioridade] ?? p.prioridade)}</span>
      <span class="badge-chip">${escapeHtml(ROTULO_CATEGORIA[p.categoria] ?? p.categoria)}</span>
      ${alerta}
    </div>
    <div class="texto-silencioso small">${escapeHtml(meta)}</div>
  </a>`;
}

async function atualizar() {
  const lista = document.getElementById('lista');
  const pag = document.getElementById('paginacao');
  const carr = document.getElementById('carregando');
  carr.hidden = false;
  let dados;
  try {
    dados = await demo.carregar(
      async () => {
        const s = await import('../services/licitacoes.js');
        return s.listarProcessos({
          categoria: estado.categoria || null,
          faseId: estado.faseId || null,
          prioridade: estado.prioridade || null,
          busca: estado.busca,
          pagina: estado.pagina, porPagina: POR_PAGINA
        });
      },
      () => filtrarExemplo()
    );
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

// Filtros: selects aplicam na hora; busca com pequena espera de digitação.
for (const id of ['f-categoria', 'f-fase', 'f-prioridade']) {
  document.getElementById(id).addEventListener('change', (e) => {
    estado[{ 'f-categoria': 'categoria', 'f-fase': 'faseId', 'f-prioridade': 'prioridade' }[id]] = e.target.value;
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
document.getElementById('filtros').addEventListener('submit', e => e.preventDefault());

document.getElementById('paginacao').addEventListener('click', (e) => {
  const b = e.target.closest('[data-pag]');
  if (!b || b.disabled) return;
  estado.pagina += b.dataset.pag === 'next' ? 1 : -1;
  atualizar();
});

carregarFases().then(atualizar);

// Sino, sessão e navegação — como nas demais telas.
import { montarSino } from './notificacoes.js';
import { iniciarSessao } from './sessao.js';
import { montarNavegacao } from './navegacao.js';
montarSino('sino-notificacoes');
iniciarSessao();
montarNavegacao('licitacoes');
