// =====================================================================
// demanda.js — tela de referência da demanda.
// Carrega dados reais (serviços) quando houver config/sessão; caso
// contrário, exibe DADOS DE EXEMPLO para travar o padrão visual sem auth.
// Os modais de tramitação (Sessão 7) abrem pela barra de ações, pelas
// tarefas (devolutiva) e pela timeline (retificar/ressalva).
// =====================================================================

import {
  escapeHtml, fmtPrazo, badgeSituacao, badgePrioridade,
  badgeSigilo, iniciais, itemTimeline, toast
} from './componentes.js';
import { abrirEExecutar } from './acoes-demanda.js';

const NIVEL = { agente_administrativo: 1, chefe_secao: 2, gerente: 3,
                subsecretario: 4, gabinete: 5, admin_ti: 3 };

// Lista de usuários para os selects dos modais (exemplo; virá de serviço com auth).
const USUARIOS_EXEMPLO = [
  { valor: 'u_gustavo', rotulo: 'Gustavo Chefe' },
  { valor: 'u_igor', rotulo: 'Igor Agente' },
  { valor: 'u_julia', rotulo: 'Júlia Agente' },
  { valor: 'u_ana', rotulo: 'Ana Secretária' }
];

// ---------------------------------------------------------------- Dados exemplo
const DADOS_EXEMPLO = {
  usuario: { id: 'u_edu', nome: 'Eduardo Gerente', perfil: 'gerente' },
  demanda: {
    id: 'd1', numero: 'DEM-2026-000042',
    titulo: 'Falta de merenda na EMEF Prof. João da Silva',
    descricao: 'Direção relata interrupção no fornecimento de merenda há três dias.',
    objeto_queixa: 'Regularizar imediatamente o fornecimento de merenda escolar à unidade.',
    categoria: 'Alimentação escolar', setor: 'Suprimentos',
    prioridade: 'alta', situacao: 'em_andamento', sigilo: 'normal',
    prazo: '2026-08-05', numero_processo_solar: '2026.0001234',
    solicitante_nome: 'Ana Secretária', responsavel_nome: 'Gustavo Chefe',
    escola_nome: 'EMEF Prof. João da Silva', aluno_nome: null,
    criado_em: '2026-07-28T12:10:00-03:00', ativo: true
  },
  pessoas: [
    { nome: 'Maria Diretora', vinculo: 'servidor', observacao: 'Diretora da unidade' },
    { nome: 'João Responsável', vinculo: 'responsavel', observacao: 'Presidente do conselho de escola' }
  ],
  tarefas: [
    { id: 't1', parent_id: null, titulo: 'Verificar contrato de merenda', responsavel_nome: 'Gustavo Chefe', situacao: 'em_andamento', ativo: true },
    { id: 't2', parent_id: 't1', titulo: 'Conferir empenho no financeiro', responsavel_nome: 'Júlia Agente', situacao: 'aberta', ativo: true },
    { id: 't3', parent_id: 't1', titulo: 'Contatar fornecedor', responsavel_nome: 'Igor Agente', situacao: 'concluida', ativo: true }
  ],
  movimentacoes: [
    { id: 'm1', tipo: 'criacao', texto: 'Demanda criada.', autor_id: 'u_ana', autor_nome: 'Ana Secretária', criado_em: '2026-07-28T12:10:00-03:00' },
    { id: 'm2', tipo: 'encaminhamento', texto: 'Favor apurar com urgência.', autor_id: 'u_ana', autor_nome: 'Ana Secretária', destinatario_nome: 'Gustavo Chefe', criado_em: '2026-07-28T12:12:00-03:00' },
    { id: 'm3', tipo: 'subtarefa', texto: 'Verificar contrato de merenda', autor_id: 'u_gustavo', autor_nome: 'Gustavo Chefe', criado_em: '2026-07-28T14:30:00-03:00' },
    { id: 'm4', tipo: 'devolutiva', texto: 'Fornecedor confirma entrega para amanhã.', autor_id: 'u_igor', autor_nome: 'Igor Agente', criado_em: '2026-07-29T09:05:00-03:00' },
    { id: 'm5', tipo: 'retificacao', texto: 'Fornecedor confirma entrega para depois de amanhã (correção).', autor_id: 'u_igor', autor_nome: 'Igor Agente', criado_em: '2026-07-29T09:20:00-03:00', movimentacao_retificada_id: 'm4' },
    { id: 'm6', tipo: 'despacho', texto: 'Cobrar retorno do fornecedor até amanhã.', autor_id: 'u_edu', autor_nome: 'Eduardo Gerente', criado_em: '2026-07-29T10:00:00-03:00' }
  ]
};

