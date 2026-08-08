// =====================================================================
// caixa-entrada.js — tarefas atribuídas ao usuário (o que ele tem a fazer).
// Dados de exemplo agora; carregarReal() usa o serviço quando houver sessão.
// =====================================================================

import { iniciarCaixa, cartaoLista, filtrarPaginar } from './caixa.js';
import { fmtPrazo } from './componentes.js';

const EXEMPLO = [
  { id: 't1', demanda_id: 'd1', demanda_numero: 'DEM-2026-000042', titulo: 'Verificar contrato de merenda', situacao: 'em_andamento', prioridade: 'alta', prazo: '2026-08-05' },
  { id: 't2', demanda_id: 'd2', demanda_numero: 'DEM-2026-000051', titulo: 'Emitir parecer sobre transferência', situacao: 'aberta', prioridade: 'normal', prazo: '2026-08-12' },
  { id: 't3', demanda_id: 'd3', demanda_numero: 'DEM-2026-000058', titulo: 'Vazamento no telhado — vistoria', situacao: 'aberta', prioridade: 'urgente', prazo: '2026-08-01' },
  { id: 't4', demanda_id: 'd4', demanda_numero: 'DEM-2026-000060', titulo: 'Responder ofício da Câmara', situacao: 'aguardando_complementacao', prioridade: 'normal', prazo: '2026-08-20' },
  { id: 't5', demanda_id: 'd5', demanda_numero: 'DEM-2026-000062', titulo: 'Conferir lista de materiais', situacao: 'devolvida', prioridade: 'baixa', prazo: '2026-08-15' },
  { id: 't6', demanda_id: 'd6', demanda_numero: 'DEM-2026-000065', titulo: 'Reparo elétrico concluído', situacao: 'concluida', prioridade: 'normal', prazo: '2026-07-25' },
  { id: 't7', demanda_id: 'd7', demanda_numero: 'DEM-2026-000070', titulo: 'Falta de professor — urgente', situacao: 'em_andamento', prioridade: 'urgente', prazo: '2026-07-30' }
];

async function carregarReal(filtro, pagina, porPagina) {
  const { listarCaixaEntrada } = await import('../services/tarefas.js');
  const { itens, total } = await listarCaixaEntrada({ filtro, pagina, porPagina });
  // Agora cada item é uma DEMANDA (sou responsável atual ou tenho subtarefa).
  const mapeados = itens.map(d => ({
    demanda_id: d.id,
    demanda_numero: d.numero,
    titulo: d.titulo, situacao: d.situacao, prioridade: d.prioridade,
    sigilo: d.sigilo, prazo: d.prazo
  }));
  return { itens: mapeados, total, demo: false };
}

// Com sessão, um erro do banco SOBE — não vira "modo demonstração".
// Quem decide é o js/ui/demo.js.
async function carregar(filtro, pagina, porPagina) {
  return demo.carregar(
    () => carregarReal(filtro, pagina, porPagina),
    () => filtrarPaginar(EXEMPLO, filtro, pagina, porPagina)
  );
}

iniciarCaixa({
  titulo: 'Caixa de entrada',
  porPagina: 5,
  carregar,
  renderItem: (t) => cartaoLista({
    href: `./demanda.html?id=${t.demanda_id}`,
    numero: t.demanda_numero,
    titulo: t.titulo,
    situacao: t.situacao,
    prioridade: t.prioridade,
    sigilo: t.sigilo,
    meta: `Prazo: ${fmtPrazo(t.prazo)}`
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
montarNavegacao('entrada');

// Visão lista + detalhe (desktop).
import { habilitarDetalheLateral } from './detalhe-lado.js';
import * as demo from './demo.js';
habilitarDetalheLateral();
