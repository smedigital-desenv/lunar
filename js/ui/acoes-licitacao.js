// =====================================================================
// acoes-licitacao.js — campos e execução das ações do processo de
// licitação. Os modais são declarativos (modais.js); as regras de
// negócio (equipe, janela de retificação, justificativas) estão no
// banco (sql/041) — aqui é só coleta e chamada da RPC.
// =====================================================================

import { abrirFormulario } from './modais.js';
import { toast } from './componentes.js';

export const PRIORIDADES_LIC = [
  { valor: '1_secretario', rotulo: '1 - Secretário' },
  { valor: '2_alta', rotulo: '2 - Alta' },
  { valor: '3_normal', rotulo: '3 - Normal' }
];

export const CATEGORIAS = [
  { valor: 'almox_sede', rotulo: 'Almox e Sede' },
  { valor: 'nutricao', rotulo: 'Nutrição' },
  { valor: 'servicos_obras', rotulo: 'Serviços e Obras' }
];

// Rótulos compartilhados entre a lista e o detalhe (módulo sem efeito
// colateral — as páginas importam daqui, nunca uma da outra).
export const ROTULO_CATEGORIA =
  Object.fromEntries(CATEGORIAS.map(c => [c.valor, c.rotulo]));
export const ROTULO_PRIORIDADE_LIC =
  Object.fromEntries(PRIORIDADES_LIC.map(p => [p.valor, p.rotulo]));

// ctx = { processo, fases, locais, servico } — servico é o módulo
// js/services/licitacoes.js (null em modo demonstração).
function definirAcao(acao, ctx) {
  const p = ctx.processo;
  const opcoesFase = ctx.fases.filter(f => f.id !== p.fase?.id)
    .map(f => ({ valor: f.id, rotulo: f.nome }));
  const opcoesLocal = ctx.locais.filter(l => l.id !== p.local?.id)
    .map(l => ({ valor: l.id, rotulo: l.sigla }));

  const ACOES = {
    andamento: {
      titulo: 'Registrar andamento',
      campos: [
        { nome: 'texto', rotulo: 'Andamento', tipo: 'textarea', obrigatorio: true }
      ],
      executar: v => ctx.servico.registrarAndamento(p.id, v.texto)
    },
    fase: {
      titulo: 'Mudar de fase',
      campos: [
        { nome: 'fase_id', rotulo: 'Nova fase', tipo: 'select', opcoes: opcoesFase, obrigatorio: true },
        { nome: 'texto', rotulo: 'Observação', tipo: 'textarea' }
      ],
      executar: v => ctx.servico.mudarFase(p.id, v.fase_id, v.texto || null)
    },
    local: {
      titulo: 'Tramitar para outro local',
      campos: [
        { nome: 'local_id', rotulo: 'Novo local', tipo: 'select', opcoes: opcoesLocal, obrigatorio: true },
        { nome: 'texto', rotulo: 'Observação', tipo: 'textarea' }
      ],
      executar: v => ctx.servico.mudarLocal(p.id, v.local_id, v.texto || null)
    },
    pregao: {
      titulo: 'Agendar/reagendar pregão',
      campos: [
        { nome: 'data', rotulo: 'Data da sessão', tipo: 'date', obrigatorio: true },
        { nome: 'texto', rotulo: 'Observação (horário, motivo do reagendamento…)', tipo: 'textarea' }
      ],
      executar: v => ctx.servico.agendarPregao(p.id, v.data, v.texto || null)
    },
    editar: {
      titulo: 'Editar dados do processo',
      campos: [
        { nome: 'objeto', rotulo: 'Objeto', tipo: 'textarea', valor: p.objeto, obrigatorio: true },
        { nome: 'categoria', rotulo: 'Categoria', tipo: 'select', opcoes: CATEGORIAS, valor: p.categoria },
        { nome: 'prioridade', rotulo: 'Prioridade', tipo: 'select', opcoes: PRIORIDADES_LIC, valor: p.prioridade },
        { nome: 'numero_requisicao', rotulo: 'Nº da requisição', valor: p.numero_requisicao ?? '' },
        { nome: 'numero_processo_compra', rotulo: 'Nº do processo de compra', valor: p.numero_processo_compra ?? '' },
        { nome: 'numero_pregao', rotulo: 'Nº do pregão eletrônico', valor: p.numero_pregao ?? '' },
        { nome: 'numero_processo_solar', rotulo: 'Nº do processo (Solar)', valor: p.numero_processo_solar ?? '' },
        { nome: 'valor_requisicao', rotulo: 'Valor da requisição (R$)', valor: p.valor_requisicao ?? '' },
        { nome: 'valor_arrematado', rotulo: 'Valor arrematado (R$)', valor: p.valor_arrematado ?? '' },
        { nome: 'valor_frustrado_deserto', rotulo: 'Valores frustrados/desertos (R$)', valor: p.valor_frustrado_deserto ?? '' },
        { nome: 'justificativa', rotulo: 'Justificativa', tipo: 'textarea', obrigatorio: true }
      ],
      executar: v => {
        const { justificativa, ...campos } = v;
        // Envia só o que mudou — a lista branca fica no banco.
        const alterados = {};
        for (const [k, valor] of Object.entries(campos)) {
          const atual = p[k] ?? '';
          if (String(valor) !== String(atual)) alterados[k] = valor;
        }
        if (!Object.keys(alterados).length) {
          throw new Error('Nenhum campo foi alterado.');
        }
        return ctx.servico.editarProcesso(p.id, alterados, justificativa);
      }
    },
    inativar: {
      titulo: 'Inativar processo',
      campos: [
        { tipo: 'aviso', texto: 'O processo sai das listagens, mas nada é apagado: o histórico permanece.' },
        { nome: 'motivo', rotulo: 'Motivo', tipo: 'textarea', obrigatorio: true }
      ],
      executar: v => ctx.servico.inativarProcesso(p.id, v.motivo)
    },
    reativar: {
      titulo: 'Reativar processo',
      campos: [
        { nome: 'motivo', rotulo: 'Motivo', tipo: 'textarea', obrigatorio: true }
      ],
      executar: v => ctx.servico.reativarProcesso(p.id, v.motivo)
    }
  };
  return ACOES[acao];
}

