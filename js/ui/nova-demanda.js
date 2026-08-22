// =====================================================================
// nova-demanda.js — formulário de criação de demanda (fn_criar_demanda).
// Só título e objeto/queixa são obrigatórios; o restante é opcional. Em
// modo demo (sem sessão/config), o cadastro fica desabilitado.
// =====================================================================

import { escapeHtml, toast } from './componentes.js';

const VINCULOS = [
  ['aluno', 'Aluno'], ['responsavel', 'Responsável'],
  ['servidor', 'Servidor'], ['outro', 'Outro']
];

let servicos = null;   // { demandas, referencias } quando há sessão; null em demo

function opcaoVazia(rotulo) { return `<option value="">${escapeHtml(rotulo)}</option>`; }
function preencherSelect(id, itens, { rotuloVazio } = {}) {
  const el = document.getElementById(id);
  const base = rotuloVazio ? opcaoVazia(rotuloVazio) : '';
  // O formato viaja no próprio <option>: aplicarFormato() lê dali, sem
  // precisar reconsultar o catálogo a cada troca de tipo.
  el.innerHTML = base + (itens || []).map(x =>
    `<option value="${escapeHtml(x.id)}"`
    + (x.formato ? ` data-formato="${escapeHtml(x.formato)}"` : '')
    + `>${escapeHtml(x.nome)}</option>`).join('');
}

// ------------------------------------------------------------ Formato
// Cada tipo declara o formato do seu formulário (sql/046). O controle
// interno não tem objeto/queixa, escola, aluno, sigilo nem pessoas
// envolvidas — ver docs/ESPEC-TIPOS.md.
//
// Sem tipo escolhido mostra tudo: é o mesmo critério do banco, que só
// dispensa o objeto/queixa quando o tipo é de controle.
function aplicarFormato() {
  const sel = document.getElementById('tipo');
  const formato = sel.selectedOptions[0]?.dataset.formato || 'atendimento';
  const controle = formato === 'controle';

  for (const bloco of document.querySelectorAll('[data-so="atendimento"]')) {
    bloco.hidden = controle;
  }
  // `required` num campo escondido trava o submit sem mostrar o porquê.
  const objeto = document.getElementById('objeto');
  objeto.required = !controle;
  const marca = document.querySelector('[data-obrig]');
  if (marca) marca.hidden = controle;
  // Some da tela, some do envio: nada de dado herdado de um tipo trocado.
  if (controle) {
    objeto.value = '';
    document.getElementById('aluno').value = '';
    document.getElementById('escola').value = '';
    document.getElementById('sigilo').value = 'normal';
    document.getElementById('pessoas').innerHTML = '';
  }
}

// ------------------------------------------------------------ Pessoas
function linhaPessoa() {
  const div = document.createElement('div');
  div.className = 'pessoa-linha';
  div.innerHTML =
    `<input class="form-control form-control-sm" data-p="nome" placeholder="Nome">`
    + `<select class="form-select form-select-sm" data-p="vinculo">`
    + VINCULOS.map(([v, r]) => `<option value="${v}">${r}</option>`).join('') + `</select>`
    + `<input class="form-control form-control-sm" data-p="observacao" placeholder="Observação">`
    + `<button type="button" class="btn btn-sm btn-outline-danger" data-remover>×</button>`;
  div.querySelector('[data-remover]').addEventListener('click', () => div.remove());
  return div;
}
function coletarPessoas() {
  return [...document.querySelectorAll('#pessoas .pessoa-linha')].map(l => ({
    nome: l.querySelector('[data-p="nome"]').value.trim(),
    vinculo: l.querySelector('[data-p="vinculo"]').value,
    observacao: l.querySelector('[data-p="observacao"]').value.trim() || null
  })).filter(p => p.nome);
}

