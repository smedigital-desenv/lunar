// =====================================================================
// lista.js — lista de demandas de um KPI do painel (drill-down).
// Lê ?kpi= e mostra as demandas correspondentes (fn_listar_por_kpi, RLS).
//
// Mesmo formato de "Meus processos" (pedido do usuário, 2026-08-21):
// tabela ordenável no desktop, cartões no celular, detalhe em modal.
// Colunas e cartão em lista-render.js; esqueleto em tabela-processos.js.
// =====================================================================

import { COLUNAS, cartao } from './lista-render.js';
import { renderLista, renderPaginacao, ligarEventos } from './tabela-processos.js';
import { abrirModalProcesso } from './modal-processo.js';
import * as demo from './demo.js';

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
  { id: 'd1', numero: 'DEM-2026-000042', titulo: 'Falta de merenda na EMEF João da Silva', situacao: 'em_andamento', prioridade: 'alta', sigilo: 'normal', prazo: '2026-08-05', unidade_sigla: 'GGP', unidade_nome: 'Gerência de Gestão Pedagógica' },
  { id: 'd2', numero: 'DEM-2026-000051', titulo: 'Emitir parecer sobre transferência', situacao: 'aberta', prioridade: 'normal', sigilo: 'normal', prazo: '2026-08-12', unidade_sigla: 'GSE', unidade_nome: 'Gerência de Supervisão de Ensino' },
  { id: 'd3', numero: 'DEM-2026-000058', titulo: 'Vazamento no telhado — vistoria', situacao: 'aberta', prioridade: 'urgente', sigilo: 'normal', prazo: '2026-07-30', unidade_sigla: 'SUBGAFT', unidade_nome: 'Subsecretaria de Gestão Administrativa' },
  { id: 'd4', numero: 'DEM-2026-000060', titulo: 'Reposição de professor', situacao: 'concluida', prioridade: 'normal', sigilo: 'normal', prazo: '2026-07-20', unidade_sigla: 'GAT', unidade_nome: 'Gerência de Atribuição' },
  { id: 'd5', numero: 'DEM-2026-000061', titulo: 'Ocorrência com aluno (sigilo)', situacao: 'reaberta', prioridade: 'alta', sigilo: 'restrito', prazo: '2026-08-15', unidade_sigla: 'GEE', unidade_nome: 'Gerência de Educação Especial' }
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

const estado = { pagina: 1, unidadeId: '', busca: '', ordem: 'prazo', asc: true };
let unidades = [];          // organograma, para resolver a secretaria
let listaSuja = false;
window.marcarListaSuja = () => { listaSuja = true; };

// ------------------------------------------------------- Organograma
// A secretaria de uma demanda é a subsecretaria ANCESTRAL da unidade
// responsável — sobe pelo parent_id, nunca por sigla fixa (regra 5).
function secretariaDe(unidadeId) {
  const por = new Map(unidades.map(u => [u.id, u]));
  let u = por.get(unidadeId);
  const visto = new Set();
  while (u && !visto.has(u.id)) {
    visto.add(u.id);                       // organograma corrompido não trava a tela
    if (u.tipo === 'subsecretaria' || u.tipo === 'gabinete' || !u.parent_id) return u;
    u = por.get(u.parent_id);
  }
  return null;
}

async function montarFiltroUnidade() {
  try {
    const { listarUnidades } = await import('../services/organograma.js');
    unidades = (await listarUnidades()).filter(u => u.ativo !== false);
  } catch (e) {
    console.error('Organograma indisponível; filtro por secretaria oculto.', e);
    return;
  }
  const secs = unidades
    .filter(u => u.tipo === 'subsecretaria' || u.tipo === 'gabinete')
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  // Uma secretaria só (ou nenhuma) não tem o que separar: o filtro fica
  // escondido em vez de oferecer uma escolha inócua.
  if (secs.length < 2) return;
  // Nome e sigla vêm do banco: nada de HTML montado com eles (regra do
  // CLAUDE.md). Option por option, com textContent.
  const sel = document.getElementById('f-unidade');
  for (const u of secs) {
    const op = document.createElement('option');
    op.value = u.id;
    op.textContent = u.sigla ? `${u.sigla} — ${u.nome}` : u.nome;
    sel.appendChild(op);
  }
  document.getElementById('campo-unidade').hidden = false;
}

