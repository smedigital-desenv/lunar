// =====================================================================
// processo-licitacao.js — detalhe do processo: cabeçalho, dados,
// histórico (timeline imutável) e ações da equipe (acoes-licitacao.js).
// Visibilidade decidida pelo RLS; os botões são conveniência de UI e a
// trava real é a RPC (regra 4 do CLAUDE.md).
// =====================================================================

import { escapeHtml, fmtPrazo, fmtDataHora, toast } from './componentes.js';
import { abrirEExecutar } from './acoes-licitacao.js';
import { ROTULO_CATEGORIA, ROTULO_PRIORIDADE_LIC, COR_PRIORIDADE } from './licitacoes-comum.js';
import * as demo from './demo.js';

const TIPO_LIC = {
  criacao: { rotulo: 'Criação do pedido', icone: '✚' },
  andamento: { rotulo: 'Andamento', icone: '✎' },
  mudanca_fase: { rotulo: 'Mudança de fase', icone: '⇄' },
  mudanca_local: { rotulo: 'Tramitação de local', icone: '→' },
  agendamento_pregao: { rotulo: 'Agendamento de pregão', icone: '◷' },
  edicao: { rotulo: 'Edição', icone: '✎' },
  retificacao: { rotulo: 'Retificação', icone: '✎' },
  ressalva: { rotulo: 'Ressalva', icone: '!' },
  inativacao: { rotulo: 'Inativação', icone: '⊘' },
  reativacao: { rotulo: 'Reativação', icone: '⟳' }
};

const EXEMPLO = {
  processo: {
    id: 'p1', numero: 'LIC-2026-0001', objeto: 'Material escolar – Lista 1',
    categoria: 'almox_sede', prioridade: '2_alta', ativo: true,
    numero_requisicao: '249/2024', numero_processo_compra: '526/2024',
    numero_pregao: '273/2024', numero_processo_solar: '121273/2024',
    link_documentacao: 'https://drive.google.com/drive/folders/exemplo',
    fase: { id: 'f14', nome: 'Em execução' }, local: { id: 'l1', sigla: 'EDUC-ALMOX' },
    unidade: { sigla: 'GCP', nome: 'Gerência de Compras' },
    data_pregao: '2026-03-25', valor_requisicao: 1114490.20,
    valor_arrematado: 980210.55, valor_frustrado_deserto: null,
    criador: { nome: 'Eduardo Gerente' }, criado_em: '2026-01-15T09:00:00-03:00'
  },
  movs: [
    { id: 'm4', tipo: 'mudanca_fase', autor: { nome: 'Ana Licitações' }, texto: 'Atas assinadas.', fase_anterior: { nome: 'Assinatura de contrato/ata' }, fase_nova: { nome: 'Em execução' }, criado_em: '2026-07-01T10:00:00-03:00' },
    { id: 'm3', tipo: 'andamento', autor: { nome: 'Ana Licitações' }, texto: 'Termo de Julgamento e Homologação juntados.', criado_em: '2026-03-28T11:00:00-03:00' },
    { id: 'm2', tipo: 'agendamento_pregao', autor: { nome: 'Ana Licitações' }, data_pregao: '2026-03-25', texto: 'Retomada da sessão.', criado_em: '2026-03-20T14:00:00-03:00' },
    { id: 'm1', tipo: 'criacao', autor: { nome: 'Eduardo Gerente' }, texto: 'Pedido registrado.', criado_em: '2026-01-15T09:00:00-03:00' }
  ],
  fases: [{ id: 'f5', nome: 'Elaborar edital' }, { id: 'f14', nome: 'Em execução' }],
  locais: [{ id: 'l1', sigla: 'EDUC-ALMOX' }, { id: 'l2', sigla: 'ADM-222' }],
  souEquipe: true
};

const id = new URLSearchParams(location.search).get('id');
const ctx = { processo: null, fases: [], locais: [], servico: null };

