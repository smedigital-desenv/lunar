// =====================================================================
// acoes-demanda.js — definição dos modais de tramitação e sua execução.
// camposDaAcao() descreve o formulário; executar() chama o serviço (RPC).
// Em modo demonstração (sem sessão), apenas confirma por toast.
// =====================================================================

import { abrirFormulario, PRIORIDADES } from './modais.js';
import { toast } from './componentes.js';

const MANTER = { valor: '', rotulo: '(manter)' };

// Retorna { titulo, textoConfirmar, campos } para a ação, ou null.
export function camposDaAcao(chave, ctx) {
  const usuarios = ctx.usuarios || [];
  const tarefas = (ctx.tarefas || []).map(t => ({ valor: t.id, rotulo: t.titulo }));
  switch (chave) {
    case 'encaminhar': return { titulo: 'Encaminhar', textoConfirmar: 'Enviar', campos: [
      { nome: 'destinatario', rotulo: 'Destinatário', tipo: 'select', opcoes: usuarios, obrigatorio: true },
      { nome: 'texto', rotulo: 'Mensagem / despacho', tipo: 'textarea', obrigatorio: true },
      { nome: 'prioridade', rotulo: 'Prioridade', tipo: 'select', opcoes: PRIORIDADES },
      { nome: 'prazo', rotulo: 'Prazo (opcional)', tipo: 'date' } ] };
    case 'subtarefa': return { titulo: 'Nova subtarefa', textoConfirmar: 'Criar', campos: [
      { nome: 'parent', rotulo: 'Tarefa-mãe', tipo: 'select', opcoes: tarefas, obrigatorio: true },
      { nome: 'responsavel', rotulo: 'Responsável', tipo: 'select', opcoes: usuarios, obrigatorio: true },
      { nome: 'titulo', rotulo: 'Título', tipo: 'text', obrigatorio: true },
      { nome: 'descricao', rotulo: 'Descrição', tipo: 'textarea' },
      { nome: 'prazo', rotulo: 'Prazo (opcional)', tipo: 'date' } ] };
    case 'reencaminhar': return { titulo: 'Trocar destinatário', textoConfirmar: 'Trocar', campos: [
      { nome: 'destinatario', rotulo: 'Novo destinatário', tipo: 'select', opcoes: usuarios, obrigatorio: true },
      { nome: 'texto', rotulo: 'Observação (opcional)', tipo: 'textarea' } ] };
    case 'devolutiva': return { titulo: 'Registrar devolutiva', textoConfirmar: 'Registrar', campos: [
      { nome: 'texto', rotulo: 'Texto da devolutiva', tipo: 'textarea', obrigatorio: true },
      { nome: 'anexos', rotulo: 'Anexos (PDF, Word, Excel, imagem — até 20 MB)', tipo: 'file' } ] };
    case 'complementacao': return { titulo: 'Solicitar complementação', textoConfirmar: 'Solicitar', campos: [
      { nome: 'texto', rotulo: 'O que falta / motivo', tipo: 'textarea', obrigatorio: true } ] };
    case 'concluir': return { titulo: 'Concluir demanda', textoConfirmar: 'Concluir', campos: [
      { nome: 'conclusao', rotulo: 'Conclusão / desfecho', tipo: 'textarea', obrigatorio: true } ] };
    case 'reabrir': return { titulo: 'Reabrir demanda', textoConfirmar: 'Reabrir', campos: [
      { nome: 'justificativa', rotulo: 'Justificativa', tipo: 'textarea', obrigatorio: true } ] };
    case 'editar': return { titulo: 'Editar demanda', textoConfirmar: 'Salvar', campos: [
      { nome: 'titulo', rotulo: 'Título', tipo: 'text' },
      { nome: 'prioridade', rotulo: 'Prioridade', tipo: 'select', opcoes: [MANTER, ...PRIORIDADES] },
      { nome: 'prazo', rotulo: 'Prazo', tipo: 'date' },
      { nome: 'justificativa', rotulo: 'Justificativa', tipo: 'textarea', obrigatorio: true } ] };
    case 'inativar': return { titulo: 'Inativar demanda', textoConfirmar: 'Inativar', campos: [
      { nome: 'motivo', rotulo: 'Motivo', tipo: 'textarea', obrigatorio: true } ] };
    case 'reativar': return { titulo: 'Reativar demanda', textoConfirmar: 'Reativar', campos: [
      { nome: 'motivo', rotulo: 'Motivo', tipo: 'textarea', obrigatorio: true } ] };
    case 'retificar': return { titulo: 'Retificar movimentação', textoConfirmar: 'Retificar', campos: [
      { nome: 'texto_correto', rotulo: 'Texto correto', tipo: 'textarea', obrigatorio: true },
      { nome: 'justificativa', rotulo: 'Justificativa', tipo: 'textarea', obrigatorio: true } ] };
    case 'ressalva': return { titulo: 'Registrar ressalva', textoConfirmar: 'Registrar', campos: [
      { nome: 'texto_correto', rotulo: 'Teor correto', tipo: 'textarea', obrigatorio: true },
      { nome: 'justificativa', rotulo: 'Justificativa', tipo: 'textarea', obrigatorio: true } ] };
    default: return null;
  }
}