// ---------------------------------------------------------------- Carregamento
async function carregar() {
  const id = new URLSearchParams(location.search).get('id');
  if (id) {
    try {
      const dados = await carregarReal(id);
      if (dados && dados.demanda) return { ...dados, demo: false };
    } catch (_) { /* sem config/sessão → cai no exemplo */ }
  }
  return { ...DADOS_EXEMPLO, demo: true };
}

async function carregarReal(id) {
  const [dem, tar, mov, ref, auth] = await Promise.all([
    import('../services/demandas.js'),
    import('../services/tarefas.js'),
    import('../services/movimentacoes.js'),
    import('../services/referencias.js'),
    import('../auth.js')
  ]);
  const demanda = await dem.obterDemanda(id);
  if (!demanda) return null;
  const [tarefas, movimentacoes, listaUsuarios, usuario] = await Promise.all([
    tar.listarPorDemanda(id), mov.listarPorDemanda(id),
    ref.listarUsuariosAtivos(), auth.usuarioCorrente()
  ]);
  // Selects de destinatário/responsável precisam de UUIDs reais (não os
  // exemplos u_julia/…). valor = id da conta; rotulo = nome.
  const usuarios = (listaUsuarios || []).map(u => ({ valor: u.id, rotulo: u.nome }));
  return { demanda, tarefas, movimentacoes, pessoas: [], usuario, usuarios };
}

// ---------------------------------------------------------------- Render
function metaItem(rotulo, valor) {
  return `<div class="meta-item">
      <div class="meta-item__rotulo">${escapeHtml(rotulo)}</div>
      <div class="meta-item__valor">${escapeHtml(valor || '—')}</div>
    </div>`;
}
function renderCabecalho(d) {
  return `
    <div class="demanda-cabecalho__numero">${escapeHtml(d.numero)}</div>
    <h2 class="demanda-cabecalho__titulo">${escapeHtml(d.titulo)}</h2>
    <div class="demanda-cabecalho__chips">
      ${badgeSituacao(d.situacao)} ${badgePrioridade(d.prioridade)} ${badgeSigilo(d.sigilo)}
    </div>
    <div class="meta-grade">
      ${metaItem('Responsável', d.responsavel_nome)}
      ${metaItem('Solicitante', d.solicitante_nome)}
      ${metaItem('Prazo', fmtPrazo(d.prazo))}
      ${metaItem('Escola', d.escola_nome)}
      ${metaItem('Categoria', d.categoria)}
      ${metaItem('Processo Solar', d.numero_processo_solar)}
    </div>`;
}
function renderDados(d) {
  return `<h2 class="cartao__titulo">Objeto / queixa</h2>
    <p>${escapeHtml(d.objeto_queixa)}</p>
    ${d.descricao ? `<h2 class="cartao__titulo" style="margin-top:1rem">Descrição</h2>
      <p>${escapeHtml(d.descricao)}</p>` : ''}`;
}
function renderPessoas(pessoas) {
  if (!pessoas || !pessoas.length) {
    return `<h2 class="cartao__titulo">Pessoas envolvidas</h2>
      <p class="texto-silencioso">Nenhuma pessoa registrada.</p>`;
  }
  const linhas = pessoas.map(p =>
    `<li><strong>${escapeHtml(p.nome)}</strong>
      <span class="texto-silencioso">(${escapeHtml(p.vinculo)})</span>
      ${p.observacao ? `— ${escapeHtml(p.observacao)}` : ''}</li>`).join('');
  return `<h2 class="cartao__titulo">Pessoas envolvidas</h2><ul>${linhas}</ul>`;
}

