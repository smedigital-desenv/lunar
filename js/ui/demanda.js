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
  { valor: 'u_edu', rotulo: 'Eduardo Gerente' },
  { valor: 'u_gustavo', rotulo: 'Gustavo Chefe' },
  { valor: 'u_igor', rotulo: 'Igor Agente' },
  { valor: 'u_julia', rotulo: 'Júlia Agente' },
  { valor: 'u_ana', rotulo: 'Ana Secretária' }
];

// ---------------------------------------------------------------- Dados exemplo
const DADOS_EXEMPLO = {
  usuario: { id: 'u_edu', nome: 'Eduardo Gerente', perfil: 'gerente' },
  // responsavel_atual_id/criado_por (demanda) e responsavel_id/criado_por
  // (tarefas) existem só para o exemplo exercitar a barra de ações "dono
  // da demanda" sem sessão real — não precisam bater 100% com o texto da
  // timeline de exemplo abaixo.
  demanda: {
    id: 'd1', numero: 'DEM-2026-000042',
    titulo: 'Falta de merenda na EMEF Prof. João da Silva',
    descricao: 'Direção relata interrupção no fornecimento de merenda há três dias.',
    objeto_queixa: 'Regularizar imediatamente o fornecimento de merenda escolar à unidade.',
    categoria: 'Alimentação escolar', setor: 'Suprimentos',
    prioridade: 'alta', situacao: 'em_andamento', sigilo: 'normal',
    prazo: '2026-08-05', numero_processo_solar: '2026.0001234',
    solicitante_nome: 'Ana Secretária', responsavel_nome: 'Eduardo Gerente',
    responsavel_atual_id: 'u_edu', criado_por: 'u_edu',
    escola_nome: 'EMEF Prof. João da Silva', aluno_nome: null,
    criado_em: '2026-07-28T12:10:00-03:00', ativo: true
  },
  pessoas: [
    { nome: 'Maria Diretora', vinculo: 'servidor', observacao: 'Diretora da unidade' },
    { nome: 'João Responsável', vinculo: 'responsavel', observacao: 'Presidente do conselho de escola' }
  ],
  tarefas: [
    { id: 't1', parent_id: null, titulo: 'Verificar contrato de merenda', responsavel_id: 'u_gustavo', responsavel_nome: 'Gustavo Chefe', criado_por: 'u_edu', situacao: 'em_andamento', ativo: true },
    { id: 't2', parent_id: 't1', titulo: 'Conferir empenho no financeiro', responsavel_id: 'u_julia', responsavel_nome: 'Júlia Agente', criado_por: 'u_gustavo', situacao: 'aberta', ativo: true },
    { id: 't3', parent_id: 't1', titulo: 'Contatar fornecedor', responsavel_id: 'u_igor', responsavel_nome: 'Igor Agente', criado_por: 'u_gustavo', situacao: 'concluida', ativo: true }
  ],
  movimentacoes: [
    { id: 'm1', tipo: 'criacao', texto: 'Demanda criada.', autor_id: 'u_ana', autor_nome: 'Ana Secretária', criado_em: '2026-07-28T12:10:00-03:00' },
    { id: 'm2', tipo: 'encaminhamento', texto: 'Favor apurar com urgência.', autor_id: 'u_ana', autor_nome: 'Ana Secretária', destinatario_nome: 'Gustavo Chefe', tarefa_id: 't1', criado_em: '2026-07-28T12:12:00-03:00' },
    { id: 'm3', tipo: 'subtarefa', texto: 'Verificar contrato de merenda', autor_id: 'u_gustavo', autor_nome: 'Gustavo Chefe', tarefa_id: 't1', criado_em: '2026-07-28T14:30:00-03:00' },
    { id: 'm4', tipo: 'devolutiva', texto: 'Fornecedor confirma entrega para amanhã.', autor_id: 'u_igor', autor_nome: 'Igor Agente', tarefa_id: 't3', criado_em: '2026-07-29T09:05:00-03:00' },
    { id: 'm5', tipo: 'retificacao', texto: 'Fornecedor confirma entrega para depois de amanhã (correção).', autor_id: 'u_igor', autor_nome: 'Igor Agente', tarefa_id: 't3', criado_em: '2026-07-29T09:20:00-03:00', movimentacao_retificada_id: 'm4' },
    { id: 'm6', tipo: 'despacho', texto: 'Cobrar retorno do fornecedor até amanhã.', autor_id: 'u_edu', autor_nome: 'Eduardo Gerente', criado_em: '2026-07-29T10:00:00-03:00' }
  ]
};

