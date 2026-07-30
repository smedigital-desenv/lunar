-- =====================================================================
-- 003_indices.sql
-- Índices para caixa de entrada/saída, dashboard, timeline e pesquisa.
-- Sistema de Gestão de Demandas — SME Ribeirão Preto
--
-- Idempotente (create index if not exists). Índices parciais em `ativo`
-- porque as listagens padrão só mostram registros ativos (seção 9).
-- =====================================================================

set search_path = gestao, extensions, public;

-- ---------------------------------------------------------------------
-- usuarios / unidades — provisionamento e escopo recursivo.
-- ---------------------------------------------------------------------
create index if not exists idx_usuarios_unidade   on gestao.usuarios(unidade_id);
create index if not exists idx_usuarios_perfil     on gestao.usuarios(perfil);
create index if not exists idx_unidades_parent     on gestao.unidades_organizacionais(parent_id);

-- ---------------------------------------------------------------------
-- demandas — filtros das caixas, dashboard e busca reversa por Solar.
-- ---------------------------------------------------------------------
create index if not exists idx_demandas_situacao
  on gestao.demandas(situacao) where ativo;
create index if not exists idx_demandas_prioridade
  on gestao.demandas(prioridade) where ativo;
create index if not exists idx_demandas_unidade_resp
  on gestao.demandas(unidade_responsavel_id) where ativo;
create index if not exists idx_demandas_responsavel
  on gestao.demandas(responsavel_atual_id) where ativo;
create index if not exists idx_demandas_solicitante
  on gestao.demandas(solicitante_id);
-- Caixa de saída: demandas que o usuário criou, por situação.
create index if not exists idx_demandas_criador_situacao
  on gestao.demandas(criado_por, situacao) where ativo;
-- Atraso / prazo no dashboard.
create index if not exists idx_demandas_prazo
  on gestao.demandas(prazo) where ativo and prazo is not null;
-- Amarração ao processo Solar (busca reversa).
create index if not exists idx_demandas_processo_solar
  on gestao.demandas(numero_processo_solar)
  where numero_processo_solar is not null;

-- Pesquisa textual em português, insensível a acento (seção 17).
create index if not exists idx_demandas_busca on gestao.demandas
  using gin (
    to_tsvector('gestao.portugues_sem_acento',
      coalesce(numero,'') || ' ' || coalesce(titulo,'') || ' ' ||
      coalesce(descricao,'') || ' ' || coalesce(objeto_queixa,'') || ' ' ||
      coalesce(numero_processo_solar,'') || ' ' || coalesce(aluno_nome,''))
  );

-- ---------------------------------------------------------------------
-- tarefas — caixa de entrada (tarefas do usuário) e árvore de subtarefas.
-- ---------------------------------------------------------------------
create index if not exists idx_tarefas_demanda   on gestao.tarefas(demanda_id);
create index if not exists idx_tarefas_parent     on gestao.tarefas(parent_id);
create index if not exists idx_tarefas_unidade    on gestao.tarefas(unidade_responsavel_id) where ativo;
create index if not exists idx_tarefas_resp_situacao
  on gestao.tarefas(responsavel_id, situacao) where ativo;

-- ---------------------------------------------------------------------
-- movimentacoes — timeline cronológica e apontamentos de retificação.
-- ---------------------------------------------------------------------
create index if not exists idx_mov_demanda_data
  on gestao.movimentacoes(demanda_id, criado_em);
create index if not exists idx_mov_tarefa_data
  on gestao.movimentacoes(tarefa_id, criado_em) where tarefa_id is not null;
create index if not exists idx_mov_autor        on gestao.movimentacoes(autor_id);
create index if not exists idx_mov_retificada
  on gestao.movimentacoes(movimentacao_retificada_id)
  where movimentacao_retificada_id is not null;
create index if not exists idx_mov_ressalvada
  on gestao.movimentacoes(movimentacao_ressalvada_id)
  where movimentacao_ressalvada_id is not null;

-- ---------------------------------------------------------------------
-- comentarios / pessoas_envolvidas / participantes.
-- ---------------------------------------------------------------------
create index if not exists idx_comentarios_demanda on gestao.comentarios(demanda_id);
create index if not exists idx_comentarios_tarefa
  on gestao.comentarios(tarefa_id) where tarefa_id is not null;
create index if not exists idx_pessoas_demanda   on gestao.pessoas_envolvidas(demanda_id);
-- "Demandas em que participo" (acesso por link direto, RLS).
create index if not exists idx_participantes_usuario
  on gestao.participantes(usuario_id) where ativo;
create index if not exists idx_participantes_demanda
  on gestao.participantes(demanda_id) where ativo;

-- ---------------------------------------------------------------------
-- anexos — listagem por demanda/tarefa/devolutiva.
-- ---------------------------------------------------------------------
create index if not exists idx_anexos_demanda on gestao.anexos(demanda_id) where demanda_id is not null;
create index if not exists idx_anexos_tarefa  on gestao.anexos(tarefa_id) where tarefa_id is not null;
create index if not exists idx_anexos_mov     on gestao.anexos(movimentacao_id) where movimentacao_id is not null;

-- ---------------------------------------------------------------------
-- notificacoes — badge de não lidas por usuário.
-- ---------------------------------------------------------------------
create index if not exists idx_notif_usuario_nao_lida
  on gestao.notificacoes(usuario_id, criado_em) where not lida;

-- ---------------------------------------------------------------------
-- auditoria — consulta por entidade (inclui inativação de anexo) e por
-- usuário; usada também no rastreio de acesso a demandas restritas.
-- ---------------------------------------------------------------------
create index if not exists idx_auditoria_entidade
  on gestao.auditoria(entidade, entidade_id, acao);
create index if not exists idx_auditoria_usuario  on gestao.auditoria(usuario_id, criado_em);

-- ---------------------------------------------------------------------
-- relatorios_emitidos — histórico por demanda (código já é unique).
-- ---------------------------------------------------------------------
create index if not exists idx_relatorios_demanda on gestao.relatorios_emitidos(demanda_id);
