// =====================================================================
// equipes.js (UI) — gestão de equipes = lotação das pessoas nas unidades.
// Mostra o organograma; sob cada área, seus integrantes; o admin move
// cada pessoa de área por um seletor. Escrita por RPC (banco valida admin).
// Em demo, exibe exemplos.
// =====================================================================

import { escapeHtml, toast } from './componentes.js';
import { abrirFormulario } from './modais.js';

const PERFIL_ROTULO = {
  agente_administrativo: 'Agente', chefe_secao: 'Chefe de seção',
  gerente: 'Gerente', subsecretario: 'Subsecretário',
  gabinete: 'Gabinete', admin_ti: 'Admin TI'
};
const TIPO_ROTULO = {
  gabinete: 'Gabinete', subsecretaria: 'Subsecretaria', gerencia: 'Gerência', secao: 'Seção'
};

const UNIDADES_EXEMPLO = [
  { id: 'u0', nome: 'Gabinete', sigla: 'GAB', tipo: 'gabinete', parent_id: null },
  { id: 'u1', nome: 'Subsecretaria Pedagógica', sigla: 'SUBPED', tipo: 'subsecretaria', parent_id: 'u0' },
  { id: 'u2', nome: 'Gerência de Ensino Fundamental', sigla: 'GEF', tipo: 'gerencia', parent_id: 'u1' },
  { id: 'u3', nome: 'Seção de Atendimento', sigla: 'SAI', tipo: 'secao', parent_id: 'u2' }
];
const USUARIOS_EXEMPLO = [
  { id: 'a1', nome: 'Ana Secretária', perfil: 'gabinete', unidade_id: 'u0', ativo: true },
  { id: 'b1', nome: 'Bruno Pedagógico', perfil: 'subsecretario', unidade_id: 'u1', ativo: true },
  { id: 'e1', nome: 'Eduardo Gerente', perfil: 'gerente', unidade_id: 'u2', ativo: true },
  { id: 'g1', nome: 'Gustavo Chefe', perfil: 'chefe_secao', unidade_id: 'u3', ativo: true },
  { id: 'i1', nome: 'Igor Agente', perfil: 'agente_administrativo', unidade_id: 'u3', ativo: true }
];

let svc = null;
let ehAdmin = true;
let dados = null;

async function carregar() {
  let auth = null;
  try { auth = await import('../auth.js'); } catch (_) { /* offline → demo */ }
  if (auth && auth.estaConfigurado()) {
    const usuario = await auth.protegerRota();
    if (!usuario) return null;
    ehAdmin = !!usuario.pode_administrar;
    if (!ehAdmin) return { demo: false, unidades: [], usuarios: [] };
    return demo.carregar(
      async () => {
        svc = await import('../services/admin.js');
        const [unidades, usuarios] = await Promise.all([svc.listarOrganograma(), svc.listarUsuarios()]);
        return {
          unidades,
          usuarios: (usuarios || []).filter(u => u.ativo !== false)
            .map(u => ({ id: u.id, nome: u.nome, perfil: u.perfil, unidade_id: u.unidade_id }))
        };
      },
      () => ({ unidades: UNIDADES_EXEMPLO, usuarios: USUARIOS_EXEMPLO })
    );
  }
  return { demo: true, unidades: UNIDADES_EXEMPLO, usuarios: USUARIOS_EXEMPLO };
}

// ---------------------------------------------------------------- Render
// Mesmo desenho da tela de Organograma (classes .org-*): cartão compacto
// por unidade, recuo por --nivel e recolher. Duas linguagens visuais para
// a mesma árvore era o que deixava esta tela pesada. A diferença é que
// aqui o chip da pessoa é um BOTÃO — clicar abre o "Mover".
const recolhidos = new Set();

