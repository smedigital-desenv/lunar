// =====================================================================
// licitacoes-comum.js — constantes, formatadores e dados de exemplo do
// módulo de Licitações, compartilhados entre lista, detalhe e painel.
// Módulo SEM efeito colateral: as páginas importam daqui, nunca umas
// das outras (módulo de página executa lógica ao carregar).
// =====================================================================

export const CATEGORIAS = [
  { valor: 'almox_sede', rotulo: 'Almox e Sede' },
  { valor: 'nutricao', rotulo: 'Nutrição' },
  { valor: 'servicos_obras', rotulo: 'Serviços e Obras' }
];

export const PRIORIDADES_LIC = [
  { valor: '1_secretario', rotulo: '1 - Secretário' },
  { valor: '2_alta', rotulo: '2 - Alta' },
  { valor: '3_normal', rotulo: '3 - Normal' }
];

export const ROTULO_CATEGORIA =
  Object.fromEntries(CATEGORIAS.map(c => [c.valor, c.rotulo]));
export const ROTULO_PRIORIDADE_LIC =
  Object.fromEntries(PRIORIDADES_LIC.map(p => [p.valor, p.rotulo]));

// Reusa as cores dos badges de prioridade das demandas (app.css).
export const COR_PRIORIDADE = {
  '1_secretario': 'urgente', '2_alta': 'alta', '3_normal': 'normal'
};

export function fmtValor(v) {
  if (v == null || v === '') return null;
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Dias ÚTEIS entre uma data e hoje (exclusivo no início, inclusivo no
// fim), descontando os feriados cadastrados (regra 8 do CLAUDE.md).
export function diasUteisDesde(inicioIso, feriados) {
  const umDia = 86400000;
  const d = new Date(`${String(inicioIso).slice(0, 10)}T12:00:00`);
  const hoje = new Date(); hoje.setHours(12, 0, 0, 0);
  let n = 0;
  for (let t = d.getTime() + umDia; t <= hoje.getTime(); t += umDia) {
    const dia = new Date(t);
    const semana = dia.getDay();
    const iso = dia.toISOString().slice(0, 10);
    if (semana !== 0 && semana !== 6 && !feriados.has(iso)) n++;
  }
  return n;
}

// Um processo está "parado" quando o último andamento excede o prazo de
// alerta da fase atual (lic_fases.prazo_alerta_dias).
export function estaParado(p, feriados) {
  return diasUteisDesde(p.ultima_movimentacao_em, feriados)
    > (p.fase?.prazo_alerta_dias ?? 10);
}

// ------------------------------------------------------- Dados exemplo
export const EXEMPLO_FASES = [
  { id: 'f1', nome: 'DFD', ordem: 10, desvio: false, prazo_alerta_dias: 10 },
  { id: 'f5', nome: 'Elaborar edital', ordem: 50, desvio: false, prazo_alerta_dias: 10 },
  { id: 'f9', nome: 'Pregão em andamento', ordem: 90, desvio: false, prazo_alerta_dias: 10 },
  { id: 'f14', nome: 'Em execução', ordem: 140, desvio: false, prazo_alerta_dias: 10 },
  { id: 'f90', nome: 'Suspenso', ordem: 900, desvio: true, prazo_alerta_dias: 10 }
];

export const EXEMPLO_PROCESSOS = [
  { id: 'p1', numero: 'LIC-2026-0001', objeto: 'Material escolar – Lista 1', categoria: 'almox_sede', prioridade: '2_alta', fase: EXEMPLO_FASES[3], local: { sigla: 'EDUC-ALMOX' }, unidade: { sigla: 'GCP' }, valor_requisicao: 1114490.20, valor_arrematado: 980210.55, data_pregao: null, ultima_movimentacao_em: '2026-08-10' },
  { id: 'p2', numero: 'LIC-2026-0002', objeto: 'Uniforme escolar - 2027', categoria: 'almox_sede', prioridade: '1_secretario', fase: EXEMPLO_FASES[1], local: { sigla: 'EDUC-LICITAÇÕES' }, unidade: { sigla: 'GCP' }, valor_requisicao: 6363000, valor_arrematado: null, data_pregao: null, ultima_movimentacao_em: '2026-07-20' },
  { id: 'p3', numero: 'LIC-2026-0003', objeto: 'Gêneros alimentícios — hortifrúti', categoria: 'nutricao', prioridade: '2_alta', fase: EXEMPLO_FASES[2], local: { sigla: 'ADM-222' }, unidade: { sigla: 'GNA' }, valor_requisicao: 2861416.68, valor_arrematado: null, data_pregao: '2026-08-18', ultima_movimentacao_em: '2026-08-12' },
  { id: 'p4', numero: 'LIC-2026-0004', objeto: 'Manutenção predial — telhados', categoria: 'servicos_obras', prioridade: '3_normal', fase: EXEMPLO_FASES[4], local: { sigla: 'PGM-PJ' }, unidade: { sigla: 'GOB' }, valor_requisicao: null, valor_arrematado: null, data_pregao: null, ultima_movimentacao_em: '2026-06-30' },
  { id: 'p5', numero: 'LIC-2026-0005', objeto: 'Aquecedores de piscina', categoria: 'servicos_obras', prioridade: '3_normal', fase: EXEMPLO_FASES[0], local: { sigla: 'EDUC-GAB' }, unidade: { sigla: 'GAB' }, valor_requisicao: null, valor_arrematado: null, data_pregao: null, ultima_movimentacao_em: '2026-08-13' }
];
