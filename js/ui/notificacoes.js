// =====================================================================
// notificacoes.js (UI) — sino de notificações no cabeçalho.
// Badge com contador de não lidas + painel com a lista (lida/não lida,
// data de leitura) e marcação de leitura. Atualiza por polling a cada 60s.
// Em modo demo (sem config/sessão), exibe exemplos e desabilita a escrita.
// =====================================================================

import { escapeHtml, fmtDataHora, iconeTipo, toast } from './componentes.js';

const INTERVALO_MS = 60000;

const EXEMPLO = [
  { id: 'ex-1', tipo: 'encaminhamento', titulo: 'Nova tarefa encaminhada',
    mensagem: 'Gustavo Chefe encaminhou uma tarefa da demanda DEM-2026-000042.',
    demanda_id: null, lida: false, lida_em: null,
    criado_em: new Date(Date.now() - 3600e3).toISOString() },
  { id: 'ex-2', tipo: 'devolutiva', titulo: 'Devolutiva registrada',
    mensagem: 'Júlia Agente registrou uma devolutiva na DEM-2026-000039.',
    demanda_id: null, lida: false, lida_em: null,
    criado_em: new Date(Date.now() - 8 * 3600e3).toISOString() },
  { id: 'ex-3', tipo: 'conclusao', titulo: 'Demanda concluída',
    mensagem: 'A demanda DEM-2026-000031 foi concluída.',
    demanda_id: null, lida: true, lida_em: new Date(Date.now() - 20 * 3600e3).toISOString(),
    criado_em: new Date(Date.now() - 26 * 3600e3).toISOString() }
];

let servico = null;      // módulo de serviço quando há config/sessão; null em demo
let itens = [];          // notificações carregadas
let abertoPara = null;   // painel aberto? guarda a raiz para fechar por clique externo

// Carrega o serviço só uma vez; se não houver config/sessão, fica em modo demo.
async function obterServico() {
  if (servico !== null) return servico;
  try {
    servico = await import('../services/notificacoes.js');
  } catch (_) {
    servico = false; // demo
  }
  return servico;
}

async function buscar() {
  const svc = await obterServico();
  if (!svc) return { lista: EXEMPLO.slice(), demo: true };
  try {
    const lista = await svc.listar({ limite: 30 });
    return { lista, demo: false };
  } catch (_) {
    return { lista: EXEMPLO.slice(), demo: true };
  }
}

// ---------------------------------------------------------------- Render
function renderItem(n) {
  const naoLida = !n.lida;
  const linkAbre = n.demanda_id ? ` role="link" tabindex="0"` : '';
  return `<li class="notif-item${naoLida ? ' notif-item--nao-lida' : ''}"`
    + ` data-id="${escapeHtml(n.id)}"`
    + (n.demanda_id ? ` data-demanda="${escapeHtml(n.demanda_id)}"` : '')
    + `${linkAbre}>`
    + `<span class="notif-item__icone" aria-hidden="true">${iconeTipo(n.tipo)}</span>`
    + `<div class="notif-item__corpo">`
    + `<div class="notif-item__titulo">${escapeHtml(n.titulo || '(sem título)')}</div>`
    + (n.mensagem ? `<div class="notif-item__msg">${escapeHtml(n.mensagem)}</div>` : '')
    + `<div class="notif-item__data">${escapeHtml(fmtDataHora(n.criado_em))}`
    + (n.lida && n.lida_em ? ` · lida ${escapeHtml(fmtDataHora(n.lida_em))}` : '')
    + `</div></div>`
    + (naoLida ? '<span class="notif-item__ponto" aria-label="não lida"></span>' : '')
    + `</li>`;
}

function renderLista() {
  if (!itens.length) {
    return '<li class="notif-vazio texto-silencioso">Nenhuma notificação.</li>';
  }
  return itens.map(renderItem).join('');
}

function atualizarBadge() {
  const n = itens.filter(i => !i.lida).length;
  const badge = document.getElementById('notif-badge');
  if (!badge) return;
  badge.textContent = n > 99 ? '99+' : String(n);
  badge.hidden = n === 0;
}

function pintarLista() {
  const ul = document.getElementById('notif-lista');
  if (ul) ul.innerHTML = renderLista();
  atualizarBadge();
}

