// =====================================================================
// admin-tipos.js — seção "Tipos de demanda" da tela de administração.
// Lista, cria, edita, inativa e reativa os tipos que alimentam o seletor
// de nova demanda. Toda escrita passa por RPC (sql/049); o banco valida
// quem administra. Em demonstração, só confirma por toast.
//
// Vive fora do admin.js porque é outra responsabilidade — aquele arquivo
// cuida de contas e usuários e já beira o limite de tamanho.
// =====================================================================

import { escapeHtml, toast } from './componentes.js';

const EXEMPLO = [
  { id: 't1', nome: 'Denúncia', descricao: 'Comunicação de irregularidade.', ativo: true },
  { id: 't2', nome: 'Pedido de informação', descricao: null, ativo: true },
  { id: 't3', nome: 'Plantão da Supervisão', descricao: 'Registro do plantão.', ativo: false }
];

let svc = null;      // serviço real; null em demonstração
let tipos = [];
let editando = null; // id em edição, 'novo' para o formulário de criação

// ------------------------------------------------------------- Render
function formulario(t) {
  const novo = !t.id;
  return `<form class="admin-tipo__form" data-id="${escapeHtml(t.id || '')}">
      <input class="form-control form-control-sm" name="nome" required maxlength="80"
             placeholder="Nome do tipo" value="${escapeHtml(t.nome || '')}"
             aria-label="Nome do tipo">
      <input class="form-control form-control-sm" name="descricao" maxlength="200"
             placeholder="Descrição (opcional) — ajuda quem escolhe"
             value="${escapeHtml(t.descricao || '')}" aria-label="Descrição">
      <div class="admin-tipo__botoes">
        <button class="btn btn-sm btn-primary" type="submit">${novo ? 'Criar' : 'Salvar'}</button>
        <button class="btn btn-sm btn-outline-secondary" type="button" data-acao="cancelar">Cancelar</button>
      </div>
    </form>`;
}

function linha(t) {
  if (editando === t.id) return `<li class="admin-tipo">${formulario(t)}</li>`;
  return `<li class="admin-tipo${t.ativo ? '' : ' admin-tipo--inativo'}">
      <div class="admin-tipo__info">
        <strong>${escapeHtml(t.nome)}</strong>
        ${t.descricao ? `<span class="texto-silencioso">${escapeHtml(t.descricao)}</span>` : ''}
      </div>
      <div class="admin-tipo__acoes">
        ${t.ativo
          ? `<button class="btn btn-sm btn-link p-0" data-acao="editar" data-id="${escapeHtml(t.id)}">Editar</button>
             <button class="btn btn-sm btn-outline-danger" data-acao="inativar" data-id="${escapeHtml(t.id)}">Inativar</button>`
          : `<span class="badge-chip badge-situacao--inativa">Inativo</span>
             <button class="btn btn-sm btn-outline-secondary" data-acao="reativar" data-id="${escapeHtml(t.id)}">Reativar</button>`}
      </div>
    </li>`;
}

function pintar() {
  const el = document.getElementById('tipos');
  if (!el) return;
  const novo = editando === 'novo'
    ? `<li class="admin-tipo">${formulario({})}</li>`
    : `<li class="admin-tipo admin-tipo--novo">
         <button class="btn btn-sm btn-outline-primary" data-acao="novo">+ Novo tipo</button>
       </li>`;
  el.innerHTML = `<ul class="admin-lista">${novo}${tipos.map(linha).join('')}</ul>`;
}

// -------------------------------------------------------------- Ações
async function recarregar() {
  if (svc) tipos = await svc.listarTiposTodos();
  pintar();
}

// Erro do banco vira mensagem na tela: nome repetido e falta de permissão
// são recusas previstas, e a pessoa precisa ler o motivo.
async function executar(acao) {
  try {
    await acao();
    await recarregar();
  } catch (e) {
    console.error(e);
    toast(e.message || 'Não foi possível concluir a operação.');
  }
}

async function aoSalvar(form) {
  const nome = form.nome.value.trim();
  if (!nome) { toast('Informe o nome do tipo.'); return; }
  const id = form.dataset.id || null;
  const descricao = form.descricao.value.trim() || null;

  if (!svc) {                       // demonstração: sem banco a gravar
    toast(id ? 'Tipo alterado (demonstração).' : 'Tipo criado (demonstração).');
    editando = null; pintar(); return;
  }
  await executar(async () => {
    await svc.salvarTipo({ id, nome, descricao });
    editando = null;
    toast(id ? 'Tipo alterado.' : 'Tipo criado.');
  });
}

async function aoMudarAtivo(acao, id) {
  const verbo = acao === 'inativar' ? 'inativar' : 'reativar';
  const motivo = prompt(`Justificativa para ${verbo} este tipo:`);
  if (motivo === null) return;                       // desistiu
  if (!motivo.trim()) { toast('Justificativa é obrigatória.'); return; }

  if (!svc) { toast(`Tipo ${verbo}do (demonstração).`); return; }
  await executar(async () => {
    if (acao === 'inativar') await svc.inativarTipo(id, motivo);
    else await svc.reativarTipo(id, motivo);
    toast(`Tipo ${verbo}do.`);
  });
}

// ------------------------------------------------------------ Abertura
// Chamada pelo admin.js depois que ele resolve sessão e permissão: quem
// decide se a tela abre é lá, e o banco confere de novo a cada escrita.
export async function montarTipos({ servico = null, demo = false } = {}) {
  const el = document.getElementById('tipos');
  if (!el) return;
  svc = demo ? null : servico;

  if (svc) {
    try {
      tipos = await svc.listarTiposTodos();
    } catch (e) {
      console.error(e);
      el.innerHTML = `<p class="texto-silencioso">Erro ao carregar os tipos: ${escapeHtml(e.message || String(e))}</p>`;
      return;
    }
  } else {
    tipos = EXEMPLO;
  }
  pintar();

  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-acao]');
    if (!b) return;
    const { acao, id } = b.dataset;
    if (acao === 'novo' || acao === 'editar') { editando = acao === 'novo' ? 'novo' : id; pintar(); }
    else if (acao === 'cancelar') { editando = null; pintar(); }
    else if (acao === 'inativar' || acao === 'reativar') aoMudarAtivo(acao, id);
  });

  el.addEventListener('submit', (e) => {
    const form = e.target.closest('.admin-tipo__form');
    if (form) { e.preventDefault(); aoSalvar(form); }
  });
}
