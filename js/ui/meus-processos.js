// =====================================================================
// meus-processos.js — visão consolidada de entrada (tarefas) + saída (demandas).
// Abas, filtros, busca e cronograma (subtarefas como marcos).
// =====================================================================

import { escapeHtml, badgeSituacao, badgePrioridade, badgeSigilo, fmtPrazo } from './componentes.js';

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

// Dados de exemplo, já na forma normalizada (mesma que `normalizar()` produz).
const EXEMPLO_ENTRADA = [
  { demandaId: 'd1', numero: 'DEM-2026-000042', titulo: 'Verificar contrato de merenda', situacao: 'em_andamento', prioridade: 'alta', sigilo: 'normal', prazo: '2026-08-05' },
  { demandaId: 'd2', numero: 'DEM-2026-000051', titulo: 'Emitir parecer sobre transferência', situacao: 'aberta', prioridade: 'normal', sigilo: 'normal', prazo: '2026-08-12' },
  { demandaId: 'd3', numero: 'DEM-2026-000058', titulo: 'Vazamento no telhado — vistoria', situacao: 'aberta', prioridade: 'urgente', sigilo: 'normal', prazo: '2026-08-01' }
];

const EXEMPLO_SAIDA = [
  { demandaId: 'd1', numero: 'DEM-2026-000042', titulo: 'Falta de merenda na EMEF Prof. João da Silva', situacao: 'em_andamento', prioridade: 'alta', sigilo: 'normal', prazo: '2026-08-05' },
  { demandaId: 'd8', numero: 'DEM-2026-000044', titulo: 'Pedido de transporte escolar', situacao: 'aberta', prioridade: 'normal', sigilo: 'normal', prazo: '2026-08-18' },
  { demandaId: 'd9', numero: 'DEM-2026-000047', titulo: 'Ocorrência com aluno (sigilo)', situacao: 'aguardando_complementacao', prioridade: 'alta', sigilo: 'restrito', prazo: '2026-08-03' }
];

// Cronograma = as tarefas de primeiro nível da demanda ainda em aberto,
// exibidas como marcos. Cache por demanda: paginar e voltar não reconsulta.
const cronogramaCache = new Map();
const MARCOS = 3;