// ---------------------------------------------------------------- Carregamento
async function carregar() {
  const id = new URLSearchParams(location.search).get('id');
  // Sem id na URL não há o que buscar: é o exemplo, não erro.
  if (!id) return { ...DADOS_EXEMPLO, demo: true };
  return demo.carregar(
    async () => {
      const dados = await carregarReal(id);
      if (!dados?.demanda) throw new Error('Demanda não encontrada ou sem permissão de acesso.');
      return dados;
    },
    () => ({ ...DADOS_EXEMPLO })
  );
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
  const [tarefas, movimentacoes, pessoas, listaUsuarios, listaTipos, listaEscolas, usuario] =
    await Promise.all([
      tar.listarPorDemanda(id), mov.listarPorDemanda(id), dem.listarPessoas(id),
      ref.listarUsuariosAtivos(), ref.listarTipos(), ref.listarEscolas(), auth.usuarioCorrente()
    ]);
  // Selects de destinatário/responsável precisam de UUIDs reais (não os
  // exemplos u_julia/…). valor = id da conta; rotulo = nome.
  const usuarios = (listaUsuarios || []).map(u => ({ valor: u.id, rotulo: u.nome }));
  const tipos = (listaTipos || []).map(t => ({ valor: t.id, rotulo: t.nome }));
  const escolas = (listaEscolas || []).map(e => ({ valor: e.id, rotulo: e.nome }));
  return { demanda, tarefas, movimentacoes, pessoas, usuario, usuarios, tipos, escolas };
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
  // O link abre em aba nova. O banco só aceita http(s):// (CHECK do
  // sql/044), então não há como injetar `javascript:` neste href.
  const link = d.link_documentacao
    ? `<h2 class="cartao__titulo" style="margin-top:1rem">Documentação</h2>
       <p><a href="${escapeHtml(d.link_documentacao)}" target="_blank"
             rel="noopener noreferrer">${escapeHtml(d.link_documentacao)}</a></p>`
    : '';
  // Objeto/queixa não existe no controle interno (sql/046). Nas 31
  // demandas migradas da SUBPED ele guarda uma cópia do título, herdada
  // do NOT NULL antigo — esconder aqui basta, sem mexer nos dados.
  const objeto = d.tipo_formato !== 'controle' && d.objeto_queixa
    ? `<h2 class="cartao__titulo">Objeto / queixa</h2>
       <p>${escapeHtml(d.objeto_queixa)}</p>`
    : '';
  const descricao = d.descricao
    ? `<h2 class="cartao__titulo"${objeto ? ' style="margin-top:1rem"' : ''}>Descrição</h2>
       <p>${escapeHtml(d.descricao)}</p>`
    : '';
  return `${objeto}${descricao}${link}` ||
    '<p class="texto-silencioso">Sem descrição registrada.</p>';
}
// No controle interno não há munícipe envolvido: a seção some, em vez de
// exibir "nenhuma pessoa registrada" em toda demanda da subsecretaria.
function renderPessoas(pessoas, demanda, podeEditar) {
  if (demanda?.tipo_formato === 'controle') return '';

  // Corrigir/remover só para quem participa (sql/047). Esconder aqui é
  // cortesia, não segurança: a função do banco recusa de qualquer forma.
  const acoes = (p) => podeEditar
    ? ` <button type="button" class="botao-inline" data-pessoa="${escapeHtml(p.id)}"
          data-acao-pessoa="pessoa_editar">corrigir</button>
        <button type="button" class="botao-inline" data-pessoa="${escapeHtml(p.id)}"
          data-acao-pessoa="pessoa_inativar">remover</button>`
    : '';
  const botaoAdd = podeEditar
    ? `<button type="button" class="btn btn-sm btn-outline-primary"
         data-acao-pessoa="pessoa_adicionar">+ Acrescentar pessoa</button>`
    : '';

  if (!pessoas || !pessoas.length) {
    return `<h2 class="cartao__titulo">Pessoas envolvidas</h2>
      <p class="texto-silencioso">Nenhuma pessoa registrada.</p>${botaoAdd}`;
  }
  const linhas = pessoas.map(p =>
    `<li><strong>${escapeHtml(p.nome)}</strong>
      <span class="texto-silencioso">(${escapeHtml(p.vinculo)})</span>
      ${p.observacao ? `— ${escapeHtml(p.observacao)}` : ''}${acoes(p)}</li>`).join('');
  return `<h2 class="cartao__titulo">Pessoas envolvidas</h2>
    <ul>${linhas}</ul>${botaoAdd}`;
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
      const ehResponsavel = !usuarioId || t.responsavel_id === usuarioId;
      const ativa = t.ativo !== false && t.situacao !== 'concluida';
      // "Concluir" (executou) e "Devolver" (não vai executar): só o responsável
      // atual, enquanto a tarefa está em aberto. Devolver não aparece se já
      // devolvida (evita devolver de novo).
      const acaoConcluir = ativa && ehResponsavel
        ? `<button class="btn btn-sm btn-link p-0" data-tarefa-acao="concluir_tarefa" data-tarefa-id="${escapeHtml(t.id)}">Concluir</button>`
        : '';
      const acaoDevolver = ativa && t.situacao !== 'devolvida' && ehResponsavel
        ? `<button class="btn btn-sm btn-link p-0 text-danger" data-tarefa-acao="devolutiva" data-tarefa-id="${escapeHtml(t.id)}">Devolver</button>`
        : '';
      // "Trocar destino" só para quem encaminhou (criador), enquanto a
      // tarefa não estiver concluída — inclusive quando foi devolvida
      // (é o caso mais comum de querer redirecionar para outra pessoa).
      const souCriador = usuarioId && t.criado_por === usuarioId;
      const acaoTrocar = souCriador && ativa
        ? `<button class="btn btn-sm btn-link p-0" data-tarefa-acao="reencaminhar" data-tarefa-id="${escapeHtml(t.id)}">Trocar destino</button>`
        : '';
      return `
      <li>
        <div class="tarefa-no${t.ativo === false ? ' tarefa-no--inativa' : ''}">
          <span class="tarefa-no__titulo">${escapeHtml(t.titulo)}</span>
          ${badgeSituacao(t.situacao)}
          <span class="texto-silencioso">${escapeHtml(t.responsavel_nome || '—')}</span>
          ${acaoConcluir}
          ${acaoDevolver}
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

// Caminho da tarefa até a raiz (ex.: ["Verificar contrato", "Conferir empenho"]),
// para a timeline mostrar a QUAL tarefa/subtarefa cada evento pertence.
// Movimentação sem tarefa_id (tarefa_id nulo) é da demanda em si — [].
function caminhoTarefa(tarefaId, tarefasPorId) {
  const caminho = [];
  let atual = tarefaId ? tarefasPorId.get(tarefaId) : null;
  while (atual) {
    caminho.unshift(atual.titulo);
    atual = atual.parent_id ? tarefasPorId.get(atual.parent_id) : null;
  }
  return caminho;
}

function renderTimeline(movs, usuario, tarefas) {
  if (!movs || !movs.length) return '<li class="texto-silencioso">Sem eventos.</li>';
  const tarefasPorId = new Map((tarefas || []).map(t => [t.id, t]));
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
    return itemTimeline(m, {
      retificadoPor: retificadoPorDe[m.id], ressalva: ressalvaDe[m.id], acoes,
      caminho: caminhoTarefa(m.tarefa_id, tarefasPorId)
    });
  }).join('');
}

// Dono da demanda: quem a criou ou é o responsável atual. Só eles
// encaminham, alteram responsável ou concluem — sem atalho de
// chefia/gabinete (sql/033).
function ehDonoDaDemanda(d, usuario) {
  return !!usuario && (usuario.id === d.responsavel_atual_id || usuario.id === d.criado_por);
}
function ehGerenteMais(usuario) {
  const nivel = NIVEL[usuario?.perfil] || 0;
  return nivel >= NIVEL.gerente || usuario?.perfil === 'admin_ti';
}

// Ações da barra conforme perfil + situação (apenas UX; a segurança é o RLS/funções).
function acoesDisponiveis(d, usuario, tarefas) {
  const gerenteMais = ehGerenteMais(usuario);
  const ativa = d.ativo !== false && d.situacao !== 'inativa';
  const souDono = ehDonoDaDemanda(d, usuario);
  // Quem só recebeu uma tarefa (não é dono da demanda) pode criar
  // subtarefa a partir dela, nunca direto na raiz.
  const tenhoTarefaAtiva = !!usuario && (tarefas || []).some(t =>
    t.ativo !== false && t.situacao !== 'concluida' && t.responsavel_id === usuario.id);
  const acoes = [];
  // Prestar a complementação pedida: só faz sentido enquanto a demanda
  // está parada aguardando essa resposta (e é o que retoma o prazo).
  if (ativa && d.situacao === 'aguardando_complementacao') {
    acoes.push(['complementar', 'Prestar complementação']);
  }
  if (ativa && d.situacao !== 'concluida') {
    if (souDono) acoes.push(['encaminhar', 'Encaminhar']);
    if (souDono || tenhoTarefaAtiva) acoes.push(['subtarefa', 'Nova subtarefa']);
    if (souDono) acoes.push(['complementacao', 'Solicitar complementação'], ['concluir', 'Concluir']);
  }
  // Comentar: registrar uma informação/observação sem tramitar. Disponível
  // mesmo em demanda concluída (mas não inativa — fn_criar_comentario exige
  // demanda ativa, igual às demais ações de escrita).
  if (ativa) acoes.push(['comentario', 'Comentar']);
  // Editar: chefia mexe em qualquer campo; quem é só dono (sem ser chefia)
  // vê a tela para poder corrigir o responsável (sql/034) — o próprio
  // modal restringe os campos conforme o caso (acoes-demanda.js).
  if (ativa && (gerenteMais || souDono)) acoes.push(['editar', 'Editar']);
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
    const nome = `${demanda.numero}-${tipo}${anon ? '-anon' : ''}.pdf`;
    const { visualizarPdf } = await import('./visualizador-pdf.js');
    visualizarPdf({
      titulo: `${acao.includes('inteiro') ? 'Inteiro teor' : 'Relatório-resumo'} — ${demanda.numero}`,
      blob: svc.pdfBlob(r.pdf_base64),
      nomeArquivo: nome,
      codigo: r.codigo
    });
    toast(`Relatório emitido. Código ${r.codigo}.`, 'sucesso');
  } catch (e) {
    console.error('Falha ao emitir relatório:', e);
    toast(`Falha ao emitir relatório: ${e.message || e}`, 'erro');
  }
}
// Ação em destaque conforme o estado da demanda: é o próximo passo natural
// do fluxo. As de uso corrente ficam discretas ao lado; as raras (governança
// e relatórios) vão para o menu "Mais", para a barra não virar uma fileira
// de botões idênticos.
const ACAO_PRIMARIA = ['complementar', 'concluir', 'encaminhar', 'reativar'];
const ACAO_RECOLHIDA = ['editar', 'inativar', 'reativar', 'reabrir',
  'relatorio_resumo', 'relatorio_inteiro', 'relatorio_resumo_anon', 'relatorio_inteiro_anon'];

function botao(chave, rotulo, classe) {
  return `<button class="btn ${classe}" data-acao="${chave}">${escapeHtml(rotulo)}</button>`;
}

function renderAcoes(d, usuario, tarefas) {
  const acoes = acoesDisponiveis(d, usuario, tarefas);
  if (!acoes.length) return '<span class="texto-silencioso">Nenhuma ação disponível.</span>';

  const primaria = ACAO_PRIMARIA.map(c => acoes.find(([k]) => k === c)).find(Boolean);
  const recolhidas = acoes.filter(([k]) => k !== primaria?.[0] && ACAO_RECOLHIDA.includes(k));
  const diretas = acoes.filter(([k]) => k !== primaria?.[0] && !ACAO_RECOLHIDA.includes(k));

  const partes = [];
  if (primaria) partes.push(botao(primaria[0], primaria[1], 'btn-primary'));
  for (const [k, r] of diretas) partes.push(botao(k, r, 'btn-outline-secondary'));
  if (recolhidas.length) {
    partes.push('<span class="barra-acoes__espaco"></span>');
    partes.push(`<div class="dropdown">
      <button class="btn btn-outline-secondary dropdown-toggle" data-bs-toggle="dropdown"
              aria-expanded="false">Mais</button>
      <ul class="dropdown-menu dropdown-menu-end">
        ${recolhidas.map(([k, r]) =>
          `<li><button class="dropdown-item" data-acao="${k}">${escapeHtml(r)}</button></li>`).join('')}
      </ul></div>`);
  }
  return partes.join('');
}

// Cliques das ações de pessoa envolvida. Recarrega ao gravar, porque a
// lista vem de uma consulta separada.
function ligarAcoesPessoa(ctx, pessoas) {
  document.getElementById('pessoas').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-acao-pessoa]');
    if (!b) return;
    const id = b.dataset.pessoa;
    const pessoa = id ? (pessoas || []).find(p => p.id === id) : null;
    await abrirEExecutar(b.dataset.acaoPessoa, { ...ctx, pessoa });
  });
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
  // Participa quem está em `participantes` — o mesmo critério do sql/047.
  // Em demonstração não há lista: libera para a tela ficar exercitável.
  const souParticipante = demo
    || (demanda.participantes_ids || []).includes(usuario.id);
  document.getElementById('pessoas').innerHTML =
    renderPessoas(pessoas, demanda, souParticipante);
  document.getElementById('arvore').innerHTML = renderArvore(tarefas, usuario.id);
  document.getElementById('timeline').innerHTML = renderTimeline(movimentacoes, usuario, tarefas);
  document.getElementById('acoes').innerHTML = renderAcoes(demanda, usuario, tarefas);

  const ctxBase = {
    demanda, tarefas, usuarios: dados.usuarios || USUARIOS_EXEMPLO, demo, usuario,
    tipos: dados.tipos || [], escolas: dados.escolas || [],
    souDono: ehDonoDaDemanda(demanda, usuario), podeEditarGeral: ehGerenteMais(usuario)
  };

  ligarAcoesPessoa(ctxBase, pessoas);

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

import { montarSino } from './notificacoes.js';
import { iniciarSessao } from './sessao.js';
import { montarNavegacao } from './navegacao.js';
import * as demo from './demo.js';

// Modo "embed": a tela é aberta dentro do painel de detalhe de uma lista.
// Esconde cabeçalho/navegação (via CSS) e não monta sino/sessão/menu.
const EMBED = new URLSearchParams(location.search).get('embed') === '1';
if (EMBED) {
  document.body.classList.add('embed');
} else {
  montarSino('sino-notificacoes');
  iniciarSessao();
  montarNavegacao();
  // Barra lateral com a lista (desktop): não se perde a lista ao abrir a demanda.
  const idAtual = new URLSearchParams(location.search).get('id');
  if (idAtual) {
    import('./detalhe-lado.js').then(m => m.montarSidebarDemanda(idAtual));
  }
}
