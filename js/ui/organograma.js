// =====================================================================
// organograma.js — árvore da estrutura organizacional, com edição.
// Recolhível, mobile-first. Cada nó abre um painel com os titulares e as
// ações de renomear, mover e inativar.
//
// A tela não decide permissão: ela só evita oferecer o que o banco
// recusaria. Quem manda é `perfis.pode_gerir_organograma`, conferido
// dentro de cada RPC (regra 4).
// =====================================================================

import { escapeHtml, toast } from './componentes.js';
import { abrirFormulario } from './modais.js';
import { montarNavegacao } from './navegacao.js';
import { iniciarSessao } from './sessao.js';
import { montarSino } from './notificacoes.js';

const ROTULO_TIPO = {
  gabinete: 'Gabinete', subsecretaria: 'Subsecretaria',
  gerencia: 'Gerência', secao: 'Seção'
};
const TIPO_FILHO = {
  gabinete: [['subsecretaria', 'Subsecretaria'], ['secao', 'Seção (ligada ao Gabinete)']],
  subsecretaria: [['gerencia', 'Gerência']],
  gerencia: [['secao', 'Seção']],
  secao: []
};

const el = (id) => document.getElementById(id);
const estado = { unidades: [], recolhidos: new Set(), podeEditar: false, filtro: '', verInativas: false };
let svc = null;

// Dados de exemplo, para a tela abrir sem sessão/banco (modo demo).
const EXEMPLO = [
  { id: 'g', parent_id: null, tipo: 'gabinete', nome: 'Gabinete do Secretário', sigla: 'GAB', ativo: true, pessoas: 2 },
  { id: 's1', parent_id: 'g', tipo: 'subsecretaria', nome: 'Subsecretaria Pedagógica', sigla: 'SUBPED', ativo: true, pessoas: 1 },
  { id: 'n', parent_id: 'g', tipo: 'secao', nome: 'Núcleo de Apoio Administrativo', sigla: 'NAA', ativo: true, pessoas: 0 },
  { id: 'g1', parent_id: 's1', tipo: 'gerencia', nome: 'Gerência de Ensino Fundamental', sigla: 'GEF', ativo: true, pessoas: 1 },
  { id: 'c1', parent_id: 'g1', tipo: 'secao', nome: 'Seção de Anos Iniciais', sigla: 'SAI', ativo: true, pessoas: 1 }
];

// --------------------------------------------------------------- Render

// Um nó e sua descendência. `aberto` é o padrão; o usuário recolhe o que
// não quer ver, e a escolha vale só enquanto a página estiver aberta.
function noHtml(u, nivel) {
  const temFilhas = u.filhas.length > 0;
  const recolhido = estado.recolhidos.has(u.id);
  const pessoas = u.pessoas === 1 ? '1 pessoa' : `${u.pessoas ?? 0} pessoas`;

  const cabeca = `
    <div class="org-no org-no--${escapeHtml(u.tipo)}${u.ativo ? '' : ' org-no--inativa'}"
         style="--nivel:${nivel}" data-id="${escapeHtml(u.id)}">
      <button type="button" class="org-no__toggle" data-toggle="${escapeHtml(u.id)}"
              ${temFilhas ? '' : 'disabled'}
              aria-label="${recolhido ? 'Expandir' : 'Recolher'}">
        ${temFilhas ? (recolhido ? '▸' : '▾') : '·'}
      </button>
      <button type="button" class="org-no__corpo" data-abrir="${escapeHtml(u.id)}">
        <span class="org-no__nome">${escapeHtml(u.nome)}</span>
        <span class="org-no__meta">
          ${u.sigla ? `<span class="org-no__sigla">${escapeHtml(u.sigla)}</span>` : ''}
          <span>${escapeHtml(ROTULO_TIPO[u.tipo] ?? u.tipo)}</span>
          <span>· ${pessoas}</span>
          ${u.ativo ? '' : '<span class="org-no__inativa">inativa</span>'}
        </span>
      </button>
    </div>`;

  if (recolhido || !temFilhas) return cabeca;
  return cabeca + u.filhas.map(f => noHtml(f, nivel + 1)).join('');
}

