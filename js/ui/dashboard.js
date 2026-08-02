// =====================================================================
// dashboard.js — painel gerencial.
// Números vêm de fn_dashboard e fn_dashboard_gerencial (banco, filtrados
// por RLS — cada usuário vê o próprio escopo). Sem cálculo no JavaScript.
// Gráficos com Chart.js; se a lib não carregar, cai em barras simples.
// =====================================================================

import { escapeHtml, rotuloSituacao, rotuloPrioridade } from './componentes.js';

const EXEMPLO = {
  total: 128, abertas: 34, em_andamento: 41, concluidas: 39,
  urgentes: 7, atrasadas: 12, proximas_prazo: 5,
  por_prioridade: { baixa: 20, normal: 70, alta: 30, urgente: 8 },
  por_setor: { 'Pedagógico': 60, 'Suprimentos': 25, '(sem setor)': 25, 'RH': 18 },
  por_responsavel: { 'Gustavo Chefe': 22, 'Júlia Agente': 18, 'Igor Agente': 15, 'Ana Secretária': 9 },
  tempo_medio_dias: 4.3,
  por_situacao: { aberta: 34, em_andamento: 38, aguardando_complementacao: 9, devolvida: 5, concluida: 39, reaberta: 3 },
  por_unidade: { GAB: 20, SAI: 45, SFO: 22, SSI: 18, SES: 23 },
  por_tipo: { 'Manutenção Escolar': 30, 'Transporte': 18, 'RH': 22, 'Jurídico': 12, 'Outros': 46 },
  evolucao_mensal: [
    { mes: '2026-03', criadas: 18, concluidas: 12 },
    { mes: '2026-04', criadas: 22, concluidas: 19 },
    { mes: '2026-05', criadas: 20, concluidas: 21 },
    { mes: '2026-06', criadas: 25, concluidas: 17 },
    { mes: '2026-07', criadas: 23, concluidas: 24 },
    { mes: '2026-08', criadas: 20, concluidas: 8 }
  ]
};

const KPIS = [
  ['abertas', 'Abertas', ''],
  ['em_andamento', 'Em andamento', ''],
  ['atrasadas', 'Atrasadas', 'kpi--alerta'],
  ['proximas_prazo', 'Vencendo (1 dia útil)', 'kpi--alerta'],
  ['urgentes', 'Urgentes', 'kpi--alerta'],
  ['concluidas', 'Concluídas', 'kpi--ok']
];

const CORES_SITUACAO = {
  aberta: '#0d6efd', em_andamento: '#b8860b', aguardando_complementacao: '#d97706',
  devolvida: '#7048e8', concluida: '#198754', reaberta: '#0aa2c0', inativa: '#6c757d'
};
const CORES_PRIORIDADE = { baixa: '#6c757d', normal: '#14539a', alta: '#d97706', urgente: '#dc3545' };
const PALETA = ['#14539a', '#0aa2c0', '#198754', '#d97706', '#7048e8', '#dc3545',
                '#b8860b', '#0d6efd', '#6b7684', '#0e3d75', '#20c997', '#e83e8c'];

async function carregar() {
  try {
    const { obterDashboard, obterGerencial } = await import('../services/painel.js');
    const [d, g] = await Promise.all([obterDashboard(), obterGerencial()]);
    if (d) return { dados: { ...d, ...(g || {}) }, demo: false };
  } catch (_) { /* sem config/sessão → exemplo */ }
  return { dados: EXEMPLO, demo: true };
}

function renderKpis(d) {
  return KPIS.map(([chave, rotulo, classe]) =>
    `<div class="kpi ${classe}">
       <div class="kpi__valor">${Number(d[chave] || 0)}</div>
       <div class="kpi__rotulo">${escapeHtml(rotulo)}</div>
     </div>`).join('');
}

// ----------------------------------------------------------- Gráficos
const temChart = () => typeof globalThis.Chart !== 'undefined';

function fallbackBarras(obj) {
  const entradas = Object.entries(obj || {}).sort((a, b) => b[1] - a[1]);
  if (!entradas.length) return '<p class="texto-silencioso">Sem dados.</p>';
  const max = Math.max(...entradas.map(([, v]) => v)) || 1;
  return entradas.map(([rotulo, valor]) =>
    `<div class="barra-linha">
       <span class="texto-silencioso text-truncate">${escapeHtml(rotulo)}</span>
       <span class="barra-trilho"><span class="barra-preenchida" style="width:${(valor / max * 100).toFixed(0)}%"></span></span>
       <strong>${Number(valor)}</strong>
     </div>`).join('');
}

