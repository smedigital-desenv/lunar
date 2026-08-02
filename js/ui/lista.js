// =====================================================================
// lista.js — lista de demandas de um KPI do painel (drill-down).
// Lê ?kpi= e mostra as demandas correspondentes (fn_listar_por_kpi, RLS).
// Reutiliza cartaoLista das caixas. Em modo demo, filtra um exemplo.
// =====================================================================

import { cartaoLista } from './caixa.js';
import { fmtPrazo } from './componentes.js';

const POR_PAGINA = 20;

const TITULOS = {
  todos: 'Todas as demandas',
  abertas: 'Demandas abertas',
  em_andamento: 'Em andamento',
  atrasadas: 'Atrasadas',
  proximas_prazo: 'Vencendo (1 dia útil)',
  urgentes: 'Urgentes',
  concluidas: 'Concluídas'
};

const HOJE = new Date().toISOString().slice(0, 10);
const EXEMPLO = [
  { id: 'd1', numero: 'DEM-2026-000042', titulo: 'Falta de merenda na EMEF João da Silva', situacao: 'em_andamento', prioridade: 'alta', sigilo: 'normal', prazo: '2026-08-05' },
  { id: 'd2', numero: 'DEM-2026-000051', titulo: 'Emitir parecer sobre transferência', situacao: 'aberta', prioridade: 'normal', sigilo: 'normal', prazo: '2026-08-12' },
  { id: 'd3', numero: 'DEM-2026-000058', titulo: 'Vazamento no telhado — vistoria', situacao: 'aberta', prioridade: 'urgente', sigilo: 'normal', prazo: '2026-07-30' },
  { id: 'd4', numero: 'DEM-2026-000060', titulo: 'Reposição de professor', situacao: 'concluida', prioridade: 'normal', sigilo: 'normal', prazo: '2026-07-20' },
  { id: 'd5', numero: 'DEM-2026-000061', titulo: 'Ocorrência com aluno (sigilo)', situacao: 'reaberta', prioridade: 'alta', sigilo: 'restrito', prazo: '2026-08-15' }
];

const PREDICADOS = {
  todos: () => true,
  abertas: d => d.situacao === 'aberta',
  em_andamento: d => ['em_andamento', 'reaberta'].includes(d.situacao),
  concluidas: d => d.situacao === 'concluida',
  urgentes: d => d.prioridade === 'urgente' && !['concluida', 'inativa'].includes(d.situacao),
  atrasadas: d => d.prazo && d.prazo < HOJE && !['concluida', 'inativa'].includes(d.situacao),
  proximas_prazo: d => d.prazo && d.prazo >= HOJE && !['concluida', 'inativa'].includes(d.situacao)
};

const kpi = new URLSearchParams(location.search).get('kpi') || 'abertas';
const titulo = TITULOS[kpi] || 'Demandas';
document.getElementById('titulo-pagina').textContent = titulo;
document.title = `${titulo} — SME Ribeirão Preto`;

let pagina = 1;

async function carregar() {
  try {
    const { listarPorKpi } = await import('../services/painel.js');
    const dados = await listarPorKpi(kpi, pagina, POR_PAGINA);
    if (dados) return { itens: dados.itens || [], total: dados.total || 0, demo: false };
  } catch (_) { /* sem config/sessão → exemplo */ }
  const filtrados = EXEMPLO.filter(PREDICADOS[kpi] || (() => true));
  const de = (pagina - 1) * POR_PAGINA;
  return { itens: filtrados.slice(de, de + POR_PAGINA), total: filtrados.length, demo: true };
}

function renderItem(d) {
  return cartaoLista({
    href: `./demanda.html?id=${encodeURIComponent(d.id)}`,
    numero: d.numero, titulo: d.titulo, situacao: d.situacao,
    prioridade: d.prioridade, sigilo: d.sigilo,
    meta: d.prazo ? `Prazo: ${fmtPrazo(d.prazo)}` : null
  });
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
    console.error(e); carr.textContent = 'Erro ao carregar a lista.'; return;
  }
  document.getElementById('tarja-demo').hidden = !dados.demo;
  lista.innerHTML = dados.itens.length
    ? dados.itens.map(renderItem).join('')
    : '<p class="texto-silencioso">Nenhuma demanda neste indicador.</p>';

  const paginas = Math.max(1, Math.ceil(dados.total / POR_PAGINA));
  pag.innerHTML = `
    <button class="btn btn-sm btn-outline-secondary" data-pag="prev" ${pagina <= 1 ? 'disabled' : ''}>Anterior</button>
    <span class="texto-silencioso small">Página ${pagina} de ${paginas} · ${dados.total} demanda(s)</span>
    <button class="btn btn-sm btn-outline-secondary" data-pag="next" ${pagina >= paginas ? 'disabled' : ''}>Próxima</button>`;
  carr.hidden = true;
}

document.getElementById('paginacao').addEventListener('click', (e) => {
  const b = e.target.closest('[data-pag]');
  if (!b || b.disabled) return;
  pagina += b.dataset.pag === 'next' ? 1 : -1;
  atualizar();
});

atualizar();

// Permite ao painel de detalhe (iframe) atualizar a lista após uma ação.
window.recarregarLista = () => atualizar();

// Sino de notificações e sessão no cabeçalho.
import { montarSino } from './notificacoes.js';
import { iniciarSessao } from './sessao.js';
montarSino('sino-notificacoes');
iniciarSessao();

// Barra de navegação principal (aba "Todos" quando kpi=todos; senão veio do Painel).
import { montarNavegacao } from './navegacao.js';
montarNavegacao(kpi === 'todos' ? 'todos' : 'painel');

// Visão lista + detalhe (desktop).
import { habilitarDetalheLateral } from './detalhe-lado.js';
habilitarDetalheLateral();
