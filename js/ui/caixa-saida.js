// =====================================================================
// caixa-saida.js — demandas criadas pelo usuário (o que ele encaminhou).
// Dados de exemplo agora; carregarReal() usa o serviço quando houver sessão.
// =====================================================================

import { iniciarCaixa, cartaoLista, filtrarPaginar } from './caixa.js';
import { fmtPrazo } from './componentes.js';

const EXEMPLO = [
  { id: 'd1', numero: 'DEM-2026-000042', titulo: 'Falta de merenda na EMEF Prof. João da Silva', situacao: 'em_andamento', prioridade: 'alta', sigilo: 'normal', prazo: '2026-08-05' },
  { id: 'd8', numero: 'DEM-2026-000044', titulo: 'Pedido de transporte escolar', situacao: 'aberta', prioridade: 'normal', sigilo: 'normal', prazo: '2026-08-18' },
  { id: 'd9', numero: 'DEM-2026-000047', titulo: 'Ocorrência com aluno (sigilo)', situacao: 'aguardando_complementacao', prioridade: 'alta', sigilo: 'restrito', prazo: '2026-08-03' },
  { id: 'd10', numero: 'DEM-2026-000049', titulo: 'Reforma da quadra — orçamento', situacao: 'devolvida', prioridade: 'baixa', sigilo: 'normal', prazo: '2026-09-01' },
  { id: 'd11', numero: 'DEM-2026-000052', titulo: 'Surto de piolho — comunicado', situacao: 'concluida', prioridade: 'normal', sigilo: 'normal', prazo: '2026-07-20' },
  { id: 'd12', numero: 'DEM-2026-000055', titulo: 'Internet fora do ar (urgente)', situacao: 'em_andamento', prioridade: 'urgente', sigilo: 'normal', prazo: '2026-07-31' },
  { id: 'd13', numero: 'DEM-2026-000059', titulo: 'Solicitação de material de limpeza', situacao: 'reaberta', prioridade: 'normal', sigilo: 'normal', prazo: '2026-08-10' }
];

async function carregarReal(filtro, pagina, porPagina) {
  const { listarCaixaSaida } = await import('../services/demandas.js');
  const { itens, total } = await listarCaixaSaida({ filtro, pagina, porPagina });
  return { itens, total, demo: false };
}

async function carregar(filtro, pagina, porPagina) {
  try {
    const r = await carregarReal(filtro, pagina, porPagina);
    if (r) return r;
  } catch (e) { console.error('Falha ao carregar caixa de saída real:', e); }
  const { itens, total } = filtrarPaginar(EXEMPLO, filtro, pagina, porPagina);
  return { itens, total, demo: true };
}

iniciarCaixa({
  titulo: 'Caixa de saída',
  porPagina: 5,
  carregar,
  renderItem: (d) => cartaoLista({
    href: `./demanda.html?id=${d.id}`,
    numero: d.numero,
    titulo: d.titulo,
    situacao: d.situacao,
    prioridade: d.prioridade,
    sigilo: d.sigilo,
    meta: `Prazo: ${fmtPrazo(d.prazo)}`
  })
});

// Sino de notificações no cabeçalho (Sessão 9).
import { montarSino } from './notificacoes.js';
montarSino('sino-notificacoes');

// Sessão e guarda de rota (Sessão 3).
import { iniciarSessao } from './sessao.js';
iniciarSessao();

// Barra de navegação principal.
import { montarNavegacao } from './navegacao.js';
montarNavegacao('saida');

// Visão lista + detalhe (desktop).
import { habilitarDetalheLateral } from './detalhe-lado.js';
habilitarDetalheLateral();