function chipsPessoas(membros) {
  if (!membros.length) return '<span class="org-no__vago">sem pessoas</span>';
  return `<span class="org-no__titulares">${membros.map(u => `
    <button type="button" class="org-no__pessoa org-no__pessoa--acao"
            data-usuario="${escapeHtml(u.id)}"
            title="Mover ${escapeHtml(u.nome)} de área">
      ${escapeHtml(u.nome)}
      <small>${escapeHtml(PERFIL_ROTULO[u.perfil] || u.perfil)}</small>
    </button>`).join('')}</span>`;
}

function renderUnidade(unidade, filhosDe, membrosDe, nivel) {
  const membros = membrosDe.get(unidade.id) || [];
  const filhos = filhosDe.get(unidade.id) || [];
  const temFilhas = filhos.length > 0;
  const recolhido = recolhidos.has(unidade.id);

  const cabeca = `
    <div class="org-no org-no--${escapeHtml(unidade.tipo)}" style="--nivel:${nivel}">
      <button type="button" class="org-no__toggle" data-toggle="${escapeHtml(unidade.id)}"
              ${temFilhas ? '' : 'disabled'}
              aria-label="${recolhido ? 'Expandir' : 'Recolher'}">
        ${temFilhas ? (recolhido ? '▸' : '▾') : '·'}
      </button>
      <div class="org-no__corpo org-no__corpo--estatico">
        <span class="org-no__nome">${escapeHtml(unidade.nome)}</span>
        <span class="org-no__meta">
          ${unidade.sigla ? `<span class="org-no__sigla">${escapeHtml(unidade.sigla)}</span>` : ''}
          <span>${escapeHtml(TIPO_ROTULO[unidade.tipo] || unidade.tipo)}</span>
        </span>
        ${chipsPessoas(membros)}
        ${ehAdmin ? `<button type="button" class="org-no__incluir"
             data-incluir="${escapeHtml(unidade.id)}">+ Incluir pessoa</button>` : ''}
      </div>
    </div>`;

  if (recolhido || !temFilhas) return cabeca;
  return cabeca + filhos.map(f => renderUnidade(f, filhosDe, membrosDe, nivel + 1)).join('');
}

function pintar() {
  const filhosDe = new Map();
  const idsUnidade = new Set(dados.unidades.map(u => u.id));
  const raizes = [];
  for (const u of dados.unidades) {
    if (u.parent_id && idsUnidade.has(u.parent_id)) {
      if (!filhosDe.has(u.parent_id)) filhosDe.set(u.parent_id, []);
      filhosDe.get(u.parent_id).push(u);
    } else {
      raizes.push(u);
    }
  }
  const membrosDe = new Map();
  for (const u of dados.usuarios) {
    if (!membrosDe.has(u.unidade_id)) membrosDe.set(u.unidade_id, []);
    membrosDe.get(u.unidade_id).push(u);
  }
  document.getElementById('arvore-equipes').innerHTML =
    raizes.map(r => renderUnidade(r, filhosDe, membrosDe, 0)).join('');
}

// ---------------------------------------------------------------- Ações

// Modal com o nome inteiro de cada destino — era o que o select truncava.
async function pedirDestino(usuarioId) {
  const pessoa = dados.usuarios.find(u => u.id === usuarioId);
  if (!pessoa) return;
  const destinos = dados.unidades
    .filter(u => u.ativo !== false)
    .map(u => ({ valor: u.id, rotulo: `${u.nome}${u.sigla ? ` (${u.sigla})` : ''}` }));

  const v = await abrirFormulario({
    titulo: `Mover ${pessoa.nome}`,
    textoConfirmar: 'Mover',
    campos: [{
      nome: 'unidade', rotulo: 'Passa a ser lotado em', tipo: 'select',
      valor: pessoa.unidade_id, opcoes: destinos
    }]
  });
  if (!v || v.unidade === pessoa.unidade_id) return;
  await mover(usuarioId, v.unidade);
}