const cores = (labels, mapa) => labels.map((l, i) => (mapa && mapa[l]) || PALETA[i % PALETA.length]);

function donut(id, obj, mapaCores, rotulador) {
  const el = document.getElementById(id);
  const entradas = Object.entries(obj || {}).filter(([, v]) => v);
  if (!temChart()) { el.parentElement.innerHTML = fallbackBarras(obj); return; }
  if (!entradas.length) { el.parentElement.innerHTML = '<p class="texto-silencioso">Sem dados.</p>'; return; }
  const labels = entradas.map(([k]) => k);
  new globalThis.Chart(el, {
    type: 'doughnut',
    data: { labels: labels.map(rotulador || (x => x)),
            datasets: [{ data: entradas.map(([, v]) => v), backgroundColor: cores(labels, mapaCores) }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
  });
}

function barras(id, obj, { horizontal = false } = {}) {
  const el = document.getElementById(id);
  const entradas = Object.entries(obj || {}).sort((a, b) => b[1] - a[1]);
  if (!temChart()) { el.parentElement.innerHTML = fallbackBarras(obj); return; }
  if (!entradas.length) { el.parentElement.innerHTML = '<p class="texto-silencioso">Sem dados.</p>'; return; }
  new globalThis.Chart(el, {
    type: 'bar',
    data: { labels: entradas.map(([k]) => k),
            datasets: [{ data: entradas.map(([, v]) => v), backgroundColor: '#14539a' }] },
    options: { indexAxis: horizontal ? 'y' : 'x', responsive: true, maintainAspectRatio: false,
               plugins: { legend: { display: false } },
               scales: { x: { ticks: { precision: 0 } }, y: { ticks: { precision: 0 } } } }
  });
}

function linha(id, arr) {
  const el = document.getElementById(id);
  const pontos = arr || [];
  if (!temChart()) {
    el.parentElement.innerHTML = '<div class="texto-silencioso" style="font-size:.8rem">criadas / concluídas</div>'
      + pontos.map(p => `<div class="barra-linha"><span class="texto-silencioso">${escapeHtml(p.mes)}</span>`
        + `<strong>${Number(p.criadas)} / ${Number(p.concluidas)}</strong></div>`).join('');
    return;
  }
  new globalThis.Chart(el, {
    type: 'line',
    data: { labels: pontos.map(p => p.mes), datasets: [
      { label: 'Criadas', data: pontos.map(p => p.criadas), borderColor: '#14539a', backgroundColor: '#14539a33', tension: .3 },
      { label: 'Concluídas', data: pontos.map(p => p.concluidas), borderColor: '#198754', backgroundColor: '#19875433', tension: .3 }
    ] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } },
               scales: { y: { ticks: { precision: 0 } } } }
  });
}

async function iniciar() {
  const { dados, demo } = await carregar();
  document.getElementById('tarja-demo').hidden = !demo;

  document.getElementById('kpis').innerHTML = renderKpis(dados);
  donut('g-situacao', dados.por_situacao, CORES_SITUACAO, rotuloSituacao);
  donut('g-prioridade', dados.por_prioridade, CORES_PRIORIDADE, rotuloPrioridade);
  linha('g-evolucao', dados.evolucao_mensal);
  barras('g-setor', dados.por_setor);
  barras('g-responsavel', dados.por_responsavel, { horizontal: true });
  barras('g-unidade', dados.por_unidade);
  barras('g-tipo', dados.por_tipo);
  document.getElementById('tempo-medio').textContent =
    dados.tempo_medio_dias != null ? `${dados.tempo_medio_dias} dias` : '—';

  document.getElementById('carregando').hidden = true;
  document.getElementById('conteudo').hidden = false;
}

iniciar().catch(err => {
  console.error(err);
  document.getElementById('carregando').textContent = 'Erro ao carregar o painel.';
});

// Sino de notificações no cabeçalho (Sessão 9).
import { montarSino } from './notificacoes.js';
montarSino('sino-notificacoes');

// Sessão e guarda de rota (Sessão 3).
import { iniciarSessao } from './sessao.js';
iniciarSessao();
