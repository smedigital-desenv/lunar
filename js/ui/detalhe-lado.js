// =====================================================================
// detalhe-lado.js — visão mestre-detalhe nas listas (desktop).
// Em telas largas, divide a página em duas colunas: a lista à esquerda e
// o detalhe da demanda selecionada à direita (a própria tela da demanda,
// embutida em modo ?embed=1). No celular, não divide: o clique navega
// normalmente para a tela cheia.
// =====================================================================

const LARGO = '(min-width: 900px)';

export function habilitarDetalheLateral() {
  const main = document.querySelector('main.pagina');
  if (!main || main.querySelector('.split')) return;

  const split = document.createElement('div');
  split.className = 'split';
  const colLista = document.createElement('div');
  colLista.className = 'split__lista';
  const colDetalhe = document.createElement('div');
  colDetalhe.className = 'split__detalhe';
  colDetalhe.innerHTML = '<div class="split__vazio texto-silencioso">'
    + 'Selecione uma demanda para ver os detalhes ao lado.</div>';

  // Move o conteúdo atual da página para a coluna da lista.
  while (main.firstChild) colLista.appendChild(main.firstChild);
  split.appendChild(colLista);
  split.appendChild(colDetalhe);
  main.appendChild(split);

  // Nas telas com lista+detalhe, o layout usa uma largura maior.
  document.body.classList.add('layout-largo');

  const mq = window.matchMedia(LARGO);

  colLista.addEventListener('click', (e) => {
    if (!mq.matches) return;                       // celular → navega normal
    const a = e.target.closest('a.cartao[href*="demanda.html"]');
    if (!a) return;
    e.preventDefault();
    colLista.querySelectorAll('a.cartao--ativo').forEach(c => c.classList.remove('cartao--ativo'));
    a.classList.add('cartao--ativo');

    const url = new URL(a.getAttribute('href'), location.href);
    url.searchParams.set('embed', '1');
    const frame = document.createElement('iframe');
    frame.className = 'split__frame';
    frame.title = 'Detalhe da demanda';
    frame.src = url.pathname + url.search;
    colDetalhe.innerHTML = '';
    colDetalhe.appendChild(frame);
  });

  // Ao voltar de desktop para mobile, remove seleção destacada.
  mq.addEventListener('change', (ev) => {
    if (!ev.matches) {
      colLista.querySelectorAll('a.cartao--ativo').forEach(c => c.classList.remove('cartao--ativo'));
    }
  });
}
