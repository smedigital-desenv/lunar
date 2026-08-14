// =====================================================================
// nova-licitacao.js — formulário de novo pedido de compra
// (fn_lic_criar_processo — gerente ou acima; o banco valida).
// Só objeto e categoria são obrigatórios. Em modo demonstração
// (sem sessão/config), o cadastro fica desabilitado.
// =====================================================================

import { escapeHtml, toast } from './componentes.js';

let servico = null;      // js/services/licitacoes.js quando há sessão

async function carregarReferencias() {
  try {
    const [licitacoes, organograma] = await Promise.all([
      import('../services/licitacoes.js'),
      import('../services/organograma.js')
    ]);
    // Sem sessão a consulta volta vazia — tratado como demonstração.
    const unidades = await organograma.listarUnidades();
    if (!unidades?.length) return false;
    servico = licitacoes;
    const sel = document.getElementById('unidade');
    sel.innerHTML = '<option value="">(minha unidade)</option>'
      + unidades.filter(u => u.ativo)
        .sort((a, b) => (a.sigla || a.nome).localeCompare(b.sigla || b.nome))
        .map(u => `<option value="${escapeHtml(u.id)}">`
          + `${escapeHtml(u.sigla ? `${u.sigla} — ${u.nome}` : u.nome)}</option>`)
        .join('');
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
}

async function enviar(e) {
  e.preventDefault();
  if (!servico) {
    toast('Modo demonstração: nada foi gravado.', 'aviso');
    return;
  }
  const botao = document.getElementById('enviar');
  botao.disabled = true;
  try {
    const id = await servico.criarProcesso({
      objeto: document.getElementById('objeto').value.trim(),
      categoria: document.getElementById('categoria').value,
      prioridade: document.getElementById('prioridade').value,
      unidadeSolicitanteId: document.getElementById('unidade').value || null,
      texto: document.getElementById('texto').value.trim() || null,
      numeroProcessoSolar: document.getElementById('solar').value.trim() || null
    });
    toast('Pedido registrado.', 'sucesso');
    location.href = `./processo-licitacao.html?id=${encodeURIComponent(id)}`;
  } catch (erro) {
    console.error(erro);
    toast(erro.message || 'Erro ao registrar o pedido.', 'erro');
    botao.disabled = false;
  }
}

document.getElementById('form').addEventListener('submit', enviar);

carregarReferencias().then((real) => {
  document.getElementById('tarja-demo').hidden = real;
});

import { montarSino } from './notificacoes.js';
import { iniciarSessao } from './sessao.js';
import { montarNavegacao } from './navegacao.js';
montarSino('sino-notificacoes');
iniciarSessao();
montarNavegacao('licitacoes');
