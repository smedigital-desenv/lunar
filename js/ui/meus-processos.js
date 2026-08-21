// =====================================================================
// meus-processos.js — visão única dos meus processos de entrada e saída.
// Tabela ordenável no desktop, cartões no celular, detalhe em modal sobre
// a lista. Mesmo padrão da tela de Licitações.
// O desenho fica em meus-processos-render.js; aqui é estado e carga.
// =====================================================================

import { COLUNAS, cartao, linhaClasse, renderCronograma, chaveCronograma }
  from './meus-processos-render.js';
import { renderLista, renderPaginacao, ligarEventos } from './tabela-processos.js';
import { abrirModalProcesso } from './modal-processo.js';
import * as demo from './demo.js';

const POR_PAGINA = 20;
const TETO = 500;          // carga única por caixa; acima disso a tela avisa
const MARCOS = 3;          // marcos exibidos por processo

const PREDICADOS = {
  todos: () => true,
  pendentes: i => ['aberta', 'aguardando_complementacao', 'devolvida'].includes(i.situacao),
  em_andamento: i => ['em_andamento', 'reaberta'].includes(i.situacao),
  urgentes: i => i.prioridade === 'urgente',
  encerrados: i => i.situacao === 'concluida'
};

// Prioridade ordena por gravidade, não por alfabeto.
const PESO_PRIORIDADE = { urgente: 0, alta: 1, normal: 2, baixa: 3 };

const estado = {
  fluxo: 'todos', situacao: 'todos', busca: '',
  ordem: 'prazo', asc: true, pagina: 1
};

let processos = [];        // lista já unificada das duas caixas
let emDemo = false;
let truncado = false;
let listaSuja = false;     // o modal gravou algo? então a lista recarrega

// Mesmo contrato da lista de Licitações: o iframe do modal avisa a lista
// quando grava. A tela de demanda ainda não chama isto — ver ESTADO.md.
window.marcarListaSuja = () => { listaSuja = true; };

// ------------------------------------------------------------- Dados
const EXEMPLO_ENTRADA = [
  { id: 'd1', numero: 'DEM-2026-000042', titulo: 'Verificar contrato de merenda', situacao: 'em_andamento', prioridade: 'alta', sigilo: 'normal', prazo: '2026-08-05' },
  { id: 'd2', numero: 'DEM-2026-000051', titulo: 'Emitir parecer sobre transferência', situacao: 'aberta', prioridade: 'normal', sigilo: 'normal', prazo: '2026-08-12' },
  { id: 'd3', numero: 'DEM-2026-000058', titulo: 'Vazamento no telhado — vistoria', situacao: 'aberta', prioridade: 'urgente', sigilo: 'normal', prazo: '2026-08-01' }
];
const EXEMPLO_SAIDA = [
  { id: 'd1', numero: 'DEM-2026-000042', titulo: 'Verificar contrato de merenda', situacao: 'em_andamento', prioridade: 'alta', sigilo: 'normal', prazo: '2026-08-05' },
  { id: 'd8', numero: 'DEM-2026-000044', titulo: 'Pedido de transporte escolar', situacao: 'aberta', prioridade: 'normal', sigilo: 'normal', prazo: '2026-08-18' },
  { id: 'd9', numero: 'DEM-2026-000047', titulo: 'Ocorrência com aluno (sigilo)', situacao: 'aguardando_complementacao', prioridade: 'alta', sigilo: 'restrito', prazo: '2026-08-03' }
];

// Junta as duas caixas numa lista só. A mesma demanda pode estar nas duas
// (eu criei E sou o responsável): vira UMA linha com fluxo 'ambos', senão
// apareceria duplicada e pareceria defeito.
function unificar(entrada, saida) {
  const por = new Map();
  const juntar = (lista, fluxo) => (lista ?? []).forEach(d => {
    const ja = por.get(d.id);
    if (ja) { ja.fluxo = 'ambos'; return; }
    por.set(d.id, {
      demandaId: d.id, numero: d.numero, titulo: d.titulo,
      situacao: d.situacao, prioridade: d.prioridade,
      sigilo: d.sigilo, prazo: d.prazo, fluxo,
      href: `./demanda.html?id=${encodeURIComponent(d.id)}`
    });
  });
  juntar(entrada, 'entrada');
  juntar(saida, 'saida');
  return [...por.values()];
}

async function carregarReal() {
  const { listarCaixaEntrada } = await import('../services/tarefas.js');
  const { listarCaixaSaida } = await import('../services/demandas.js');
  // filtro 'todos': quem filtra é o navegador, junto com a busca — as RPCs
  // de caixa não recebem termo de busca.
  const p = { filtro: 'todos', pagina: 1, porPagina: TETO };
  const [ent, sai] = await Promise.all([listarCaixaEntrada(p), listarCaixaSaida(p)]);
  return {
    itens: unificar(ent.itens, sai.itens),
    truncado: (ent.total ?? 0) > TETO || (sai.total ?? 0) > TETO
  };
}

async function carregarTudo() {
  const d = await demo.carregar(
    () => carregarReal(),
    () => ({ itens: unificar(EXEMPLO_ENTRADA, EXEMPLO_SAIDA) })
  );
  processos = d.itens;
  emDemo = d.demo;
  truncado = !!d.truncado;
}

// ------------------------------------------------------- Cronograma
const cacheCronograma = new Map();

