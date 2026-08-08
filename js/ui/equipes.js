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
const LIDERANCA = new Set(['subsecretario', 'gerente', 'gabinete', 'chefe_secao']);

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
// O `select` inline foi trocado por um botão que abre o modal: com 53
// unidades, a lista nativa truncava o nome ("Subsecretaria de Alimentação
// Escola…") e, no celular, era o pior componente possível.
function renderMembro(u) {
  const lider = LIDERANCA.has(u.perfil);
  return `<div class="equipe-membro">
      <span class="equipe-membro__nome">
        <strong class="${lider ? 'equipe-membro__lider' : ''}">${escapeHtml(u.nome)}</strong>
        <span class="equipe-membro__perfil">${escapeHtml(PERFIL_ROTULO[u.perfil] || u.perfil)}</span>
      </span>
      <button type="button" class="equipe-membro__mover" data-usuario="${escapeHtml(u.id)}"
              aria-label="Mover ${escapeHtml(u.nome)} de área">Mover</button>
    </div>`;
}

function renderUnidade(unidade, filhosDe, membrosDe, nivel) {
  const membros = membrosDe.get(unidade.id) || [];
  const filhos = filhosDe.get(unidade.id) || [];
  // O recuo vem de --nivel (CSS), não de margin inline: é o mesmo recurso
  // da tela de Organograma, e permite a linha-guia que liga filha à mãe.
  const vazia = membros.length === 0;
  const cls = `equipe-area equipe-area--${escapeHtml(unidade.tipo)}`
    + (vazia ? ' equipe-area--vazia' : '');
  let html = `<div class="${cls}" style="--nivel:${nivel}">
      <div class="equipe-area__cabecalho">
        <strong class="equipe-area__nome">${escapeHtml(unidade.nome)}</strong>
        ${unidade.sigla ? `<span class="equipe-area__sigla">${escapeHtml(unidade.sigla)}</span>` : ''}
        <span class="equipe-area__tipo">${escapeHtml(TIPO_ROTULO[unidade.tipo] || unidade.tipo)}</span>
        <span class="equipe-area__contagem">${membros.length === 1 ? '1 pessoa' : `${membros.length} pessoas`}</span>
      </div>
      ${vazia ? '<p class="equipe-area__vazia">Sem pessoas nesta área.</p>'
              : membros.map(renderMembro).join('')}
    </div>`;
  html += filhos.map(f => renderUnidade(f, filhosDe, membrosDe, nivel + 1)).join('');
  return html;
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