async function executar(chave, vals, ctx) {
  const [dem, tar, mov, anx] = await Promise.all([
    import('../services/demandas.js'), import('../services/tarefas.js'),
    import('../services/movimentacoes.js'), import('../services/anexos.js')
  ]);
  const id = ctx.demanda.id;
  switch (chave) {
    case 'encaminhar': return tar.encaminhar({ destinatarioId: vals.destinatario, texto: vals.texto,
      demandaId: id, prioridade: vals.prioridade || null, prazo: vals.prazo || null });
    case 'subtarefa': return tar.criarSubtarefa({ parentId: vals.parent, responsavelId: vals.responsavel,
      titulo: vals.titulo, descricao: vals.descricao || null, prazo: vals.prazo || null });
    case 'reencaminhar': return tar.reencaminhar({ tarefaId: ctx.tarefaId,
      novoDestinatarioId: vals.destinatario, texto: vals.texto || null });
    case 'devolutiva': {
      const metadados = [];
      for (const f of (vals.anexos || [])) metadados.push(await anx.subirAnexo(f, { pasta: `demanda/${id}` }));
      return tar.registrarDevolutiva(ctx.tarefaId, vals.texto, metadados);
    }
    case 'complementacao': return dem.solicitarComplementacao(id, vals.texto);
    case 'concluir': return dem.concluir(id, vals.conclusao);
    case 'reabrir': return dem.reabrir(id, vals.justificativa);
    case 'editar': {
      const campos = {};
      if (vals.titulo) campos.titulo = vals.titulo;
      if (vals.prioridade) campos.prioridade = vals.prioridade;
      if (vals.prazo) campos.prazo = vals.prazo;
      return dem.editarDemanda(id, campos, vals.justificativa);
    }
    case 'inativar': return dem.inativarDemanda(id, vals.motivo);
    case 'reativar': return dem.reativarDemanda(id, vals.motivo);
    case 'retificar': return mov.retificar(ctx.movId, vals.texto_correto, vals.justificativa);
    case 'ressalva': return mov.registrarRessalva(ctx.movId, vals.texto_correto, vals.justificativa);
  }
}

// Abre o modal da ação e executa (serviço real ou, em demo, confirma por toast).
export async function abrirEExecutar(chave, ctx) {
  const cfg = camposDaAcao(chave, ctx);
  if (!cfg) return;
  const vals = await abrirFormulario(cfg);
  if (!vals) return;
  if (ctx.demo) {
    toast(`Modo demonstração: "${cfg.titulo}" capturado. Envio real quando a autenticação entrar.`, 'aviso');
    return;
  }
  try {
    await executar(chave, vals, ctx);
    toast('Registrado com sucesso.', 'sucesso');
    setTimeout(() => location.reload(), 800);
  } catch (e) {
    toast(e.message || 'Falha ao registrar.', 'erro');
  }
}
