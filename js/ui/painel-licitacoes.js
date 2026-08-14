// =====================================================================
// painel-licitacoes.js — visão gerencial do módulo: KPIs, cards por
// fase, quebras por categoria/prioridade e próximos pregões. Agrega no
// navegador sobre a listagem já filtrada pelo RLS (~centenas de linhas;
// se a base crescer muito, promover a uma fn_lic_painel no banco).
// Todo número clicável leva à lista com o filtro correspondente.
// =====================================================================

import { escapeHtml, fmtPrazo } from './componentes.js';
import {
  ROTULO_CATEGORIA, ROTULO_PRIORIDADE_LIC, estaParado,
  EXEMPLO_FASES, EXEMPLO_PROCESSOS
} from './licitacoes-comum.js';
import * as demo from './demo.js';

const LISTA = './licitacoes.html';

async function carregar() {
  return demo.carregar(
    async () => {
      const s = await import('../services/licitacoes.js');
      const [fases, feriados, tudo] = await Promise.all([
        s.listarFases(), s.listarFeriados(),
        s.listarProcessos({ pagina: 1, porPagina: 1000 })
      ]);
      return { fases, feriados: new Set(feriados), processos: tudo.itens };
    },
    () => ({ fases: EXEMPLO_FASES, feriados: new Set(), processos: EXEMPLO_PROCESSOS })
  );
}

function kpi(valor, rotulo, href, alerta = false) {
  return `<a class="kpi kpi--link${alerta && valor > 0 ? ' kpi--alerta' : ''}" href="${escapeHtml(href)}">
    <div class="kpi__valor">${valor}</div>
    <div class="kpi__rotulo">${escapeHtml(rotulo)}</div>
  </a>`;
}

function renderKpis(d) {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const em7dias = new Date(hoje.getTime() + 7 * 86400000);
  const parados = d.processos.filter(p => estaParado(p, d.feriados)).length;
  const pregoes = d.processos.filter(p => {
    if (!p.data_pregao) return false;
    const dt = new Date(`${p.data_pregao}T12:00:00`);
    return dt >= hoje && dt <= em7dias;
  }).length;
  const faseInicial = [...d.fases].filter(f => !f.desvio)
    .sort((a, b) => a.ordem - b.ordem)[0];
  const triagem = faseInicial
    ? d.processos.filter(p => p.fase_id === faseInicial.id
        || p.fase?.nome === faseInicial.nome).length
    : 0;

  document.getElementById('kpis').innerHTML =
    kpi(d.processos.length, 'Processos ativos', LISTA)
    + kpi(parados, 'Parados', `${LISTA}?parados=1`, true)
    + kpi(pregoes, 'Pregões em 7 dias', LISTA)
    + kpi(triagem, 'Aguardando triagem',
        faseInicial ? `${LISTA}?fase=${encodeURIComponent(faseInicial.id)}` : LISTA);
}

function renderFases(d) {
  const porFase = new Map();
  for (const p of d.processos) {
    const chave = p.fase?.nome ?? '—';
    const grupo = porFase.get(chave) ?? { total: 0, parados: 0 };
    grupo.total++;
    if (estaParado(p, d.feriados)) grupo.parados++;
    porFase.set(chave, grupo);
  }
  document.getElementById('fases').innerHTML = [...d.fases]
    .sort((a, b) => a.ordem - b.ordem)
    .filter(f => porFase.has(f.nome))
    .map(f => {
      const g = porFase.get(f.nome);
      return `<a class="fase-card${f.desvio ? ' fase-card--desvio' : ''}"
          href="${LISTA}?fase=${encodeURIComponent(f.id)}">
        <div class="fase-card__valor">${g.total}</div>
        <div class="fase-card__nome">${escapeHtml(f.nome)}</div>
        ${g.parados ? `<div class="fase-card__parados">${g.parados} parado(s)</div>` : ''}
      </a>`;
    }).join('')
    || '<p class="texto-silencioso">Nenhum processo ativo.</p>';
}

function renderQuebras(d) {
  const contar = (chave) => {
    const m = new Map();
    for (const p of d.processos) m.set(p[chave], (m.get(p[chave]) ?? 0) + 1);
    return m;
  };
  const linha = (rotulo, total, href) =>
    `<a class="d-flex justify-content-between text-decoration-none text-reset py-1 border-bottom"
        href="${escapeHtml(href)}">
      <span>${escapeHtml(rotulo)}</span><span class="fw-bold">${total}</span>
    </a>`;
  const categorias = [...contar('categoria')]
    .map(([c, n]) => linha(ROTULO_CATEGORIA[c] ?? c, n, `${LISTA}?categoria=${encodeURIComponent(c)}`));
  const prioridades = [...contar('prioridade')].sort()
    .map(([pr, n]) => linha(ROTULO_PRIORIDADE_LIC[pr] ?? pr, n, `${LISTA}?prioridade=${encodeURIComponent(pr)}`));
  document.getElementById('quebras').innerHTML = `
    <div class="row g-3">
      <div class="col-12 col-md-6">${categorias.join('')}</div>
      <div class="col-12 col-md-6">${prioridades.join('')}</div>
    </div>`;
}

function renderPregoes(d) {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const proximos = d.processos
    .filter(p => p.data_pregao && new Date(`${p.data_pregao}T12:00:00`) >= hoje)
    .sort((a, b) => a.data_pregao.localeCompare(b.data_pregao))
    .slice(0, 10);
  document.getElementById('pregoes').innerHTML = proximos.length
    ? proximos.map(p =>
      `<a class="d-flex justify-content-between gap-2 text-decoration-none text-reset py-1 border-bottom"
          href="./processo-licitacao.html?id=${encodeURIComponent(p.id)}">
        <span class="texto-silencioso tabular">${escapeHtml(fmtPrazo(p.data_pregao))}</span>
        <span class="flex-grow-1 text-truncate">${escapeHtml(p.objeto)}</span>
        <span class="texto-silencioso small">${escapeHtml(p.numero)}</span>
      </a>`).join('')
    : '<p class="texto-silencioso">Nenhum pregão agendado a partir de hoje.</p>';
}

async function montar() {
  const carr = document.getElementById('carregando');
  let d;
  try {
    d = await carregar();
  } catch (e) {
    console.error(e);
    carr.textContent = `Erro ao carregar o painel: ${e.message || e}`;
    return;
  }
  document.getElementById('tarja-demo').hidden = !d.demo;
  renderKpis(d);
  renderFases(d);
  renderQuebras(d);
  renderPregoes(d);
  carr.hidden = true;
  document.getElementById('conteudo').hidden = false;
}

montar();

import { montarSino } from './notificacoes.js';
import { iniciarSessao } from './sessao.js';
import { montarNavegacao } from './navegacao.js';
montarSino('sino-notificacoes');
iniciarSessao();
montarNavegacao('licitacoes');
