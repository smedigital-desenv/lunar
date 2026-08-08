// =====================================================================
// admin.js (UI) — tela de administração de usuários (Sessão 3).
// Provisiona contas pendentes (perfil + unidade) e inativa/reativa
// usuários. Toda escrita passa pelos serviços/RPC; o banco valida o
// perfil de admin (RLS/SECURITY DEFINER). Em demo, exibe exemplos.
// =====================================================================

import { escapeHtml, fmtDataHora, toast } from './componentes.js';

const PERFIS_EXEMPLO = [
  { codigo: 'agente_administrativo', nome: 'Agente administrativo' },
  { codigo: 'chefe_secao', nome: 'Chefe de seção' },
  { codigo: 'gerente', nome: 'Gerente' },
  { codigo: 'subsecretario', nome: 'Subsecretário' },
  { codigo: 'gabinete', nome: 'Gabinete' },
  { codigo: 'admin_ti', nome: 'Admin TI' }
];
const UNIDADES_EXEMPLO = [
  { id: 'u1', nome: 'Gabinete', sigla: 'GAB' },
  { id: 'u2', nome: 'Seção de Atendimento Interno', sigla: 'SAI' }
];
const PENDENTES_EXEMPLO = [
  { id: 'p1', email: 'novo.servidor@educacao.pmrp.sp.gov.br', criado_em: new Date().toISOString() }
];
const USUARIOS_EXEMPLO = [
  { id: 'x1', nome: 'Ana Secretária', email: 'secretario@educacao.pmrp.sp.gov.br', perfil_nome: 'Gabinete', unidade_sigla: 'GAB', ativo: true },
  { id: 'x2', nome: 'Igor Agente', email: 'agente.sai@educacao.pmrp.sp.gov.br', perfil_nome: 'Agente administrativo', unidade_sigla: 'SAI', ativo: true },
  { id: 'x3', nome: 'Conta Antiga', email: 'antigo@educacao.pmrp.sp.gov.br', perfil_nome: 'Agente administrativo', unidade_sigla: 'SAI', ativo: false }
];

let svc = null;   // serviço real quando há sessão; null em demo
let ehAdmin = true;
let dados = null;

function normalizaUsuario(u) {
  return {
    id: u.id, nome: u.nome, email: u.email, ativo: u.ativo,
    perfil_nome: u.perfis?.nome ?? u.perfil ?? '—',
    unidade_sigla: u.unidades_organizacionais?.sigla
      ?? u.unidades_organizacionais?.nome ?? u.unidade_sigla ?? '—'
  };
}

async function carregar() {
  let auth = null;
  try { auth = await import('../auth.js'); } catch (_) { /* offline → demo */ }

  if (auth && auth.estaConfigurado()) {
    const usuario = await auth.protegerRota();   // redireciona se sem sessão
    if (!usuario) return null;                   // (redirecionado)
    ehAdmin = !!usuario.pode_administrar;
    if (!ehAdmin) return { demo: false, perfis: [], unidades: [], pendentes: [], usuarios: [] };
    return demo.carregar(
      async () => {
        svc = await import('../services/admin.js');
        const [perfis, unidades, usuarios] = await Promise.all([
          svc.listarPerfis(), svc.listarUnidades(), svc.listarUsuarios()
        ]);
        // `pendentes` começa vazio de propósito: num projeto compartilhado
        // a lista traria as contas dos sistemas vizinhos. Só a busca por
        // e-mail traz resultado (ver buscarPendentes).
        return { perfis, unidades, pendentes: [], usuarios: usuarios.map(normalizaUsuario) };
      },
      () => ({ perfis: PERFIS_EXEMPLO, unidades: UNIDADES_EXEMPLO,
               pendentes: PENDENTES_EXEMPLO, usuarios: USUARIOS_EXEMPLO })
    );
  }

  return { demo: true, perfis: PERFIS_EXEMPLO, unidades: UNIDADES_EXEMPLO,
           pendentes: PENDENTES_EXEMPLO, usuarios: USUARIOS_EXEMPLO };
}

// ---------------------------------------------------------------- Render
function opcoes(lista, valor, rotulo) {
  return lista.map(x =>
    `<option value="${escapeHtml(x[valor])}">${escapeHtml(x[rotulo])}</option>`).join('');
}

// A lista nasce vazia e só se preenche com a busca — ver carregar().
async function buscarPendentes(termo) {
  const alvo = document.getElementById('pendentes');
  if (!termo || termo.trim().length < 3) {
    dados.pendentes = [];
    alvo.innerHTML = '<p class="texto-silencioso">Digite ao menos 3 letras do e-mail.</p>';
    return;
  }
  alvo.innerHTML = '<p class="texto-silencioso">Buscando…</p>';
  try {
    dados.pendentes = svc ? await svc.listarContasPendentes(termo.trim()) : [];
  } catch (e) {
    alvo.innerHTML = `<p class="text-danger small">Erro na busca: ${escapeHtml(e.message || String(e))}</p>`;
    return;
  }
  alvo.innerHTML = renderPendentes();
}