function renderArvore(tarefas, usuarioId) {
  if (!tarefas || !tarefas.length) return '<p class="texto-silencioso">Sem subtarefas.</p>';
  const filhosDe = new Map();
  for (const t of tarefas) {
    const k = t.parent_id || '__raiz';
    if (!filhosDe.has(k)) filhosDe.set(k, []);
    filhosDe.get(k).push(t);
  }
  const ramo = (chave) => {
    const filhos = filhosDe.get(chave) || [];
    if (!filhos.length) return '';
    return `<ul class="arvore">` + filhos.map(t => {
      // "Trocar destino" só para quem encaminhou (criador da tarefa).
      const souCriador = usuarioId && t.criado_por === usuarioId;
      const acaoTrocar = souCriador && t.ativo !== false
        ? `<button class="btn btn-sm btn-link p-0" data-tarefa-acao="reencaminhar" data-tarefa-id="${escapeHtml(t.id)}">Trocar destino</button>`
        : '';
      return `
      <li>
        <div class="tarefa-no${t.ativo === false ? ' tarefa-no--inativa' : ''}">
          <span class="tarefa-no__titulo">${escapeHtml(t.titulo)}</span>
          ${badgeSituacao(t.situacao)}
          <span class="texto-silencioso">${escapeHtml(t.responsavel_nome || '—')}</span>
          <button class="btn btn-sm btn-link p-0" data-tarefa-acao="devolutiva" data-tarefa-id="${escapeHtml(t.id)}">Devolver</button>
          ${acaoTrocar}
        </div>
        ${ramo(t.id)}
      </li>`; }).join('') + `</ul>`;
  };
  return ramo('__raiz');
}

// Janela de retificação aberta: nenhuma movimentação posterior de OUTRO autor
// na mesma entidade (tarefa, ou demanda quando tarefa_id é nulo).
function janelaAberta(m, movs) {
  return !movs.some(p => p.id !== m.id
    && new Date(p.criado_em) > new Date(m.criado_em)
    && p.autor_id !== m.autor_id
    && ((m.tarefa_id && p.tarefa_id === m.tarefa_id) || (!m.tarefa_id && !p.tarefa_id)));
}

function renderTimeline(movs, usuario) {
  if (!movs || !movs.length) return '<li class="texto-silencioso">Sem eventos.</li>';
  const ordenadas = [...movs].sort((a, b) => new Date(a.criado_em) - new Date(b.criado_em));
  const retificadoPorDe = {}, ressalvaDe = {};
  for (const m of ordenadas) {
    if (m.movimentacao_retificada_id) retificadoPorDe[m.movimentacao_retificada_id] = { autor_nome: m.autor_nome, texto: m.texto };
    if (m.movimentacao_ressalvada_id) ressalvaDe[m.movimentacao_ressalvada_id] = { autor_nome: m.autor_nome, texto: m.texto };
  }
  return ordenadas.map(m => {
    const acoes = [];
    if (usuario && m.autor_id === usuario.id && janelaAberta(m, ordenadas)
        && !['retificacao', 'ressalva'].includes(m.tipo)) {
      acoes.push({ chave: 'retificar', rotulo: 'Retificar', movId: m.id });
    }
    if (m.texto && m.tipo !== 'ressalva') {
      acoes.push({ chave: 'ressalva', rotulo: 'Ressalva', movId: m.id });
    }
    return itemTimeline(m, { retificadoPor: retificadoPorDe[m.id], ressalva: ressalvaDe[m.id], acoes });
  }).join('');
}

// Ações da barra conforme perfil + situação (apenas UX; a segurança é o RLS/funções).
function acoesDisponiveis(d, usuario) {
  const nivel = NIVEL[usuario?.perfil] || 0;
  const gerenteMais = nivel >= NIVEL.gerente || usuario?.perfil === 'admin_ti';
  const ativa = d.ativo !== false && d.situacao !== 'inativa';
  const acoes = [];
  if (ativa && d.situacao !== 'concluida') {
    acoes.push(['encaminhar', 'Encaminhar'], ['subtarefa', 'Nova subtarefa'],
               ['complementacao', 'Solicitar complementação'], ['concluir', 'Concluir']);
  }
  if (ativa && gerenteMais) acoes.push(['editar', 'Editar']);
  if (ativa && d.situacao === 'concluida' && gerenteMais) acoes.push(['reabrir', 'Reabrir']);
  if (ativa && gerenteMais) acoes.push(['inativar', 'Inativar']);
  if (!ativa && gerenteMais) acoes.push(['reativar', 'Reativar']);
  // Relatórios do processo (Sessão 10) — disponíveis a quem vê a demanda,
  // inclusive concluída/inativa (certidão para juntada). Versão anonimizada
  // apenas para sigilo restrito (seção 14).
  acoes.push(['relatorio_resumo', 'Relatório-resumo'], ['relatorio_inteiro', 'Inteiro teor']);
  if (d.sigilo === 'restrito') {
    acoes.push(['relatorio_resumo_anon', 'Resumo (anonimizado)'],
               ['relatorio_inteiro_anon', 'Inteiro teor (anonimizado)']);
  }
  return acoes;
}

