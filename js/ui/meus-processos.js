// =====================================================================
// meus-processos.js — visão consolidada de entrada (tarefas) + saída (demandas).
// Abas, filtros, busca e cronograma (subtarefas como marcos).
// =====================================================================

import { escapeHtml, badgeSituacao, badgePrioridade, badgeSigilo, fmtPrazo } from './componentes.js';
import { listarPorDemanda } from '../services/tarefas.js';

const FILTROS = [
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

// Dados de exemplo
const EXEMPLO_ENTRADA = [
  { id: 't1', demanda_id: 'd1', demanda_numero: 'DEM-2026-000042', titulo: 'Verificar contrato de merenda', situacao: 'em_andamento', prioridade: 'alta', prazo: '2026-08-05' },
  { id: 't2', demanda_id: 'd2', demanda_numero: 'DEM-2026-000051', titulo: 'Emitir parecer sobre transferência', situacao: 'aberta', prioridade: 'normal', prazo: '2026-08-12' },
  { id: 't3', demanda_id: 'd3', demanda_numero: 'DEM-2026-000058', titulo: 'Vazamento no telhado — vistoria', situacao: 'aberta', prioridade: 'urgente', prazo: '2026-08-01' }
];

const EXEMPLO_SAIDA = [
  { id: 'd1', numero: 'DEM-2026-000042', titulo: 'Falta de merenda na EMEF Prof. João da Silva', situacao: 'em_andamento', prioridade: 'alta', sigilo: 'normal', prazo: '2026-08-05' },
  { id: 'd8', numero: 'DEM-2026-000044', titulo: 'Pedido de transporte escolar', situacao: 'aberta', prioridade: 'normal', sigilo: 'normal', prazo: '2026-08-18' },
  { id: 'd9', numero: 'DEM-2026-000047', titulo: 'Ocorrência com aluno (sigilo)', situacao: 'aguardando_complementacao', prioridade: 'alta', sigilo: 'restrito', prazo: '2026-08-03' }
];

// Cache de cronogramas (subtarefas por demanda)
const cronogramaCache = new Map();

async function obterCronograma(demandaId) {
  if (cronogramaCache.has(demandaId)) {
    return cronogramaCache.get(demandaId);
  }
  try {
    const tarefas = await listarPorDemanda(demandaId);
    const subtarefas = tarefas.filter(t => t.parent_id === null && t.situacao !== 'concluida').slice(0, 3);
    cronogramaCache.set(demandaId, subtarefas);
    return subtarefas;
  } catch (e) {
    console.error('Erro ao carregar cronograma:', e);
    return [];
  }
}

function renderCronograma(subtarefas) {
  if (!subtarefas.length) return '';
  return `<div class="cronograma-marcos mt-2 small text-muted">
    ${subtarefas.map(st => `
      <span class="badge bg-light text-dark me-1 mb-1">
        📌 ${escapeHtml(st.titulo)} (${fmtPrazo(st.prazo)})
      </span>
    `).join('')}
  </div>`;
}

function cartaoComCronograma(item, tipo) {
  const href = tipo === 'entrada'
    ? `./demanda.html?id=${item.demanda_id || item.id}`
    : `./demanda.html?id=${item.id}`;
  const numero = item.demanda_numero || item.numero;
  const sigilo = item.sigilo ? badgeSigilo(item.sigilo) : '';

  return `<a class="cartao d-block text-decoration-none text-reset" href="${escapeHtml(href)}">
    <div class="demanda-cabecalho__numero">${escapeHtml(numero)}</div>
    <div class="fw-semibold mb-2">${escapeHtml(item.titulo)}</div>
    <div class="demanda-cabecalho__chips mb-1">
      ${badgeSituacao(item.situacao)} ${badgePrioridade(item.prioridade)} ${sigilo}
    </div>
    <div class="texto-silencioso small">Prazo: ${fmtPrazo(item.prazo)}</div>
    <div id="cronograma-${item.id}" class="cronograma-placeholder"></div>
  </a>`;
}

function filtrarPaginar(itens, filtro, pagina, porPagina, busca) {
  let filtrados = itens.filter(PREDICADOS[filtro] || PREDICADOS.todos);

  if (busca && busca.trim()) {
    const termo = busca.trim().toLowerCase();
    filtrados = filtrados.filter(i => {
      const numero = (i.numero || i.demanda_numero || '').toLowerCase();
      const titulo = (i.titulo || '').toLowerCase();
      return numero.includes(termo) || titulo.includes(termo);
    });
  }

  const de = (pagina - 1) * porPagina;
  return { itens: filtrados.slice(de, de + porPagina), total: filtrados.length };
}

async function carregarEntradaReal(filtro, pagina, porPagina) {
  const { listarCaixaEntrada } = await import('../services/tarefas.js');
  const { itens, total } = await listarCaixaEntrada({ filtro, pagina, porPagina });
  const mapeados = itens.map(d => ({
    demanda_id: d.id,
    demanda_numero: d.numero,
    titulo: d.titulo,
    situacao: d.situacao,
    prioridade: d.prioridade,
    sigilo: d.sigilo,
    prazo: d.prazo
  }));
  return { itens: mapeados, total, demo: false };
}

async function carregarSaidaReal(filtro, pagina, porPagina) {
  const { listarCaixaSaida } = await import('../services/demandas.js');
  const { itens, total } = await listarCaixaSaida({ filtro, pagina, porPagina });
  return { itens, total, demo: false };
}

async function inicializar() {
  const estado = { aba: 'entrada', filtro: 'todos', pagina: 1, busca: '' };
  const porPagina = 5;

  const elAbas = document.querySelectorAll('[data-aba]');
  const elFiltros = document.getElementById('filtros');
  const elBusca = document.getElementById('busca');
  const elLista = document.getElementById('lista');
  const elPag = document.getElementById('paginacao');
  const elCarregando = document.getElementById('carregando');
  const elTarja = document.getElementById('tarja-demo');

  const renderFiltros = () => {
    elFiltros.innerHTML = FILTROS.map(([c, r]) =>
      `<button class="btn btn-sm ${c === estado.filtro ? 'btn-primary' : 'btn-outline-primary'}"`
      + ` data-filtro="${c}">${r}</button>`).join('');
  };

  async function atualizar() {
    elCarregando.hidden = false;
    let dados;
    try {
      const carregador = estado.aba === 'entrada' ? carregarEntradaReal : carregarSaidaReal;
      dados = await demo.carregar(
        () => carregador(estado.filtro, estado.pagina, porPagina),
        () => {
          const exemplo = estado.aba === 'entrada' ? EXEMPLO_ENTRADA : EXEMPLO_SAIDA;
          return filtrarPaginar(exemplo, estado.filtro, estado.pagina, porPagina, estado.busca);
        }
      );
    } catch (e) {
      console.error(e);
      elCarregando.textContent = `Erro ao carregar: ${e.message || e}`;
      elCarregando.hidden = false;
      elLista.innerHTML = '';
      elPag.innerHTML = '';
      return;
    }

    const { itens, total, demo: emDemo } = dados;
    elTarja.hidden = !emDemo;
    elLista.innerHTML = itens.length
      ? itens.map(item => cartaoComCronograma(item, estado.aba)).join('')
      : '<p class="texto-silencioso">Nenhum item neste filtro.</p>';

    // Carregar cronogramas em paralelo
    if (!emDemo) {
      itens.forEach(item => {
        const demandaId = item.demanda_id || item.id;
        obterCronograma(demandaId).then(subs => {
          const el = document.getElementById(`cronograma-${item.id}`);
          if (el) el.innerHTML = renderCronograma(subs);
        });
      });
    }

    const paginas = Math.max(1, Math.ceil(total / porPagina));
    elPag.innerHTML = `
      <button class="btn btn-sm btn-outline-secondary" data-pag="prev"
        ${estado.pagina <= 1 ? 'disabled' : ''}>Anterior</button>
      <span class="texto-silencioso small">Página ${estado.pagina} de ${paginas} · ${total} item(ns)</span>
      <button class="btn btn-sm btn-outline-secondary" data-pag="next"
        ${estado.pagina >= paginas ? 'disabled' : ''}>Próxima</button>`;
    elCarregando.hidden = true;
  }

  renderFiltros();

  // Troca de abas
  elAbas.forEach(btn => btn.addEventListener('click', () => {
    elAbas.forEach(b => {
      b.classList.toggle('btn-primary', b === btn);
      b.classList.toggle('btn-outline-primary', b !== btn);
      b.setAttribute('aria-selected', b === btn);
    });
    estado.aba = btn.dataset.aba;
    estado.pagina = 1;
    cronogramaCache.clear(); // Limpar cache ao trocar aba
    atualizar();
  }));

  // Filtros
  elFiltros.addEventListener('click', (e) => {
    const b = e.target.closest('[data-filtro]');
    if (!b) return;
    estado.filtro = b.dataset.filtro;
    estado.pagina = 1;
    renderFiltros();
    atualizar();
  });

  // Busca (com debounce)
  let timeoutBusca;
  elBusca.addEventListener('input', (e) => {
    estado.busca = e.target.value;
    estado.pagina = 1;
    clearTimeout(timeoutBusca);
    timeoutBusca = setTimeout(atualizar, 300);
  });

  // Paginação
  elPag.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-pag]');
    if (!btn) return;
    if (btn.dataset.pag === 'prev' && estado.pagina > 1) estado.pagina--;
    if (btn.dataset.pag === 'next') estado.pagina++;
    atualizar();
  });

  atualizar();
}

// Sino de notificações
import { montarSino } from './notificacoes.js';
montarSino('sino-notificacoes');

// Sessão e guarda de rota
import { iniciarSessao } from './sessao.js';
iniciarSessao();

// Barra de navegação
import { montarNavegacao } from './navegacao.js';
montarNavegacao('meus-processos');

// Modo demonstração
import * as demo from './demo.js';

// Detalhe lado
import { habilitarDetalheLateral } from './detalhe-lado.js';
habilitarDetalheLateral();

document.title = 'Meus processos — SME Ribeirão Preto';
inicializar();
