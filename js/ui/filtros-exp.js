// =====================================================================
// filtros-exp.js — mantém os <details class="filtros-exp"> (filtros
// secundários das telas de lista) abertos no desktop.
//
// O CSS já esconde o <summary> "Filtros" e tenta forçar o corpo visível
// a partir de 768px, mas navegadores recentes escondem o conteúdo
// fechado de um <details> via content-visibility (não só display) —
// display:flex !important não é suficiente para reabrir por cima disso.
// A única forma confiável é setar o atributo `open`.
//
// Reaplica ao redimensionar (cruzar o ponto de corte) e sempre que o
// formulário de filtros muda de `hidden` (caso de campo-unidade em
// lista.html, que só aparece depois que a tela carrega o organograma).
// =====================================================================

const MEDIA = matchMedia('(min-width: 768px)');

function aplicar() {
  document.querySelectorAll('.filtros-exp').forEach((d) => { d.open = MEDIA.matches; });
}

aplicar();
MEDIA.addEventListener('change', aplicar);

document.querySelectorAll('form#filtros, form#form-busca').forEach((form) => {
  new MutationObserver(aplicar).observe(form, { subtree: true, attributes: true, attributeFilter: ['hidden'] });
});
