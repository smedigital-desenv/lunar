// =====================================================================
// dashboard.js — painel de contadores.
// Os números vêm da função fn_dashboard (banco, filtrada por RLS). Sem
// cálculo no JavaScript. Em modo demo, exibe um exemplo.
// =====================================================================

import { escapeHtml } from './componentes.js';

const EXEMPLO = {
  total: 128, abertas: 34, em_andamento: 41, concluidas: 39,
  urgentes: 7, atrasadas: 12, proximas_prazo: 5,
  por_prioridade: { baixa: 20, normal: 70, alta: 30, urgente: 8 },
  por_setor: { 'Pedagógico': 60, 'Suprimentos': 25, '(sem setor)': 25, 'RH': 18 },
  por_responsavel: { 'Gustavo Chefe': 22, 'Júlia Agente': 18, 'Igor Agente': 15, 'Ana Secretária': 9 },
  tempo_medio_dias: 4.3
};

const KPIS = [
  ['abertas', 'Abertas', ''],
  ['em_andamento', 'Em andamento', ''],
  ['atrasadas', 'Atrasadas', 'kpi--alerta'],
  ['proximas_prazo', 'Vencendo (1 dia útil)', 'kpi--alerta'],
  ['urgentes', 'Urgentes', 'kpi--alerta'],
  ['concluidas', 'Concluídas', 'kpi--ok']
];

async function carregar() {
  try {
    const { obterDashboard } = await import('../services/painel.js');
    const dados = await obterDashboard();
    if (dados) return { dados, demo: false };
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

// Barras horizontais proporcionais ao maior valor do grupo.
function renderBarras(obj) {
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

async function iniciar() {
  const { dados, demo } = await carregar();
  document.getElementById('tarja-demo').hidden = !demo;

  document.getElementById('kpis').innerHTML = renderKpis(dados);
  document.getElementById('por-prioridade').innerHTML = renderBarras(dados.por_prioridade);
  document.getElementById('por-setor').innerHTML = renderBarras(dados.por_setor);
  document.getElementById('por-responsavel').innerHTML = renderBarras(dados.por_responsavel);
  document.getElementById('tempo-medio').textContent =
    dados.tempo_medio_dias != null ? `${dados.tempo_medio_dias} dias` : '—';

  document.getElementById('carregando').hidden = true;
  document.getElementById('conteudo').hidden = false;
}

iniciar().catch(err => {
  console.error(err);
  document.getElementById('carregando').textContent = 'Erro ao carregar o painel.';
});