// Ações da timeline (recebem a movimentação, não o processo).
function definirAcaoMov(acao, movId, ctx) {
  const MOV = {
    retificar: {
      titulo: 'Retificar movimentação',
      campos: [
        { tipo: 'aviso', texto: 'Só o autor retifica, e apenas enquanto ninguém mais movimentou o processo. Depois disso, use a ressalva.' },
        { nome: 'texto_correto', rotulo: 'Texto correto', tipo: 'textarea', obrigatorio: true },
        { nome: 'justificativa', rotulo: 'Justificativa', tipo: 'textarea', obrigatorio: true }
      ],
      executar: v => ctx.servico.retificarMovimentacao(movId, v.texto_correto, v.justificativa)
    },
    ressalva: {
      titulo: 'Registrar ressalva',
      campos: [
        { nome: 'texto_correto', rotulo: 'Texto da ressalva', tipo: 'textarea', obrigatorio: true },
        { nome: 'justificativa', rotulo: 'Justificativa', tipo: 'textarea', obrigatorio: true }
      ],
      executar: v => ctx.servico.registrarRessalva(movId, v.texto_correto, v.justificativa)
    }
  };
  return MOV[acao];
}

// Abre o modal da ação e executa. Devolve true se algo foi gravado
// (a tela recarrega os dados); false se cancelado ou em demonstração.
export async function abrirEExecutar(acao, ctx, movId = null) {
  const def = movId ? definirAcaoMov(acao, movId, ctx) : definirAcao(acao, ctx);
  if (!def) return false;
  const valores = await abrirFormulario({
    titulo: def.titulo, campos: def.campos, textoConfirmar: 'Confirmar'
  });
  if (!valores) return false;
  if (!ctx.servico) {
    toast('Modo demonstração: nada foi gravado.', 'aviso');
    return false;
  }
  try {
    await def.executar(valores);
    toast('Registrado com sucesso.', 'sucesso');
    return true;
  } catch (e) {
    console.error(e);
    toast(e.message || 'Erro ao registrar.', 'erro');
    return false;
  }
}