// ------------------------------------------------------------ Dados
async function carregar() {
  return demo.carregar(
    async () => {
      const { listarPorKpi } = await import('../services/painel.js');
      const dados = await listarPorKpi(kpi, estado.pagina, POR_PAGINA, estado.unidadeId || null);
      return { itens: dados?.itens ?? [], total: dados?.total ?? 0 };
    },
    () => {
      const filtrados = EXEMPLO.filter(PREDICADOS[kpi] || (() => true));
      const de = (estado.pagina - 1) * POR_PAGINA;
      return { itens: filtrados.slice(de, de + POR_PAGINA), total: filtrados.length };
    }
  );
}

// A busca é do lado do navegador e alcança só a página corrente — a RPC
// do KPI não recebe termo. Para procurar na base inteira existe a tela de
// Pesquisa, ligada no botão ao lado do campo.
function aplicarBusca(itens) {
  const termo = estado.busca.trim().toLowerCase();
  if (!termo) return itens;
  return itens.filter(i => (i.numero || '').toLowerCase().includes(termo)
    || (i.titulo || '').toLowerCase().includes(termo));
}

function ordenar(itens) {
  const dir = estado.asc ? 1 : -1;
  const peso = { urgente: 0, alta: 1, normal: 2, baixa: 3 };
  return [...itens].sort((a, z) => {
    if (estado.ordem === 'prioridade') {
      return dir * ((peso[a.prioridade] ?? 9) - (peso[z.prioridade] ?? 9));
    }
    return dir * String(a[estado.ordem] ?? '')
      .localeCompare(String(z[estado.ordem] ?? ''), 'pt-BR', { numeric: true });
  });
}

// ---------------------------------------------------------- Render
async function atualizar() {
  const elLista = document.getElementById('lista');
  const elPag = document.getElementById('paginacao');
  const carr = document.getElementById('carregando');
  carr.hidden = false;

  let dados;
  try {
    dados = await carregar();
  } catch (e) {
    // O motivo aparece na tela, não só no console.
    console.error(e);
    carr.textContent = `Erro ao carregar a lista: ${e.message || e}`;
    carr.hidden = false;
    elLista.innerHTML = '';
    elPag.innerHTML = '';
    return;
  }
  document.getElementById('tarja-demo').hidden = !dados.demo;

  // Resolve a secretaria de cada item pela árvore já carregada.
  const itens = ordenar(aplicarBusca(dados.itens.map(d => {
    const sec = secretariaDe(d.unidade_id);
    return {
      ...d,
      href: `./demanda.html?id=${encodeURIComponent(d.id)}`,
      secretaria_sigla: sec?.sigla ?? d.unidade_sigla ?? null
    };
  })));

  elLista.innerHTML = itens.length
    ? renderLista(itens, { colunas: COLUNAS, cartao }, estado.ordem, estado.asc)
    : `<p class="texto-silencioso">${estado.busca.trim()
        ? 'Nenhuma demanda desta página bate com a busca.'
        : 'Nenhuma demanda neste indicador.'}</p>`;

  const paginas = Math.max(1, Math.ceil(dados.total / POR_PAGINA));
  elPag.innerHTML = renderPaginacao(estado.pagina, paginas, dados.total, 'demanda(s)');
  carr.hidden = true;
}

// --------------------------------------------------------- Eventos
function abrir(href) {
  abrirModalProcesso(href, () => {
    if (!listaSuja) return;
    listaSuja = false;
    atualizar();
  });
}

ligarEventos(document.getElementById('lista'), {
  aoOrdenar: (c) => {
    estado.asc = estado.ordem === c ? !estado.asc : true;
    estado.ordem = c;
    atualizar();
  },
  aoAbrir: abrir
});

document.getElementById('f-unidade').addEventListener('change', (e) => {
  estado.unidadeId = e.target.value;
  estado.pagina = 1;                       // o recorte muda o total
  atualizar();
});

let debounce;
document.getElementById('f-busca').addEventListener('input', (e) => {
  estado.busca = e.target.value;
  clearTimeout(debounce);
  debounce = setTimeout(atualizar, 250);
});

document.getElementById('paginacao').addEventListener('click', (e) => {
  const b = e.target.closest('[data-pag]');
  if (!b || b.disabled) return;
  estado.pagina += b.dataset.pag === 'next' ? 1 : -1;
  atualizar();
});

// Permite ao painel de detalhe (iframe) atualizar a lista após uma ação.
window.recarregarLista = () => atualizar();

(async () => {
  await montarFiltroUnidade();
  atualizar();
})();

import { montarSino } from './notificacoes.js';
import { iniciarSessao } from './sessao.js';
import { montarNavegacao } from './navegacao.js';
montarSino('sino-notificacoes');
iniciarSessao();
montarNavegacao(kpi === 'todos' ? 'todos' : 'painel');
