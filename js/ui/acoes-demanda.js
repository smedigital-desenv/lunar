// =====================================================================
// acoes-demanda.js — definição dos modais de tramitação e sua execução.
// camposDaAcao() descreve o formulário; executar() chama o serviço (RPC).
// Em modo demonstração (sem sessão), apenas confirma por toast.
// =====================================================================

import { abrirFormulario, PRIORIDADES } from './modais.js';
import { toast } from './componentes.js';

const VINCULOS = [
  { valor: 'aluno', rotulo: 'Aluno' }, { valor: 'responsavel', rotulo: 'Responsável' },
  { valor: 'servidor', rotulo: 'Servidor' }, { valor: 'outro', rotulo: 'Outro' }
];

// Retorna { titulo, textoConfirmar, campos } para a ação, ou null.
export function camposDaAcao(chave, ctx) {
  const usuarios = ctx.usuarios || [];
  switch (chave) {
    case 'encaminhar': return { titulo: 'Encaminhar', textoConfirmar: 'Enviar', campos: [
      { nome: 'destinatario', rotulo: 'Destinatário', tipo: 'select', opcoes: usuarios, obrigatorio: true },
      { nome: 'texto', rotulo: 'Mensagem / despacho', tipo: 'textarea', obrigatorio: true },
      { nome: 'prioridade', rotulo: 'Prioridade', tipo: 'select', opcoes: PRIORIDADES },
      { nome: 'prazo', rotulo: 'Prazo (opcional)', tipo: 'date' } ] };
    case 'subtarefa': {
      // Dono da demanda (criador ou responsável atual) cria onde quiser;
      // quem só recebeu uma tarefa só cria a partir dela — nunca na raiz.
      const usuarioId = ctx.usuario?.id;
      const souDonoDemanda = !!usuarioId
        && (usuarioId === ctx.demanda?.responsavel_atual_id || usuarioId === ctx.demanda?.criado_por);
      const minhasTarefas = (ctx.tarefas || [])
        .filter(t => t.ativo !== false && t.situacao !== 'concluida' && t.responsavel_id === usuarioId)
        .map(t => ({ valor: t.id, rotulo: t.titulo }));
      const opcoesPai = souDonoDemanda
        ? [{ valor: '', rotulo: '(diretamente na demanda)' }, ...minhasTarefas]
        : minhasTarefas;
      return { titulo: 'Nova subtarefa', textoConfirmar: 'Criar', campos: [
        { nome: 'parent', rotulo: 'Tarefa-mãe', tipo: 'select', obrigatorio: !souDonoDemanda,
          opcoes: opcoesPai },
        { nome: 'responsavel', rotulo: 'Responsável', tipo: 'select', opcoes: usuarios, obrigatorio: true },
        { nome: 'titulo', rotulo: 'Título', tipo: 'text', obrigatorio: true },
        { nome: 'descricao', rotulo: 'Descrição', tipo: 'textarea' },
        { nome: 'prazo', rotulo: 'Prazo (opcional)', tipo: 'date' } ] };
    }
    case 'reencaminhar': return { titulo: 'Trocar destinatário', textoConfirmar: 'Trocar', campos: [
      { nome: 'destinatario', rotulo: 'Novo destinatário', tipo: 'select', opcoes: usuarios, obrigatorio: true },
      { nome: 'texto', rotulo: 'Observação (opcional)', tipo: 'textarea' } ] };
    case 'devolutiva': return { titulo: 'Devolver tarefa', textoConfirmar: 'Devolver', campos: [
      { tipo: 'aviso', texto: 'Devolver significa que você NÃO vai executar esta tarefa — ela volta para quem delegou.' },
      { nome: 'texto', rotulo: 'Motivo da devolução', tipo: 'textarea', obrigatorio: true } ] };
    case 'concluir_tarefa': return { titulo: 'Concluir tarefa', textoConfirmar: 'Concluir', campos: [
      { tipo: 'aviso', texto: 'Concluir indica que você EXECUTOU a tarefa. Registre a resposta/resultado e anexe o que produziu.' },
      { nome: 'texto', rotulo: 'Resposta / resultado', tipo: 'textarea', obrigatorio: true },
      { nome: 'anexos', rotulo: 'Anexos (PDF, Word, Excel, imagem — até 20 MB)', tipo: 'file' },
      { nome: 'link', rotulo: 'Link do Google Drive (opcional)', tipo: 'url',
        placeholder: 'https://drive.google.com/...' } ] };
    case 'complementacao': return { titulo: 'Solicitar complementação', textoConfirmar: 'Solicitar', campos: [
      { nome: 'texto', rotulo: 'O que falta / motivo', tipo: 'textarea', obrigatorio: true } ] };
    case 'comentario': return { titulo: 'Comentar', textoConfirmar: 'Registrar', campos: [
      { nome: 'texto', rotulo: 'Informação / observação', tipo: 'textarea', obrigatorio: true } ] };
    case 'complementar': return { titulo: 'Prestar complementação', textoConfirmar: 'Enviar', campos: [
      { tipo: 'aviso', texto: 'Informe o que foi solicitado. A demanda volta a "Em andamento" e a contagem de prazo é retomada.' },
      { nome: 'texto', rotulo: 'Complementação', tipo: 'textarea', obrigatorio: true },
      { nome: 'anexos', rotulo: 'Anexos (PDF, Word, Excel, imagem — até 20 MB)', tipo: 'file' },
      { nome: 'link', rotulo: 'Link do Google Drive (opcional)', tipo: 'url',
        placeholder: 'https://drive.google.com/...' } ] };
    case 'concluir': {
      const abertas = (ctx.tarefas || []).filter(t => t.ativo !== false && t.situacao !== 'concluida').length;
      const campos = [];
      if (abertas > 0) {
        campos.push({ tipo: 'aviso',
          texto: `Atenção: há ${abertas} subtarefa(s) em aberto. Ao concluir, elas serão encerradas automaticamente.` });
      }
      campos.push({ nome: 'conclusao', rotulo: 'Conclusão / desfecho', tipo: 'textarea', obrigatorio: true });
      return { titulo: 'Concluir demanda', textoConfirmar: 'Concluir', campos };
    }
    // Pessoas envolvidas (sql/047): só quem participa da demanda. A
    // justificativa é obrigatória em todas — regra 7.
    case 'pessoa_adicionar': return {
      titulo: 'Acrescentar pessoa envolvida', textoConfirmar: 'Acrescentar', campos: [
        { nome: 'nome', rotulo: 'Nome', tipo: 'text', obrigatorio: true },
        { nome: 'vinculo', rotulo: 'Vínculo', tipo: 'select', opcoes: VINCULOS },
        { nome: 'observacao', rotulo: 'Observação', tipo: 'text' },
        { nome: 'justificativa', rotulo: 'Justificativa', tipo: 'textarea', obrigatorio: true } ] };
    case 'pessoa_editar': {
      const p = ctx.pessoa || {};
      return { titulo: 'Corrigir pessoa envolvida', textoConfirmar: 'Salvar', campos: [
        { nome: 'nome', rotulo: 'Nome', tipo: 'text', valor: p.nome, obrigatorio: true },
        { nome: 'vinculo', rotulo: 'Vínculo', tipo: 'select', opcoes: VINCULOS, valor: p.vinculo },
        { nome: 'observacao', rotulo: 'Observação', tipo: 'text', valor: p.observacao },
        { nome: 'justificativa', rotulo: 'Justificativa', tipo: 'textarea', obrigatorio: true } ] };
    }
    case 'pessoa_inativar': return {
      titulo: 'Remover pessoa envolvida', textoConfirmar: 'Remover', campos: [
        { tipo: 'aviso', texto: 'O registro não é apagado: fica inativo, com o motivo, '
          + 'e sai da tela e do relatório.' },
        { nome: 'motivo', rotulo: 'Motivo', tipo: 'textarea', obrigatorio: true } ] };
    case 'reabrir': return { titulo: 'Reabrir demanda', textoConfirmar: 'Reabrir', campos: [
      { nome: 'justificativa', rotulo: 'Justificativa', tipo: 'textarea', obrigatorio: true } ] };
    case 'editar': {
      // Chefia edita qualquer campo (todos pré-preenchidos com o valor
      // atual — corrigir um texto longo não deveria exigir retypar tudo).
      // Quem é só dono da demanda (sem ser chefia) só pode corrigir o
      // responsável por aqui — os demais campos continuam exigindo
      // gerente/superior no escopo (sql/034/035).
      const d = ctx.demanda || {};
      const tipos = (ctx.tipos || []).map(t => ({ valor: t.id, rotulo: t.nome }));
      const escolas = (ctx.escolas || []).map(e => ({ valor: e.id, rotulo: e.nome }));
      const SEM_TIPO = { valor: '', rotulo: '— selecione —' };
      const SEM_ESCOLA = { valor: '', rotulo: '— nenhuma —' };
      const SIGILO = [{ valor: 'normal', rotulo: 'Normal' }, { valor: 'restrito', rotulo: 'Restrito' }];
      const campos = [];
      if (ctx.podeEditarGeral) {
        campos.push(
          { nome: 'titulo', rotulo: 'Título', tipo: 'text', valor: d.titulo, obrigatorio: true },
          { nome: 'objeto_queixa', rotulo: 'Objeto / queixa', tipo: 'textarea', valor: d.objeto_queixa, obrigatorio: true },
          { nome: 'descricao', rotulo: 'Descrição', tipo: 'textarea', valor: d.descricao },
          { nome: 'tipo_id', rotulo: 'Tipo', tipo: 'select', opcoes: [SEM_TIPO, ...tipos], valor: d.tipo_id },
          { nome: 'prioridade', rotulo: 'Prioridade', tipo: 'select', opcoes: PRIORIDADES, valor: d.prioridade },
          { nome: 'categoria', rotulo: 'Categoria', tipo: 'text', valor: d.categoria },
          { nome: 'setor', rotulo: 'Setor', tipo: 'text', valor: d.setor },
          { nome: 'prazo', rotulo: 'Prazo', tipo: 'date', valor: d.prazo },
          { nome: 'escola_id', rotulo: 'Escola', tipo: 'select', opcoes: [SEM_ESCOLA, ...escolas], valor: d.escola_id },
          { nome: 'aluno_nome', rotulo: 'Aluno', tipo: 'text', valor: d.aluno_nome },
          { nome: 'numero_processo_solar', rotulo: 'Nº processo Solar', tipo: 'text', valor: d.numero_processo_solar },
          { nome: 'link_documentacao', rotulo: 'Link da documentação', tipo: 'text', valor: d.link_documentacao },
          { nome: 'sigilo', rotulo: 'Sigilo', tipo: 'select', opcoes: SIGILO, valor: d.sigilo }
        );
      }
      if (ctx.souDono) {
        campos.push({ nome: 'responsavel', rotulo: 'Responsável', tipo: 'select', opcoes: usuarios, valor: d.responsavel_atual_id });
      }
      campos.push({ nome: 'justificativa', rotulo: 'Justificativa', tipo: 'textarea', obrigatorio: true });
      return { titulo: 'Editar demanda', textoConfirmar: 'Salvar', campos };
    }
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
  const [dem, tar, mov, anx, com] = await Promise.all([
    import('../services/demandas.js'), import('../services/tarefas.js'),
    import('../services/movimentacoes.js'), import('../services/anexos.js'),
    import('../services/comentarios.js')
  ]);
  const id = ctx.demanda.id;
  switch (chave) {
    case 'encaminhar': return tar.encaminhar({ destinatarioId: vals.destinatario, texto: vals.texto,
      demandaId: id, prioridade: vals.prioridade || null, prazo: vals.prazo || null });
    case 'subtarefa': return tar.criarSubtarefa({ parentId: vals.parent || null, demandaId: id,
      responsavelId: vals.responsavel, titulo: vals.titulo,
      descricao: vals.descricao || null, prazo: vals.prazo || null });
    case 'reencaminhar': return tar.reencaminhar({ tarefaId: ctx.tarefaId,
      novoDestinatarioId: vals.destinatario, texto: vals.texto || null });
    case 'devolutiva': return tar.registrarDevolutiva(ctx.tarefaId, vals.texto, []);
    case 'concluir_tarefa': {
      const metadados = [];
      for (const f of (vals.anexos || [])) metadados.push(await anx.subirAnexo(f, { pasta: `demanda/${id}` }));
      // Link do Google Drive: anexo só com link_externo (sem upload).
      if (vals.link) metadados.push({ nome_original: 'Link do Google Drive', link_externo: vals.link });
      return tar.concluirTarefa(ctx.tarefaId, vals.texto, metadados);
    }
    case 'complementacao': return dem.solicitarComplementacao(id, vals.texto);
    case 'comentario': return com.criarComentario({ demandaId: id, texto: vals.texto });
    case 'complementar': {
      const metadados = [];
      for (const f of (vals.anexos || [])) metadados.push(await anx.subirAnexo(f, { pasta: `demanda/${id}` }));
      if (vals.link) metadados.push({ nome_original: 'Link do Google Drive', link_externo: vals.link });
      return dem.responderComplementacao(id, vals.texto, metadados);
    }
    case 'concluir': return dem.concluir(id, vals.conclusao);
    case 'reabrir': return dem.reabrir(id, vals.justificativa);
    case 'editar': {
      // Campos gerais vêm pré-preenchidos (modais.js): reenviar o mesmo
      // valor é inofensivo (fn_editar_demanda só reaplica o que já era).
      const campos = {};
      if (ctx.podeEditarGeral) {
        campos.titulo = vals.titulo;
        campos.objeto_queixa = vals.objeto_queixa;
        campos.descricao = vals.descricao;
        campos.tipo_id = vals.tipo_id || null;
        campos.prioridade = vals.prioridade;
        campos.categoria = vals.categoria;
        campos.setor = vals.setor;
        campos.prazo = vals.prazo || null;
        campos.escola_id = vals.escola_id || null;
        campos.aluno_nome = vals.aluno_nome;
        campos.numero_processo_solar = vals.numero_processo_solar;
        campos.link_documentacao = vals.link_documentacao;
        campos.sigilo = vals.sigilo;
      }
      // Responsável: só envia se realmente mudou — reenviar o valor
      // pré-preenchido sem alterar geraria notificação/movimentação à toa.
      if (vals.responsavel && vals.responsavel !== ctx.demanda?.responsavel_atual_id) {
        campos.responsavel_id = vals.responsavel;
      }
      return dem.editarDemanda(id, campos, vals.justificativa);
    }
    case 'pessoa_adicionar':
      return dem.adicionarPessoa({ demandaId: id, nome: vals.nome,
        vinculo: vals.vinculo, observacao: vals.observacao,
        justificativa: vals.justificativa });
    case 'pessoa_editar':
      return dem.editarPessoa(ctx.pessoa.id, { nome: vals.nome,
        vinculo: vals.vinculo, observacao: vals.observacao,
        justificativa: vals.justificativa });
    case 'pessoa_inativar':
      return dem.inativarPessoa(ctx.pessoa.id, vals.motivo);
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
    // Se estamos no painel de detalhe (iframe), pede à lista da esquerda para
    // recarregar — assim a tarefa devolvida/tramitada some da caixa sem F5.
    if (window.self !== window.top) {
      try {
        if (typeof window.parent.recarregarLista === 'function') window.parent.recarregarLista();
      } catch (_) { /* origem diferente: ignora */ }
    }
    setTimeout(() => location.reload(), 800);
  } catch (e) {
    toast(e.message || 'Falha ao registrar.', 'erro');
  }
}