// ------------------------------------------------------------ Carga
async function carregarReferencias() {
  try {
    const [demandas, referencias] = await Promise.all([
      import('../services/demandas.js'),
      import('../services/referencias.js')
    ]);
    const [tipos, escolas, usuarios] = await Promise.all([
      referencias.listarTipos(), referencias.listarEscolas(), referencias.listarUsuariosAtivos()
    ]);
    servicos = { demandas };
    preencherSelect('tipo', tipos, { rotuloVazio: '— selecione —' });
    preencherSelect('escola', escolas, { rotuloVazio: '— nenhuma —' });
    preencherSelect('responsavel', usuarios, { rotuloVazio: '(você)' });
    aplicarFormato();
    return true;
  } catch (_) {
    return false; // sem config/sessão → demo
  }
}

function entrarModoDemo() {
  document.getElementById('tarja-demo').hidden = false;
  document.getElementById('tipo').innerHTML = opcaoVazia('— selecione —');
  document.getElementById('escola').innerHTML = opcaoVazia('— nenhuma —');
  document.getElementById('responsavel').innerHTML = opcaoVazia('(você)');
}

// ------------------------------------------------------------ Submit
async function aoSalvar(e) {
  e.preventDefault();
  const alerta = document.getElementById('alerta');
  alerta.hidden = true;

  const selTipo = document.getElementById('tipo');
  const controle = selTipo.selectedOptions[0]?.dataset.formato === 'controle';
  const titulo = document.getElementById('titulo').value.trim();
  const objeto = document.getElementById('objeto').value.trim();
  if (!titulo) {
    alerta.textContent = 'Preencha o título.';
    alerta.hidden = false;
    return;
  }
  // Mesma regra do banco (sql/046): objeto/queixa só é exigido fora do
  // controle interno. Validar aqui evita ida ao servidor para levar erro.
  if (!controle && !objeto) {
    alerta.textContent = 'Preencha o objeto/queixa.';
    alerta.hidden = false;
    return;
  }
  if (!servicos) { toast('Cadastro indisponível no modo demo.', 'aviso'); return; }

  const dados = {
    titulo, objetoQueixa: objeto || null,
    descricao: document.getElementById('descricao').value.trim() || null,
    tipoId: document.getElementById('tipo').value || null,
    categoria: document.getElementById('categoria').value.trim() || null,
    setor: document.getElementById('setor').value.trim() || null,
    prioridade: document.getElementById('prioridade').value,
    prazo: document.getElementById('prazo').value || null,
    escolaId: document.getElementById('escola').value || null,
    alunoNome: document.getElementById('aluno').value.trim() || null,
    numeroProcessoSolar: document.getElementById('solar').value.trim() || null,
    linkDocumentacao: document.getElementById('link').value.trim() || null,
    sigilo: document.getElementById('sigilo').value,
    responsavelId: document.getElementById('responsavel').value || null,
    pessoas: coletarPessoas()
  };

  const btn = document.getElementById('salvar');
  btn.disabled = true;
  try {
    const id = await servicos.demandas.criarDemanda(dados);
    toast('Demanda criada.', 'sucesso');
    location.href = `./demanda.html?id=${encodeURIComponent(id)}`;
  } catch (err) {
    console.error(err);
    alerta.textContent = err.message || 'Falha ao criar a demanda.';
    alerta.hidden = false;
    btn.disabled = false;
  }
}

// ------------------------------------------------------------ Início
async function iniciar() {
  const ok = await carregarReferencias();
  if (!ok) entrarModoDemo();

  document.getElementById('tipo').addEventListener('change', aplicarFormato);
  document.getElementById('add-pessoa').addEventListener('click', () =>
    document.getElementById('pessoas').appendChild(linhaPessoa()));
  document.getElementById('form-demanda').addEventListener('submit', aoSalvar);
}

iniciar();

// Sino de notificações e sessão no cabeçalho.
import { montarSino } from './notificacoes.js';
import { iniciarSessao } from './sessao.js';
montarSino('sino-notificacoes');
iniciarSessao();

// Barra de navegação principal.
import { montarNavegacao } from './navegacao.js';
montarNavegacao('nova');