// Emite um relatório via Edge Function e baixa o PDF. Indisponível em demo.
async function emitirRelatorio(acao, demanda, demo) {
  const tipo = acao.includes('inteiro') ? 'inteiro_teor' : 'resumo';
  const anon = acao.endsWith('_anon');
  if (demo) { toast('Emissão de relatório requer sessão (indisponível no modo demo).', 'aviso'); return; }
  try {
    const svc = await import('../services/relatorios.js');
    toast('Gerando relatório…', 'info');
    const r = await svc.emitirRelatorio(demanda.id, tipo, anon);
    svc.baixarPdf(r.pdf_base64, `${demanda.numero}-${tipo}${anon ? '-anon' : ''}.pdf`);
    toast(`Relatório emitido. Código ${r.codigo}.`, 'sucesso');
  } catch (e) {
    console.error(e);
    toast('Falha ao emitir relatório.', 'erro');
  }
}
function renderAcoes(d, usuario) {
  const acoes = acoesDisponiveis(d, usuario);
  if (!acoes.length) return '<span class="texto-silencioso">Nenhuma ação disponível.</span>';
  return acoes.map(([chave, rotulo]) =>
    `<button class="btn btn-outline-primary" data-acao="${chave}">${escapeHtml(rotulo)}</button>`).join('');
}

// ---------------------------------------------------------------- Inicialização
async function iniciar() {
  const dados = await carregar();
  const { demanda, pessoas, tarefas, movimentacoes, demo } = dados;
  const usuario = dados.usuario || DADOS_EXEMPLO.usuario;

  document.getElementById('tarja-demo').hidden = !demo;
  document.title = `${demanda.numero} — SME Ribeirão Preto`;

  document.getElementById('cabecalho').innerHTML = renderCabecalho(demanda);
  document.getElementById('dados').innerHTML = renderDados(demanda);
  document.getElementById('pessoas').innerHTML = renderPessoas(pessoas);
  document.getElementById('arvore').innerHTML = renderArvore(tarefas, usuario.id);
  document.getElementById('timeline').innerHTML = renderTimeline(movimentacoes, usuario);
  document.getElementById('acoes').innerHTML = renderAcoes(demanda, usuario);

  const ctxBase = { demanda, tarefas, usuarios: dados.usuarios || USUARIOS_EXEMPLO, demo };

  document.getElementById('acoes').addEventListener('click', (e) => {
    const b = e.target.closest('[data-acao]');
    if (!b) return;
    if (b.dataset.acao.startsWith('relatorio')) { emitirRelatorio(b.dataset.acao, demanda, demo); return; }
    abrirEExecutar(b.dataset.acao, { ...ctxBase });
  });
  document.getElementById('arvore').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tarefa-acao]');
    if (b) abrirEExecutar(b.dataset.tarefaAcao, { ...ctxBase, tarefaId: b.dataset.tarefaId });
  });
  document.getElementById('timeline').addEventListener('click', (e) => {
    const b = e.target.closest('[data-mov-acao]');
    if (b) abrirEExecutar(b.dataset.movAcao, { ...ctxBase, movId: b.dataset.movId });
  });

  document.getElementById('carregando').hidden = true;
  document.getElementById('conteudo').hidden = false;
}

iniciar().catch(err => {
  console.error(err);
  document.getElementById('carregando').textContent = 'Erro ao carregar a demanda.';
});

// Sino de notificações no cabeçalho (Sessão 9).
import { montarSino } from './notificacoes.js';
montarSino('sino-notificacoes');

// Sessão e guarda de rota (Sessão 3).
import { iniciarSessao } from './sessao.js';
iniciarSessao();

// Barra de navegação principal.
import { montarNavegacao } from './navegacao.js';
montarNavegacao();