// ---------------------------------------------------------------- Ações
async function marcarUma(id) {
  const n = itens.find(i => i.id === id);
  if (!n || n.lida) return;
  n.lida = true;
  n.lida_em = new Date().toISOString();
  pintarLista();
  const svc = await obterServico();
  if (svc) {
    try { await svc.marcarLida(id); } catch (e) { console.error(e); }
  }
}

async function marcarTodas() {
  const havia = itens.some(i => !i.lida);
  if (!havia) return;
  const agora = new Date().toISOString();
  itens.forEach(i => { if (!i.lida) { i.lida = true; i.lida_em = agora; } });
  pintarLista();
  const svc = await obterServico();
  if (svc) {
    try { await svc.marcarTodasLidas(); } catch (e) { console.error(e); toast('Falha ao marcar como lidas.', 'erro'); }
  }
}

function abrirDemanda(demandaId) {
  const base = location.pathname.includes('/pages/') ? './demanda.html' : './pages/demanda.html';
  location.href = `${base}?id=${encodeURIComponent(demandaId)}`;
}

// ---------------------------------------------------------------- Painel
function fecharPainel() {
  const painel = document.getElementById('notif-painel');
  const botao = document.getElementById('notif-sino');
  if (painel) painel.hidden = true;
  if (botao) botao.setAttribute('aria-expanded', 'false');
  abertoPara = null;
}

async function abrirPainel() {
  const painel = document.getElementById('notif-painel');
  const botao = document.getElementById('notif-sino');
  const { lista, demo } = await buscar();
  itens = Array.isArray(lista) ? lista : [];
  pintarLista();
  const aviso = document.getElementById('notif-demo');
  if (aviso) aviso.hidden = !demo;
  if (painel) painel.hidden = false;
  if (botao) botao.setAttribute('aria-expanded', 'true');
  abertoPara = painel;
}

function togglePainel() {
  const painel = document.getElementById('notif-painel');
  if (painel && painel.hidden) abrirPainel(); else fecharPainel();
}

// ---------------------------------------------------------------- Montagem
export function montarSino(el) {
  const raiz = typeof el === 'string' ? document.getElementById(el) : el;
  if (!raiz) return;
  raiz.classList.add('notif');
  raiz.innerHTML =
    `<button type="button" id="notif-sino" class="notif__sino" aria-haspopup="true"`
    + ` aria-expanded="false" aria-label="Notificações">`
    + `<span aria-hidden="true">&#128276;</span>`
    + `<span id="notif-badge" class="notif__badge" hidden>0</span>`
    + `</button>`
    + `<div id="notif-painel" class="notif__painel" hidden role="dialog" aria-label="Notificações">`
    + `<div class="notif__cabecalho">`
    + `<strong>Notificações</strong>`
    + `<button type="button" id="notif-todas" class="btn btn-sm btn-link p-0">Marcar todas como lidas</button>`
    + `</div>`
    + `<div id="notif-demo" class="notif__demo texto-silencioso" hidden>Modo demonstração — exemplos.</div>`
    + `<ul id="notif-lista" class="notif__lista"></ul>`
    + `</div>`;

  document.getElementById('notif-sino').addEventListener('click', (e) => {
    e.stopPropagation();
    togglePainel();
  });
  document.getElementById('notif-todas').addEventListener('click', (e) => {
    e.stopPropagation();
    marcarTodas();
  });

  const lista = document.getElementById('notif-lista');
  const acionar = (li) => {
    const id = li.getAttribute('data-id');
    marcarUma(id);
    const dem = li.getAttribute('data-demanda');
    if (dem) abrirDemanda(dem);
  };
  lista.addEventListener('click', (e) => {
    const li = e.target.closest('.notif-item');
    if (li) acionar(li);
  });
  lista.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const li = e.target.closest('.notif-item');
    if (li) { e.preventDefault(); acionar(li); }
  });

  // Fecha ao clicar fora ou com Esc.
  document.addEventListener('click', (e) => {
    if (abertoPara && !raiz.contains(e.target)) fecharPainel();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && abertoPara) fecharPainel();
  });

  // Carga inicial do contador + polling (só atualiza o badge quando fechado).
  const ciclo = async () => {
    const { lista: nova } = await buscar();
    itens = Array.isArray(nova) ? nova : [];
    if (abertoPara) pintarLista(); else atualizarBadge();
  };
  ciclo();
  setInterval(ciclo, INTERVALO_MS);
}