function fmtValor(v) {
  if (v == null || v === '') return null;
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function linha(rotulo, valor) {
  return valor ? `<div class="d-flex justify-content-between gap-3 py-1 border-bottom">
    <span class="texto-silencioso">${escapeHtml(rotulo)}</span>
    <span class="text-end">${escapeHtml(valor)}</span></div>` : '';
}

function renderCabecalho(p) {
  const chips = [
    `<span class="badge-chip badge-situacao badge-situacao--em_andamento">${escapeHtml(p.fase?.nome ?? '—')}</span>`,
    `<span class="badge-chip badge-prioridade badge-prioridade--${COR_PRIORIDADE[p.prioridade] ?? 'normal'}">${escapeHtml(ROTULO_PRIORIDADE_LIC[p.prioridade] ?? p.prioridade)}</span>`,
    `<span class="badge-chip">${escapeHtml(ROTULO_CATEGORIA[p.categoria] ?? p.categoria)}</span>`,
    p.ativo ? '' : '<span class="badge-chip badge-situacao badge-situacao--inativa">Inativo</span>'
  ].join(' ');
  document.getElementById('cabecalho').innerHTML = `
    <div class="demanda-cabecalho__numero">${escapeHtml(p.numero)}</div>
    <h2 class="demanda-cabecalho__titulo">${escapeHtml(p.objeto)}</h2>
    <div class="demanda-cabecalho__chips">${chips}</div>
    ${p.ativo ? '' : `<p class="timeline__aviso mt-2">Inativado: ${escapeHtml(p.motivo_inativacao ?? '')}</p>`}`;
}

function renderDados(p) {
  const economia = (p.valor_requisicao != null && p.valor_arrematado != null)
    ? p.valor_requisicao - p.valor_arrematado : null;
  document.getElementById('dados').innerHTML = `
    <h2 class="cartao__titulo">Dados do processo</h2>
    ${linha('Unidade solicitante', p.unidade ? `${p.unidade.sigla} — ${p.unidade.nome}` : null)}
    ${linha('Local atual', p.local?.sigla)}
    ${linha('Requisição', p.numero_requisicao)}
    ${linha('Processo de compra', p.numero_processo_compra)}
    ${linha('Pregão eletrônico', p.numero_pregao)}
    ${linha('Processo digital (Solar)', p.numero_processo_solar)}
    ${p.link_documentacao ? `<div class="d-flex justify-content-between gap-3 py-1 border-bottom">
      <span class="texto-silencioso">Documentação</span>
      <a class="text-end text-truncate" style="max-width: 70%"
         href="${escapeHtml(p.link_documentacao)}" target="_blank"
         rel="noopener noreferrer">${escapeHtml(p.link_documentacao)}</a></div>` : ''}
    ${linha('Data do pregão', p.data_pregao ? fmtPrazo(p.data_pregao) : null)}
    ${linha('Valor da requisição', fmtValor(p.valor_requisicao))}
    ${linha('Valor arrematado', fmtValor(p.valor_arrematado))}
    ${linha('Economia', economia != null ? fmtValor(economia) : null)}
    ${linha('Frustrados/desertos', fmtValor(p.valor_frustrado_deserto))}
    ${linha('Registrado por', p.criador?.nome)}
    ${linha('Registrado em', fmtDataHora(p.criado_em))}`;
}

// Complementa o texto com o que a movimentação estruturada carrega.
function metaMov(m) {
  if (m.tipo === 'mudanca_fase' && m.fase_nova) {
    return `${m.fase_anterior?.nome ?? '—'} → ${m.fase_nova.nome}`;
  }
  if (m.tipo === 'mudanca_local' && m.local_novo) {
    return `${m.local_anterior?.sigla ?? '—'} → ${m.local_novo.sigla}`;
  }
  if (m.tipo === 'agendamento_pregao' && m.data_pregao) {
    return `Sessão em ${fmtPrazo(m.data_pregao)}`;
  }
  return null;
}

function renderTimeline(movs, souEquipe) {
  // Retificações/ressalvas apontam para a movimentação original.
  const retifica = new Map(), ressalvas = new Map();
  for (const m of movs) {
    if (m.movimentacao_retificada_id) retifica.set(m.movimentacao_retificada_id, m);
    if (m.movimentacao_ressalvada_id) ressalvas.set(m.movimentacao_ressalvada_id, m);
  }
  const RETIFICAVEIS = ['andamento', 'mudanca_fase', 'mudanca_local', 'agendamento_pregao'];

  document.getElementById('timeline').innerHTML = movs.map(m => {
    const t = TIPO_LIC[m.tipo] ?? { rotulo: m.tipo, icone: '•' };
    const ret = retifica.get(m.id);
    const res = ressalvas.get(m.id);
    const meta = metaMov(m);
    const acoes = (souEquipe && RETIFICAVEIS.includes(m.tipo) && !ret)
      ? `<div class="mt-1">
           <button class="btn btn-sm btn-link p-0 me-3" data-mov-acao="retificar" data-mov-id="${escapeHtml(m.id)}">Retificar</button>
           <button class="btn btn-sm btn-link p-0" data-mov-acao="ressalva" data-mov-id="${escapeHtml(m.id)}">Ressalvar</button>
         </div>` : '';
    return `<li class="timeline__item timeline__item--${escapeHtml(m.tipo)}${ret ? ' timeline__item--retificado' : ''}">
      <span class="timeline__marcador" title="${escapeHtml(t.rotulo)}">${t.icone}</span>
      <div class="timeline__cabecalho">
        <span class="timeline__autor">${escapeHtml(m.autor?.nome ?? '—')}</span>
        <span class="texto-silencioso">${escapeHtml(t.rotulo)}</span>
        <span class="timeline__data">${escapeHtml(fmtDataHora(m.criado_em))}</span>
      </div>
      ${meta ? `<div class="timeline__caminho">${escapeHtml(meta)}</div>` : ''}
      ${m.texto ? `<p class="timeline__texto">${escapeHtml(m.texto)}</p>` : ''}
      ${ret ? `<p class="timeline__aviso">Retificado por ${escapeHtml(ret.autor?.nome ?? '—')} — ${escapeHtml(ret.texto ?? '')}</p>` : ''}
      ${res ? `<p class="timeline__aviso">Ressalva de ${escapeHtml(res.autor?.nome ?? '—')} — ${escapeHtml(res.texto ?? '')}</p>` : ''}
    </li>`;
  }).join('') || '<p class="texto-silencioso">Sem movimentações.</p>';
}

function renderAcoes(p, souEquipe) {
  const el = document.getElementById('acoes');
  if (!souEquipe) { el.hidden = true; return; }
  const botoes = p.ativo
    ? [['andamento', 'Registrar andamento', 'btn-primary'],
       ['fase', 'Mudar fase', 'btn-outline-primary'],
       ['local', 'Tramitar local', 'btn-outline-primary'],
       ['pregao', 'Agendar pregão', 'btn-outline-primary'],
       ['editar', 'Editar dados', 'btn-outline-secondary'],
       ['inativar', 'Inativar', 'btn-outline-danger']]
    : [['reativar', 'Reativar', 'btn-outline-primary']];
  el.hidden = false;
  el.innerHTML = botoes.map(([a, r, c]) =>
    `<button class="btn btn-sm ${c}" data-acao="${a}">${r}</button>`).join('');
}

async function carregar() {
  return demo.carregar(
    async () => {
      const s = await import('../services/licitacoes.js');
      const [processo, movs, fases, locais, souEquipe] = await Promise.all([
        s.obterProcesso(id), s.listarMovimentacoes(id),
        s.listarFases(), s.listarLocais(), s.souEquipe()
      ]);
      if (!processo) throw new Error('Processo não encontrado ou sem acesso.');
      return { processo, movs, fases, locais, souEquipe, servico: s };
    },
    () => ({ ...EXEMPLO, servico: null })
  );
}

async function atualizar() {
  const carr = document.getElementById('carregando');
  carr.hidden = false;
  let d;
  try {
    d = await carregar();
  } catch (e) {
    console.error(e);
    carr.textContent = `Erro ao carregar o processo: ${e.message || e}`;
    return;
  }
  document.getElementById('tarja-demo').hidden = !d.demo;
  ctx.processo = d.processo; ctx.fases = d.fases; ctx.locais = d.locais;
  ctx.servico = d.servico;
  renderCabecalho(d.processo);
  renderDados(d.processo);
  renderTimeline(d.movs, d.souEquipe || d.demo);
  renderAcoes(d.processo, d.souEquipe || d.demo);
  carr.hidden = true;
  document.getElementById('conteudo').hidden = false;
}

// Depois de gravar, avisa a lista (quando aberto no modal sobre ela) —
// no acesso direto, parent === window e o aviso é um no-op.
function avisarLista() {
  try { window.parent?.marcarListaSuja?.(); } catch (_) { /* cross-origin: ignora */ }
}

document.getElementById('acoes').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-acao]');
  if (!b) return;
  if (await abrirEExecutar(b.dataset.acao, ctx)) { avisarLista(); atualizar(); }
});
document.getElementById('timeline').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-mov-acao]');
  if (!b) return;
  if (await abrirEExecutar(b.dataset.movAcao, ctx, b.dataset.movId)) { avisarLista(); atualizar(); }
});

if (!id) {
  document.getElementById('carregando').textContent = 'Processo não informado.';
} else {
  atualizar();
}

import { montarSino } from './notificacoes.js';
import { iniciarSessao } from './sessao.js';
import { montarNavegacao } from './navegacao.js';

// Modo "embed": aberto no modal sobre a lista (modal-processo.js).
// Esconde cabeçalho/navegação (CSS body.embed) e avisa a lista quando
// alguma ação grava — ela recarrega ao fechar o modal.
const EMBED = new URLSearchParams(location.search).get('embed') === '1';
if (EMBED) {
  document.body.classList.add('embed');
} else {
  montarSino('sino-notificacoes');
  iniciarSessao();
  montarNavegacao('licitacoes');
}
