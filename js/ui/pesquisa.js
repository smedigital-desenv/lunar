// =====================================================================
// pesquisa.js — busca textual + filtros, paginada.
// A busca é feita pela função fn_pesquisar_demandas (banco, RLS + tsvector).
// Em modo demo, filtra um conjunto de exemplo no cliente.
// =====================================================================

import { cartaoLista } from './caixa.js';
import { fmtPrazo } from './componentes.js';

const POR_PAGINA = 5;

const EXEMPLO = [
  { id: 'd1', numero: 'DEM-2026-000042', titulo: 'Falta de merenda na EMEF Prof. João da Silva', situacao: 'em_andamento', prioridade: 'alta', sigilo: 'normal', prazo: '2026-08-05' },
  { id: 'd8', numero: 'DEM-2026-000044', titulo: 'Pedido de transporte escolar', situacao: 'aberta', prioridade: 'normal', sigilo: 'normal', prazo: '2026-08-18' },
  { id: 'd9', numero: 'DEM-2026-000047', titulo: 'Ocorrência com aluno (sigilo)', situacao: 'aguardando_complementacao', prioridade: 'alta', sigilo: 'restrito', prazo: '2026-08-03' },
  { id: 'd10', numero: 'DEM-2026-000049', titulo: 'Reforma da quadra — orçamento', situacao: 'devolvida', prioridade: 'baixa', sigilo: 'normal', prazo: '2026-09-01' },
  { id: 'd11', numero: 'DEM-2026-000052', titulo: 'Surto de piolho — comunicado', situacao: 'concluida', prioridade: 'normal', sigilo: 'normal', prazo: '2026-07-20' },
  { id: 'd12', numero: 'DEM-2026-000055', titulo: 'Internet fora do ar', situacao: 'em_andamento', prioridade: 'urgente', sigilo: 'normal', prazo: '2026-07-31' },
  { id: 'd14', numero: 'DEM-2026-000071', titulo: 'Merenda: cardápio especial (dieta)', situacao: 'aberta', prioridade: 'normal', sigilo: 'normal', prazo: '2026-08-22' },
  { id: 'd15', numero: 'DEM-2026-000073', titulo: 'Transporte: rota rural sem cobertura', situacao: 'em_andamento', prioridade: 'alta', sigilo: 'normal', prazo: '2026-08-09' }
];

function buscaExemplo(f, pagina) {
  const termo = (f.termo || '').toLowerCase();
  const filtrados = EXEMPLO.filter(d =>
    (!termo || `${d.numero} ${d.titulo}`.toLowerCase().includes(termo)) &&
    (!f.situacao || d.situacao === f.situacao) &&
    (!f.prioridade || d.prioridade === f.prioridade));
  const de = (pagina - 1) * POR_PAGINA;
  return { total: filtrados.length, itens: filtrados.slice(de, de + POR_PAGINA), demo: true };
}

async function buscar(f, pagina) {
  try {
    const { pesquisar } = await import('../services/painel.js');
    const r = await pesquisar({ ...f, pagina, porPagina: POR_PAGINA });
    if (r) return { total: r.total ?? 0, itens: r.itens ?? [], demo: false };
  } catch (_) { /* sem config/sessão → exemplo */ }
  return buscaExemplo(f, pagina);
}

const estado = { filtros: {}, pagina: 1 };
const elLista = document.getElementById('lista');
const elPag = document.getElementById('paginacao');
const elCarregando = document.getElementById('carregando');
const elTarja = document.getElementById('tarja-demo');

function lerFiltros(form) {
  return {
    termo: form.termo.value.trim(),
    situacao: form.situacao.value,
    prioridade: form.prioridade.value,
    de: form.de.value || null,
    ate: form.ate.value || null
  };
}

async function renderizar() {
  elCarregando.hidden = false;
  const { total, itens, demo } = await buscar(estado.filtros, estado.pagina);
  elTarja.hidden = !demo;
  elLista.innerHTML = itens.length
    ? itens.map(d => cartaoLista({
        href: `./demanda.html?id=${d.id}`, numero: d.numero, titulo: d.titulo,
        situacao: d.situacao, prioridade: d.prioridade, sigilo: d.sigilo,
        meta: `Prazo: ${fmtPrazo(d.prazo)}`
      })).join('')
    : '<p class="texto-silencioso">Nenhum resultado.</p>';

  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  elPag.innerHTML = `
    <button class="btn btn-sm btn-outline-secondary" data-pag="prev" ${estado.pagina <= 1 ? 'disabled' : ''}>Anterior</button>
    <span class="texto-silencioso small">Página ${estado.pagina} de ${paginas} · ${total} resultado(s)</span>
    <button class="btn btn-sm btn-outline-secondary" data-pag="next" ${estado.pagina >= paginas ? 'disabled' : ''}>Próxima</button>`;
  elCarregando.hidden = true;
}

document.getElementById('form-busca').addEventListener('submit', (e) => {
  e.preventDefault();
  estado.filtros = lerFiltros(e.target);
  estado.pagina = 1;
  renderizar();
});
elPag.addEventListener('click', (e) => {
  const b = e.target.closest('[data-pag]');
  if (!b || b.disabled) return;
  estado.pagina += b.dataset.pag === 'next' ? 1 : -1;
  renderizar();
});

renderizar();

// Sino de notificações no cabeçalho (Sessão 9).
import { montarSino } from './notificacoes.js';
montarSino('sino-notificacoes');

// Sessão e guarda de rota (Sessão 3).
import { iniciarSessao } from './sessao.js';
iniciarSessao();

// Barra de navegação principal.
import { montarNavegacao } from './navegacao.js';
montarNavegacao('buscar');