async function obterCronograma(demandaId) {
  if (cronogramaCache.has(demandaId)) return cronogramaCache.get(demandaId);
  try {
    // Import preguiçoso: o supabaseClient não pode ser arrastado na abertura
    // da página, senão a tela deixa de abrir offline/em demonstração.
    const { listarPorDemanda } = await import('../services/tarefas.js');
    const tarefas = await listarPorDemanda(demandaId);
    const marcos = tarefas
      .filter(t => t.parent_id === null && t.ativo !== false && t.situacao !== 'concluida')
      .slice(0, MARCOS);
    cronogramaCache.set(demandaId, marcos);
    return marcos;
  } catch (e) {
    // O cronograma é enfeite do cartão: falhar aqui não pode derrubar a lista.
    console.error('Cronograma indisponível para', demandaId, e);
    cronogramaCache.set(demandaId, []);
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

// Forma única de item, venha da entrada ou da saída. Antes cada aba tinha um
// formato próprio e os itens da entrada chegavam SEM `id` — o placeholder do
// cronograma virava "cronograma-undefined" em todos os cartões e o
// getElementById devolvia sempre o primeiro. No exemplo passava (tem `id`).
function normalizar(d) {
  return {
    demandaId: d.id,
    numero: d.numero,
    titulo: d.titulo,
    situacao: d.situacao,
    prioridade: d.prioridade,
    sigilo: d.sigilo,
    prazo: d.prazo
  };
}

function cartaoComCronograma(item) {
  const sigilo = item.sigilo ? badgeSigilo(item.sigilo) : '';
  const href = `./demanda.html?id=${item.demandaId}`;

  return `<a class="cartao d-block text-decoration-none text-reset" href="${escapeHtml(href)}">
    <div class="demanda-cabecalho__numero">${escapeHtml(item.numero)}</div>
    <div class="fw-semibold mb-2">${escapeHtml(item.titulo)}</div>
    <div class="demanda-cabecalho__chips mb-1">
      ${badgeSituacao(item.situacao)} ${badgePrioridade(item.prioridade)} ${sigilo}
    </div>
    <div class="texto-silencioso small">Prazo: ${fmtPrazo(item.prazo)}</div>
    <div data-cronograma="${escapeHtml(item.demandaId)}" class="cronograma-placeholder"></div>
  </a>`;
}

// Filtro, busca e paginação rodam no navegador sobre a lista inteira da aba.
// A busca precisa disso: `fn_caixa_entrada`/`fn_caixa_saida` não recebem termo,
// então filtrar só a página corrente devolveria "nada encontrado" para algo que
// existe duas páginas adiante — um silêncio pior que não ter o campo.
function filtrarPaginar(itens, filtro, pagina, porPagina, busca) {
  let filtrados = itens.filter(PREDICADOS[filtro] || PREDICADOS.todos);

  const termo = (busca || '').trim().toLowerCase();
  if (termo) {
    filtrados = filtrados.filter(i =>
      (i.numero || '').toLowerCase().includes(termo)
      || (i.titulo || '').toLowerCase().includes(termo));
  }

  const de = (pagina - 1) * porPagina;
  return { itens: filtrados.slice(de, de + porPagina), total: filtrados.length };
}

// Teto da carga única. As caixas são "o que é meu" — dezenas de itens, não
// milhares. Se alguma passar disso, a tela avisa em vez de mentir por omissão.
const TETO = 500;

async function carregarTudoReal(aba) {
  const { listarCaixaEntrada } = await import('../services/tarefas.js');
  const { listarCaixaSaida } = await import('../services/demandas.js');
  const listar = aba === 'entrada' ? listarCaixaEntrada : listarCaixaSaida;
  // filtro 'todos': quem filtra é o navegador, junto com a busca.
  const { itens, total } = await listar({ filtro: 'todos', pagina: 1, porPagina: TETO });
  return { itens: (itens ?? []).map(normalizar), truncado: total > TETO };
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
  const elAvisoTeto = document.getElementById('aviso-teto');

  const renderFiltros = () => {
    elFiltros.innerHTML = FILTROS.map(([c, r]) =>
      `<button class="btn btn-sm ${c === estado.filtro ? 'btn-primary' : 'btn-outline-primary'}"`
      + ` data-filtro="${c}">${r}</button>`).join('');
  };

  // Lista completa da aba, carregada uma vez. Trocar filtro, buscar ou
  // paginar não volta ao banco.
  const carregado = { entrada: null, saida: null };

  async function listaDaAba() {
    if (carregado[estado.aba]) return carregado[estado.aba];
    const dados = await demo.carregar(
      () => carregarTudoReal(estado.aba),
      () => ({ itens: estado.aba === 'entrada' ? EXEMPLO_ENTRADA : EXEMPLO_SAIDA })
    );
    carregado[estado.aba] = dados;
    return dados;
  }

  async function atualizar() {
    elCarregando.hidden = false;
    let dados;
    try {
      dados = await listaDaAba();
    } catch (e) {
      // O motivo aparece na tela, não só no console (mesma regra das caixas).
      console.error(e);
      elCarregando.textContent = `Erro ao carregar a lista: ${e.message || e}`;
      elCarregando.hidden = false;
      elLista.innerHTML = '';
      elPag.innerHTML = '';
      elAvisoTeto.hidden = true;
      return;
    }

    const { itens: todos, demo: emDemo, truncado } = dados;
    elTarja.hidden = !emDemo;
    elAvisoTeto.hidden = !truncado;

    const { itens, total } = filtrarPaginar(
      todos, estado.filtro, estado.pagina, porPagina, estado.busca);

    elLista.innerHTML = itens.length
      ? itens.map(cartaoComCronograma).join('')
      : `<p class="texto-silencioso">${estado.busca.trim()
          ? 'Nenhum item para esta busca.' : 'Nenhum item neste filtro.'}</p>`;

    // Cronograma só dos cartões visíveis, em paralelo e sem bloquear a lista.
    // No exemplo não há banco a consultar.
    if (!emDemo) {
      itens.forEach(item => obterCronograma(item.demandaId).then(subs => {
        if (!subs.length) return;
        const el = elLista.querySelector(`[data-cronograma="${CSS.escape(item.demandaId)}"]`);
        if (el) el.innerHTML = renderCronograma(subs);
      }));
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
    // O cache do cronograma é por demanda, não por aba — a mesma demanda pode
    // aparecer nas duas. Limpar aqui só faria reconsultar o que já se sabe.
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
