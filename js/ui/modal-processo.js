// =====================================================================
// modal-processo.js — abre a tela de um processo em MODAL sobre a
// lista (iframe em modo ?embed=1, como o detalhe-lado das demandas).
// A lista fica em segundo plano e é recarregada ao fechar, se o modal
// tiver gravado algo (window.marcarListaSuja, chamado pelo iframe).
// Fecha no X, no clique fora e no Esc.
// =====================================================================

export function abrirModalProcesso(href, aoFechar) {
  const url = new URL(href, location.href);
  url.searchParams.set('embed', '1');

  const overlay = document.createElement('div');
  overlay.className = 'modal-proc';
  overlay.innerHTML = `
    <div class="modal-proc__painel" role="dialog" aria-modal="true" aria-label="Detalhe do processo">
      <button type="button" class="modal-proc__fechar" aria-label="Fechar" title="Fechar">×</button>
      <iframe class="modal-proc__frame" title="Detalhe do processo"
              src="${url.pathname + url.search}"></iframe>
    </div>`;

  const fechar = () => {
    document.removeEventListener('keydown', aoTeclar);
    overlay.remove();
    document.body.classList.remove('modal-proc-aberto');
    aoFechar?.();
  };
  const aoTeclar = (e) => { if (e.key === 'Escape') fechar(); };

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.closest('.modal-proc__fechar')) fechar();
  });
  document.addEventListener('keydown', aoTeclar);

  document.body.appendChild(overlay);
  document.body.classList.add('modal-proc-aberto');
}
