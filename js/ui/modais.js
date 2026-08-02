// =====================================================================
// modais.js — formulários modais de tramitação (Bootstrap 5).
// abrirFormulario() é declarativo: recebe os campos, valida obrigatórios
// e resolve com os valores (ou null se cancelado). As regras de negócio
// continuam no banco; aqui é só coleta e validação básica de UI.
// =====================================================================

import { escapeHtml } from './componentes.js';

export const PRIORIDADES = [
  { valor: 'baixa', rotulo: 'Baixa' }, { valor: 'normal', rotulo: 'Normal' },
  { valor: 'alta', rotulo: 'Alta' }, { valor: 'urgente', rotulo: 'Urgente' }
];

function campoHtml(c) {
  if (c.tipo === 'aviso') {
    return `<div class="alert alert-warning py-2 small">${escapeHtml(c.texto || '')}</div>`;
  }
  const req = c.obrigatorio ? ' <span class="text-danger">*</span>' : '';
  const rotulo = `<label class="form-label">${escapeHtml(c.rotulo)}${req}</label>`;
  const nome = escapeHtml(c.nome);
  if (c.tipo === 'textarea') {
    return `<div class="mb-3">${rotulo}<textarea class="form-control" name="${nome}" rows="3"></textarea></div>`;
  }
  if (c.tipo === 'select') {
    const ops = (c.opcoes || []).map(o =>
      `<option value="${escapeHtml(o.valor)}">${escapeHtml(o.rotulo)}</option>`).join('');
    return `<div class="mb-3">${rotulo}<select class="form-select" name="${nome}">${ops}</select></div>`;
  }
  if (c.tipo === 'date') {
    return `<div class="mb-3">${rotulo}<input type="date" class="form-control" name="${nome}"></div>`;
  }
  if (c.tipo === 'file') {
    return `<div class="mb-3">${rotulo}<input type="file" class="form-control" name="${nome}" multiple></div>`;
  }
  if (c.tipo === 'url') {
    const ph = c.placeholder ? ` placeholder="${escapeHtml(c.placeholder)}"` : '';
    return `<div class="mb-3">${rotulo}<input type="url" class="form-control" name="${nome}"${ph}></div>`;
  }
  return `<div class="mb-3">${rotulo}<input type="text" class="form-control" name="${nome}"></div>`;
}

// Abre um formulário modal. Resolve com { campo: valor } ou null (cancelar).
export function abrirFormulario({ titulo, campos, textoConfirmar = 'Confirmar' }) {
  return new Promise((resolve) => {
    const id = 'm' + Math.random().toString(36).slice(2, 9);
    const el = document.createElement('div');
    el.className = 'modal fade';
    el.tabIndex = -1;
    el.innerHTML = `
      <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">${escapeHtml(titulo)}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
          </div>
          <div class="modal-body">
            <form id="${id}-form">${campos.map(campoHtml).join('')}</form>
            <div class="text-danger small" id="${id}-erro" hidden></div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button type="button" class="btn btn-primary" id="${id}-ok">${escapeHtml(textoConfirmar)}</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(el);
    const modal = new bootstrap.Modal(el);
    let confirmado = false;

    el.querySelector(`#${id}-ok`).addEventListener('click', () => {
      const form = el.querySelector(`#${id}-form`);
      const valores = {};
      for (const c of campos) {
        if (c.tipo === 'aviso') continue;          // texto estático, não coletado
        const input = form.elements[c.nome];
        valores[c.nome] = c.tipo === 'file'
          ? (input.files ? Array.from(input.files) : [])
          : input.value.trim();
      }
      const faltando = campos.find(c => c.obrigatorio &&
        (c.tipo === 'file' ? valores[c.nome].length === 0 : !valores[c.nome]));
      if (faltando) {
        const erro = el.querySelector(`#${id}-erro`);
        erro.textContent = `Preencha o campo obrigatório: ${faltando.rotulo}.`;
        erro.hidden = false;
        return;
      }
      confirmado = true;
      resolve(valores);
      modal.hide();
    });

    el.addEventListener('hidden.bs.modal', () => {
      el.remove();
      if (!confirmado) resolve(null);
    });
    modal.show();
  });
}