// Incluir alguém na área. A conta de login precisa JÁ existir: quem a
// cria é a ponte do central, no primeiro acesso da pessoa. Aqui apenas
// damos a ela perfil e unidade — o front não tem (nem deve ter) poder de
// criar conta de autenticação.
async function incluir(unidadeId) {
  const unidade = dados.unidades.find(u => u.id === unidadeId);
  const v = await abrirFormulario({
    titulo: `Incluir pessoa em ${unidade?.nome ?? 'esta área'}`,
    textoConfirmar: 'Incluir',
    campos: [
      { tipo: 'aviso',
        texto: 'A pessoa precisa ter entrado ao menos uma vez em smedigital.com.br '
          + 'com o e-mail institucional. É esse primeiro acesso que cria a conta.' },
      { nome: 'email', rotulo: 'E-mail institucional', obrigatorio: true },
      { nome: 'nome', rotulo: 'Nome completo', obrigatorio: true },
      { nome: 'perfil', rotulo: 'Perfil', tipo: 'select',
        opcoes: Object.entries(PERFIL_ROTULO).map(([valor, rotulo]) => ({ valor, rotulo })) }
    ]
  });
  if (!v) return;

  const email = v.email.trim().toLowerCase();
  try {
    // Acha a conta de login pelo e-mail (mesma função da tela de Admin).
    const contas = await svc.listarContasPendentes(email);
    const conta = (contas || []).find(c => c.email === email);
    if (!conta) {
      toast('Conta não encontrada. Ou a pessoa ainda não entrou pela primeira vez, '
        + 'ou já tem acesso — nesse caso, use "Mover".', 'erro');
      return;
    }
    await svc.provisionarUsuario({
      authId: conta.id, nome: v.nome.trim(), perfil: v.perfil, unidadeId
    });
    toast('Pessoa incluída na área.', 'sucesso');
    dados = await carregar();
    if (dados) pintar();
  } catch (e) {
    console.error(e);
    toast(e.message || 'Falha ao incluir.', 'erro');
  }
}

async function mover(usuarioId, unidadeId) {
  if (dados.demo || !svc) { toast('Edição indisponível no modo demo.', 'aviso'); return; }
  try {
    await svc.definirUnidadeUsuario(usuarioId, unidadeId);
    toast('Equipe atualizada.', 'sucesso');
    dados = await carregar();
    if (dados) pintar();
  } catch (e) { console.error(e); toast(e.message || 'Falha ao mover.', 'erro'); }
}

// ---------------------------------------------------------------- Início
async function iniciar() {
  dados = await carregar();
  if (!dados) return;

  document.getElementById('tarja-demo').hidden = !dados.demo;
  document.getElementById('sem-permissao').hidden = dados.demo || ehAdmin;
  if (!dados.demo && !ehAdmin) { document.getElementById('carregando').hidden = true; return; }

  pintar();
  document.getElementById('arvore-equipes').addEventListener('click', (e) => {
    const t = e.target.closest('[data-toggle]');
    if (t) {
      const id = t.dataset.toggle;
      recolhidos.has(id) ? recolhidos.delete(id) : recolhidos.add(id);
      pintar();
      return;
    }
    const inc = e.target.closest('[data-incluir]');
    if (inc) { incluir(inc.dataset.incluir); return; }
    const b = e.target.closest('[data-usuario]');
    if (b) pedirDestino(b.dataset.usuario);
  });

  document.getElementById('carregando').hidden = true;
  document.getElementById('conteudo').hidden = false;
}

iniciar().catch(err => {
  console.error(err);
  document.getElementById('carregando').textContent = 'Erro ao carregar as equipes.';
});

// Sino, sessão e navegação no cabeçalho.
import { montarSino } from './notificacoes.js';
import { iniciarSessao } from './sessao.js';
import { montarNavegacao } from './navegacao.js';
import * as demo from './demo.js';
montarSino('sino-notificacoes');
iniciarSessao();
montarNavegacao();