function renderPendentes() {
  if (!dados.pendentes.length) {
    return '<p class="texto-silencioso">Nenhuma conta encontrada para esse e-mail.</p>';
  }
  const perfilOpts = opcoes(dados.perfis, 'codigo', 'nome');
  const uniOpts = opcoes(dados.unidades.map(u => ({ id: u.id, r: `${u.nome}${u.sigla ? ` (${u.sigla})` : ''}` })), 'id', 'r');
  return dados.pendentes.map(p => `
    <form class="admin-pend" data-id="${escapeHtml(p.id)}">
      <div class="admin-pend__email">${escapeHtml(p.email)}
        <span class="texto-silencioso"> · desde ${escapeHtml(fmtDataHora(p.criado_em))}</span></div>
      <div class="admin-pend__campos">
        <input class="form-control form-control-sm" name="nome" placeholder="Nome completo" required>
        <select class="form-select form-select-sm" name="perfil" required>${perfilOpts}</select>
        <select class="form-select form-select-sm" name="unidade" required>${uniOpts}</select>
        <button type="submit" class="btn btn-sm btn-primary">Liberar</button>
      </div>
    </form>`).join('');
}

function renderUsuarios() {
  if (!dados.usuarios.length) return '<p class="texto-silencioso">Nenhum usuário.</p>';
  return `<ul class="admin-lista">` + dados.usuarios.map(u => `
    <li class="admin-usuario${u.ativo ? '' : ' admin-usuario--inativo'}">
      <div class="admin-usuario__info">
        <strong>${escapeHtml(u.nome)}</strong>
        <span class="texto-silencioso">${escapeHtml(u.email)}</span>
        <span class="texto-silencioso">${escapeHtml(u.perfil_nome)} · ${escapeHtml(u.unidade_sigla)}</span>
      </div>
      <div class="admin-usuario__acoes">
        ${u.ativo
          ? `<button class="btn btn-sm btn-outline-danger" data-acao="inativar" data-id="${escapeHtml(u.id)}">Inativar</button>`
          : `<span class="badge-chip badge-situacao--inativa">Inativo</span>
             <button class="btn btn-sm btn-outline-secondary" data-acao="reativar" data-id="${escapeHtml(u.id)}">Reativar</button>`}
      </div>
    </li>`).join('') + `</ul>`;
}

function pintar() {
  document.getElementById('pendentes').innerHTML = renderPendentes();
  document.getElementById('usuarios').innerHTML = renderUsuarios();
}

// ---------------------------------------------------------------- Ações
async function recarregar() {
  dados = await carregar();
  if (dados) pintar();
}

async function aoLiberar(form) {
  if (dados.demo || !svc) { toast('Provisionamento indisponível no modo demo.', 'aviso'); return; }
  const authId = form.dataset.id;
  const nome = form.nome.value.trim();
  const perfil = form.perfil.value;
  const unidadeId = form.unidade.value;
  if (!nome) { toast('Informe o nome.', 'aviso'); return; }
  try {
    await svc.provisionarUsuario({ authId, nome, perfil, unidadeId });
    toast('Usuário liberado.', 'sucesso');
    await recarregar();
  } catch (e) { console.error(e); toast(e.message || 'Falha ao liberar.', 'erro'); }
}

async function aoMudarAtivo(acao, id) {
  if (dados.demo || !svc) { toast('Indisponível no modo demo.', 'aviso'); return; }
  const motivo = prompt(acao === 'inativar' ? 'Justificativa da inativação:' : 'Justificativa da reativação:');
  if (motivo === null) return;
  try {
    if (acao === 'inativar') await svc.inativarUsuario(id, motivo);
    else await svc.reativarUsuario(id, motivo);
    toast('Feito.', 'sucesso');
    await recarregar();
  } catch (e) { console.error(e); toast(e.message || 'Falha na operação.', 'erro'); }
}

// ---------------------------------------------------------------- Início
async function iniciar() {
  dados = await carregar();
  if (!dados) return;                            // guarda redirecionou

  document.getElementById('tarja-demo').hidden = !dados.demo;
  document.getElementById('sem-permissao').hidden = dados.demo || ehAdmin;

  if (!dados.demo && !ehAdmin) {
    document.getElementById('carregando').hidden = true;
    return;                                      // RLS já bloqueia; só avisamos
  }

  pintar();
  const campoBusca = document.getElementById('busca-pendente');
  if (campoBusca) {
    const disparar = () => buscarPendentes(campoBusca.value);
    document.getElementById('btn-buscar-pendente').addEventListener('click', disparar);
    campoBusca.addEventListener('keydown', (e) => { if (e.key === 'Enter') disparar(); });
  }
  document.getElementById('pendentes').addEventListener('submit', (e) => {
    const form = e.target.closest('.admin-pend');
    if (form) { e.preventDefault(); aoLiberar(form); }
  });
  document.getElementById('usuarios').addEventListener('click', (e) => {
    const b = e.target.closest('[data-acao]');
    if (b) aoMudarAtivo(b.dataset.acao, b.dataset.id);
  });

  document.getElementById('carregando').hidden = true;
  document.getElementById('conteudo').hidden = false;
}

iniciar().catch(err => {
  console.error(err);
  document.getElementById('carregando').textContent = 'Erro ao carregar a administração.';
});

// Sino de notificações e sessão no cabeçalho.
import { montarSino } from './notificacoes.js';
import { iniciarSessao } from './sessao.js';
montarSino('sino-notificacoes');
iniciarSessao();

// Barra de navegação principal.
import { montarNavegacao } from './navegacao.js';
import * as demo from './demo.js';
montarNavegacao();