// O filtro achata a árvore: quem busca "matrícula" quer achar a unidade,
// não navegar até ela. Fora da busca, a hierarquia volta.
function render() {
  const visiveis = estado.unidades.filter(u => estado.verInativas || u.ativo);
  const termo = estado.filtro.trim().toLowerCase();

  let html;
  if (termo) {
    const achados = visiveis.filter(u =>
      u.nome.toLowerCase().includes(termo)
      || (u.sigla ?? '').toLowerCase().includes(termo));
    html = achados.length
      ? achados.map(u => noHtml({ ...u, filhas: [] }, 0)).join('')
      : '<p class="texto-silencioso">Nenhuma unidade encontrada.</p>';
    el('resumo').textContent = `${achados.length} unidade(s) encontrada(s) para “${estado.filtro}”.`;
  } else {
    html = svc.montarArvore(visiveis).map(r => noHtml(r, 0)).join('');
    const ativas = estado.unidades.filter(u => u.ativo).length;
    el('resumo').textContent = `${ativas} unidades ativas`
      + (estado.verInativas ? ` · ${estado.unidades.length - ativas} inativas` : '')
      + (estado.podeEditar ? ' · toque numa unidade para editar' : '');
  }
  el('arvore').innerHTML = html;
}

// --------------------------------------------------------------- Ações

async function recarregar() {
  estado.unidades = await svc.listarUnidades();
  render();
}

// Painel de uma unidade: quem está lotado nela e o que dá para fazer.
async function abrirUnidade(id) {
  const u = estado.unidades.find(x => x.id === id);
  if (!u) return;

  let pessoas = [];
  try { pessoas = await svc.listarPessoas(id); } catch (_) { /* demo/offline */ }

  // O campo `aviso` do abrirFormulario recebe TEXTO e o escapa — nada de
  // marcação aqui. Por isso a lista sai em uma linha, separada por vírgula.
  const listaPessoas = pessoas.length
    ? pessoas.map(p => `${p.nome} (${p.perfil})`).join(', ')
    : 'Ninguém lotado nesta unidade.';

  const filhos = TIPO_FILHO[u.tipo] ?? [];
  const acoes = !estado.podeEditar ? [] : [
    ...filhos.map(([tipo, rotulo]) => ({ acao: `criar:${tipo}`, rotulo: `Criar ${rotulo}` })),
    { acao: 'editar', rotulo: 'Renomear' },
    ...(u.tipo === 'gabinete' ? [] : [{ acao: 'mover', rotulo: 'Mover de lugar' }]),
    u.ativo ? { acao: 'inativar', rotulo: 'Inativar' } : { acao: 'reativar', rotulo: 'Reativar' }
  ];

  const escolha = await abrirFormulario({
    titulo: u.nome,
    textoConfirmar: acoes.length ? 'Continuar' : 'Fechar',
    campos: [
      { tipo: 'aviso',
        texto: `${ROTULO_TIPO[u.tipo] ?? u.tipo}${u.sigla ? ` · ${u.sigla}` : ''} — ${listaPessoas}` },
      ...(u.ativo ? [] : [{ tipo: 'aviso', texto: `Inativa: ${u.motivo_inativacao ?? '—'}` }]),
      ...(acoes.length ? [{
        nome: 'acao', rotulo: 'O que deseja fazer?', tipo: 'select',
        opcoes: acoes.map(a => ({ valor: a.acao, rotulo: a.rotulo }))
      }] : [])
    ]
  });
  if (!escolha || !escolha.acao) return;

  const [verbo, tipoNovo] = escolha.acao.split(':');
  try {
    if (verbo === 'criar') await criar(u, tipoNovo);
    else if (verbo === 'editar') await editar(u);
    else if (verbo === 'mover') await mover(u);
    else if (verbo === 'inativar') await inativar(u);
    else if (verbo === 'reativar') await reativar(u);
  } catch (e) {
    // As funções do banco levantam mensagens em português — repassamos.
    toast(e.message || 'Não foi possível concluir a operação.', 'erro');
  }
}

async function criar(mae, tipo) {
  const v = await abrirFormulario({
    titulo: `Nova ${ROTULO_TIPO[tipo]?.toLowerCase() ?? tipo} em ${mae.nome}`,
    textoConfirmar: 'Criar',
    campos: [
      { nome: 'nome', rotulo: 'Nome', obrigatorio: true },
      { nome: 'sigla', rotulo: 'Sigla' }
    ]
  });
  if (!v) return;
  await svc.criarUnidade({ parentId: mae.id, tipo, nome: v.nome, sigla: v.sigla });
  toast('Unidade criada.');
  await recarregar();
}

async function editar(u) {
  const v = await abrirFormulario({
    titulo: `Renomear ${u.nome}`,
    textoConfirmar: 'Salvar',
    campos: [
      { nome: 'nome', rotulo: 'Nome', obrigatorio: true, valor: u.nome },
      { nome: 'sigla', rotulo: 'Sigla', valor: u.sigla ?? '' },
      { nome: 'justificativa', rotulo: 'Justificativa', tipo: 'textarea', obrigatorio: true }
    ]
  });
  if (!v) return;
  await svc.editarUnidade({ id: u.id, nome: v.nome, sigla: v.sigla, justificativa: v.justificativa });
  toast('Unidade atualizada.');
  await recarregar();
}

