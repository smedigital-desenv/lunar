// =====================================================================
// visualizador-pdf.js — mostra o PDF gerado em um modal antes de salvar.
// O usuário confere o documento na tela e decide baixar (ou fechar).
// Mobile-first: em tela pequena o modal ocupa a tela inteira; se o
// navegador não tiver visualizador de PDF embutido (comum no celular),
// oferece abrir em nova aba.
// =====================================================================

import { escapeHtml } from './componentes.js';

export function visualizarPdf({ titulo, blob, nomeArquivo, codigo }) {
  const url = URL.createObjectURL(blob);
  const id = 'pdf' + Math.random().toString(36).slice(2, 9);

  const el = document.createElement('div');
  el.className = 'modal fade';
  el.tabIndex = -1;
  el.innerHTML = `
    <div class="modal-dialog modal-xl modal-fullscreen-lg-down modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <div>
            <h5 class="modal-title">${escapeHtml(titulo)}</h5>
            ${codigo ? `<div class="texto-silencioso small">Código de verificação: ${escapeHtml(codigo)}</div>` : ''}
          </div>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
        </div>
        <div class="modal-body visualizador-pdf">
          <object data="${url}" type="application/pdf" class="visualizador-pdf__quadro">
            <div class="p-3 text-center">
              <p class="mb-2">Seu navegador não consegue exibir o PDF aqui.</p>
              <a class="btn btn-outline-primary" href="${url}" target="_blank" rel="noopener">Abrir em nova aba</a>
            </div>
          </object>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Fechar</button>
          <a class="btn btn-primary" id="${id}-baixar" href="${url}" download="${escapeHtml(nomeArquivo)}">Baixar PDF</a>
        </div>
      </div>
    </div>`;

  document.body.appendChild(el);
  const modal = new bootstrap.Modal(el);

  // Só libera o object URL depois de fechar — enquanto o modal vive, o
  // <object> e os links de download dependem dele.
  el.addEventListener('hidden.bs.modal', () => {
    el.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  });
  modal.show();
}
