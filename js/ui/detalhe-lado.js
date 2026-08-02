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

const EXEMPLO_SIDEBAR = [
  { id: 'd1', numero: 'DEM-2026-000042', titulo: 'Falta de merenda na EMEF João da Silva', situacao: 'em_andamento', prioridade: 'alta', sigilo: 'normal', prazo: '2026-08-05' },
  { id: 'd2', numero: 'DEM-2026-000051', titulo: 'Emitir parecer sobre transferência', situacao: 'aberta', prioridade: 'normal', sigilo: 'normal', prazo: '2026-08-12' },
  { id: 'd3', numero: 'DEM-2026-000058', titulo: 'Vazamento no telhado — vistoria', situacao: 'aberta', prioridade: 'urgente', sigilo: 'normal', prazo: '2026-07-30' }
];

// Sidebar na TELA DA DEMANDA (desktop): lista "Todos" à esquerda, o conteúdo
// da demanda à direita. Assim não se perde a lista ao abrir uma demanda.
// Os cartões navegam (recarrega a página com a nova demanda). No celular não
// monta (tela cheia). Chamada só quando a página NÃO está em modo embed.
export function montarSidebarDemanda(ativoId) {
  const mq = window.matchMedia(LARGO);
  if (!mq.matches) return;                         // celular → tela cheia
  const main = document.querySelector('main.pagina');
  if (!main || main.querySelector('.split-demanda')) return;

  const split = document.createElement('div');
  split.className = 'split-demanda';
  const colLista = document.createElement('div');
  colLista.className = 'split-demanda__lista';
  colLista.innerHTML = '<div class="texto-silencioso small p-1">Carregando lista…</div>';
  const colConteudo = document.createElement('div');
  colConteudo.className = 'split-demanda__conteudo';

  while (main.firstChild) colConteudo.appendChild(main.firstChild);   // move o conteúdo da demanda
  split.appendChild(colLista);
  split.appendChild(colConteudo);
  main.appendChild(split);
  document.body.classList.add('layout-largo');

  preencherSidebar(colLista, ativoId);
}

async function preencherSidebar(colLista, ativoId) {
  const [caixa, comp] = await Promise.all([import('./caixa.js'), import('./componentes.js')]);
  let itens = null;
  try {
    const { listarPorKpi } = await import('../services/painel.js');
    const dados = await listarPorKpi('todos', 1, 50);
    itens = dados?.itens || [];
  } catch (_) {
    itens = EXEMPLO_SIDEBAR;
  }
  colLista.innerHTML = itens.length
    ? itens.map(d => caixa.cartaoLista({
        href: `./demanda.html?id=${encodeURIComponent(d.id)}`,
        numero: d.numero, titulo: d.titulo, situacao: d.situacao,
        prioridade: d.prioridade, sigilo: d.sigilo,
        meta: d.prazo ? `Prazo: ${comp.fmtPrazo(d.prazo)}` : null
      })).join('')
    : '<p class="texto-silencioso small p-1">Nenhuma demanda.</p>';
  colLista.querySelectorAll('a.cartao').forEach(a => {
    if (a.getAttribute('href').includes(`id=${ativoId}`)) a.classList.add('cartao--ativo');
  });
}