async function mover(u) {
  const destinos = svc.destinosValidos(u, estado.unidades);
  if (!destinos.length) {
    toast('Não há unidade de destino compatível.', 'erro');
    return;
  }
  const v = await abrirFormulario({
    titulo: `Mover ${u.nome}`,
    textoConfirmar: 'Mover',
    campos: [
      { nome: 'destino', rotulo: 'Passa a ficar sob', tipo: 'select', valor: u.parent_id,
        opcoes: destinos.map(d => ({ valor: d.id, rotulo: `${d.nome}${d.sigla ? ` (${d.sigla})` : ''}` })) },
      { nome: 'justificativa', rotulo: 'Justificativa', tipo: 'textarea', obrigatorio: true }
    ]
  });
  if (!v) return;
  await svc.moverUnidade({ id: u.id, novoParentId: v.destino, justificativa: v.justificativa });
  toast('Unidade movida.');
  await recarregar();
}

async function inativar(u) {
  // O banco recusa se houver filha ativa ou gente lotada; avisamos antes
  // para a pessoa não descobrir só depois de preencher a justificativa.
  if (u.pessoas > 0) {
    toast(`Esta unidade tem ${u.pessoas} pessoa(s). Mova-as antes de inativar.`, 'erro');
    return;
  }
  const v = await abrirFormulario({
    titulo: `Inativar ${u.nome}`,
    textoConfirmar: 'Inativar',
    campos: [
      { tipo: 'aviso',
        texto: 'A unidade não é apagada: fica inativa e o histórico das demandas '
          + 'que passaram por ela continua legível.' },
      { nome: 'motivo', rotulo: 'Motivo', tipo: 'textarea', obrigatorio: true }
    ]
  });
  if (!v) return;
  await svc.inativarUnidade({ id: u.id, motivo: v.motivo });
  toast('Unidade inativada.');
  await recarregar();
}

async function reativar(u) {
  const v = await abrirFormulario({
    titulo: `Reativar ${u.nome}`,
    textoConfirmar: 'Reativar',
    campos: [{ nome: 'motivo', rotulo: 'Motivo', tipo: 'textarea', obrigatorio: true }]
  });
  if (!v) return;
  await svc.reativarUnidade({ id: u.id, motivo: v.motivo });
  toast('Unidade reativada.');
  await recarregar();
}

// --------------------------------------------------------------- Início

(async function iniciar() {
  montarSino('sino-notificacoes');
  montarNavegacao('organograma');
  const usuario = await iniciarSessao();

  // O serviço é importado sempre: mesmo em demo a tela usa montarArvore().
  // Sem ele (offline), não há como montar a árvore — a página avisa e para.
  try {
    svc = await import('../services/organograma.js');
  } catch (_) {
    el('carregando').textContent = 'Não foi possível carregar a estrutura.';
    return;
  }

  if (!usuario) {                                // sem sessão → dados de exemplo
    estado.unidades = EXEMPLO;
    estado.podeEditar = false;
    el('tarja-demo').hidden = false;
  } else {
    estado.podeEditar = await svc.podeGerir(usuario.id);
    if (!estado.podeEditar) el('sem-permissao').hidden = false;
    estado.unidades = await svc.listarUnidades();
  }

  el('carregando').hidden = true;
  el('conteudo').hidden = false;
  render();

  el('arvore').addEventListener('click', (ev) => {
    const t = ev.target.closest('[data-toggle]');
    if (t) {
      const id = t.dataset.toggle;
      estado.recolhidos.has(id) ? estado.recolhidos.delete(id) : estado.recolhidos.add(id);
      render();
      return;
    }
    const a = ev.target.closest('[data-abrir]');
    if (a) abrirUnidade(a.dataset.abrir);
  });

  el('busca').addEventListener('input', (ev) => {
    estado.filtro = ev.target.value;
    render();
  });
  el('ver-inativas').addEventListener('change', (ev) => {
    estado.verInativas = ev.target.checked;
    render();
  });
  el('btn-recolher').addEventListener('click', () => {
    const algumAberto = estado.unidades.some(u => !estado.recolhidos.has(u.id));
    estado.recolhidos = algumAberto ? new Set(estado.unidades.map(u => u.id)) : new Set();
    el('btn-recolher').textContent = algumAberto ? 'Expandir tudo' : 'Recolher tudo';
    render();
  });
})();