async function obterCronograma(demandaId) {
  if (cacheCronograma.has(demandaId)) return cacheCronograma.get(demandaId);
  try {
    // Import preguiçoso: o supabaseClient não pode subir na abertura da
    // página, senão a tela deixa de abrir offline/em demonstração.
    const { listarPorDemanda } = await import('../services/tarefas.js');
    const tarefas = await listarPorDemanda(demandaId);
    const marcos = tarefas
      .filter(t => t.parent_id === null && t.ativo !== false && t.situacao !== 'concluida')
      .slice(0, MARCOS);
    cacheCronograma.set(demandaId, marcos);
    return marcos;
  } catch (e) {
    // O cronograma é acessório: falhar aqui não pode derrubar a lista.
    console.error('Cronograma indisponível para', demandaId, e);
    cacheCronograma.set(demandaId, []);
    return [];
  }
}

// Preenche os lugares reservados dos itens visíveis. querySelectorAll (e não
// querySelector) porque a mesma chave existe DUAS vezes no DOM: na linha da
// tabela e no cartão — só um dos dois aparece, mas ambos precisam sair
// preenchidos para a lista não mudar de conteúdo ao girar o celular.
function preencherCronogramas(itens) {
  if (emDemo) return;                       // sem banco a consultar
  const lista = document.getElementById('lista');
  itens.forEach(item => obterCronograma(item.demandaId).then(marcos => {
    lista.querySelectorAll(`[data-cronograma="${CSS.escape(chaveCronograma(item))}"]`)
      .forEach(el => { el.innerHTML = renderCronograma(marcos); });
  }));
}

// --------------------------------------------------------- Seleção
function selecionar() {
  let itens = processos.filter(PREDICADOS[estado.situacao] ?? PREDICADOS.todos);

  // 'ambos' pertence às duas caixas, então aparece nos dois filtros.
  if (estado.fluxo !== 'todos') {
    itens = itens.filter(i => i.fluxo === estado.fluxo || i.fluxo === 'ambos');
  }
  const termo = estado.busca.trim().toLowerCase();
  if (termo) {
    itens = itens.filter(i => i.numero.toLowerCase().includes(termo)
      || i.titulo.toLowerCase().includes(termo));
  }

  const dir = estado.asc ? 1 : -1;
  return itens.sort((a, z) => {
    if (estado.ordem === 'prioridade') {
      return dir * ((PESO_PRIORIDADE[a.prioridade] ?? 9) - (PESO_PRIORIDADE[z.prioridade] ?? 9));
    }
    // 'cronograma' não ordena (o dado chega depois da lista): cai no número.
    const c = estado.ordem === 'cronograma' ? 'numero' : estado.ordem;
    return dir * String(a[c] ?? '').localeCompare(String(z[c] ?? ''), 'pt-BR', { numeric: true });
  });
}

function atualizar() {
  const itens = selecionar();
  const paginas = Math.max(1, Math.ceil(itens.length / POR_PAGINA));
  estado.pagina = Math.min(Math.max(1, estado.pagina), paginas);
  const de = (estado.pagina - 1) * POR_PAGINA;
  const pagina = itens.slice(de, de + POR_PAGINA);

  document.getElementById('tarja-demo').hidden = !emDemo;
  document.getElementById('aviso-teto').hidden = !truncado;
  document.getElementById('lista').innerHTML = pagina.length
    ? renderLista(pagina, { colunas: COLUNAS, cartao, linhaClasse }, estado.ordem, estado.asc)
    : `<p class="texto-silencioso">${estado.busca.trim()
        ? 'Nenhum processo para esta busca.' : 'Nenhum processo com esses filtros.'}</p>`;

  document.getElementById('paginacao').innerHTML =
    renderPaginacao(estado.pagina, paginas, itens.length);

  preencherCronogramas(pagina);
}

// --------------------------------------------------------- Eventos
function abrir(href) {
  abrirModalProcesso(href, async () => {
    if (!listaSuja) return;
    listaSuja = false;
    cacheCronograma.clear();          // a tramitação pode ter mexido nos marcos
    try { await carregarTudo(); } catch (e) { console.error(e); }
    atualizar();
  });
}

for (const [id, chave] of [['f-fluxo', 'fluxo'], ['f-situacao', 'situacao']]) {
  document.getElementById(id).addEventListener('change', (e) => {
    estado[chave] = e.target.value;
    estado.pagina = 1;
    atualizar();
  });
}

let debounce;
document.getElementById('f-busca').addEventListener('input', (e) => {
  estado.busca = e.target.value;
  estado.pagina = 1;
  clearTimeout(debounce);
  debounce = setTimeout(atualizar, 250);
});

document.getElementById('paginacao').addEventListener('click', (e) => {
  const b = e.target.closest('[data-pag]');
  if (!b || b.disabled) return;
  estado.pagina += b.dataset.pag === 'next' ? 1 : -1;
  atualizar();
});

// Cabeçalho ordena (repetir a coluna inverte a direção); linha e cartão
// abrem o detalhe em modal.
ligarEventos(document.getElementById('lista'), {
  aoOrdenar: (c) => {
    estado.asc = estado.ordem === c ? !estado.asc : true;
    estado.ordem = c;
    atualizar();
  },
  aoAbrir: abrir
});

// ---------------------------------------------------------- Abertura
(async () => {
  const carr = document.getElementById('carregando');
  try {
    await carregarTudo();
  } catch (e) {
    // Com sessão, o erro aparece na tela — não vira "modo demonstração".
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
montarNavegacao('meus-processos');
