-- =====================================================================
-- 002_tabelas.sql
-- Tabelas do sistema (schema gestao). Modelo normalizado, sem DELETE.
-- Sistema de Gestão de Demandas — SME Ribeirão Preto
--
-- Convenções:
--  - PKs em uuid (gen_random_uuid); nomes em português.
--  - timestamptz em todos os instantes; exibição/cálculo em SP.
--  - Enums modelados como CHECK (text) para facilitar evolução.
--  - Tabelas imutáveis (movimentacoes, comentarios, anexos, auditoria,
--    relatorios_emitidos) são append-only: sem coluna `ativo`, sem
--    colunas de atualização. A imutabilidade é reforçada por trigger
--    em 006. Inativação de anexo é registrada em `auditoria`.
--  - Escrita só por funções SECURITY DEFINER (007). O front-end recebe
--    apenas SELECT (grants em 005); nunca INSERT/UPDATE/DELETE direto.
-- =====================================================================

set search_path = gestao, extensions, public;

-- ---------------------------------------------------------------------
-- perfis — hierarquia de cargos. `nivel` ordena "gerente ou superior";
-- `escopo_global` marca quem enxerga toda a Secretaria (gabinete, ti).
-- ---------------------------------------------------------------------
create table if not exists gestao.perfis (
  codigo         text primary key,
  nome           text not null,
  nivel          smallint not null,
  escopo_global  boolean not null default false,
  pode_administrar boolean not null default false
);

-- ---------------------------------------------------------------------
-- unidades_organizacionais — organograma em árvore (parent_id self).
-- ---------------------------------------------------------------------
create table if not exists gestao.unidades_organizacionais (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid references gestao.unidades_organizacionais(id),
  tipo        text not null
                check (tipo in ('gabinete','subsecretaria','gerencia','secao')),
  nome        text not null,
  sigla       text,
  ativo       boolean not null default true,
  inativado_em  timestamptz,
  inativado_por uuid,
  motivo_inativacao text,
  criado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint chk_unidade_inativa check (ativo or motivo_inativacao is not null)
);

-- ---------------------------------------------------------------------
-- usuarios — 1:1 com auth.users. E-mail restrito ao domínio oficial.
-- ---------------------------------------------------------------------
create table if not exists gestao.usuarios (
  id          uuid primary key references auth.users(id),
  nome        text not null,
  email       text not null unique,
  perfil      text not null references gestao.perfis(codigo),
  unidade_id  uuid not null references gestao.unidades_organizacionais(id),
  ativo       boolean not null default true,
  inativado_em  timestamptz,
  inativado_por uuid references gestao.usuarios(id),
  motivo_inativacao text,
  criado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint chk_email_dominio
    check (email = lower(email) and email like '%@educacao.pmrp.sp.gov.br'),
  constraint chk_usuario_inativo check (ativo or motivo_inativacao is not null)
);

-- ---------------------------------------------------------------------
-- Tabelas de apoio.
-- ---------------------------------------------------------------------
create table if not exists gestao.tipos_demanda (
  id        uuid primary key default gen_random_uuid(),
  nome      text not null,
  descricao text,
  ativo     boolean not null default true
);

create table if not exists gestao.escolas (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  codigo_inep text,
  ativo       boolean not null default true
);

-- feriados — dias não úteis para cálculo de prazo (seção 8 CLAUDE.md).
create table if not exists gestao.feriados (
  data      date primary key,
  descricao text not null,
  tipo      text not null default 'nacional'
              check (tipo in ('nacional','estadual','municipal')),
  ativo     boolean not null default true
);

-- ---------------------------------------------------------------------
-- demandas — entidade central. `numero` gerado por trigger (006).
-- `unidade_responsavel_id` é denormalização mantida pelas funções,
-- usada nas policies de escopo e nos índices de caixa/dashboard.
-- ---------------------------------------------------------------------
create table if not exists gestao.demandas (
  id            uuid primary key default gen_random_uuid(),
  numero        text not null unique,
  titulo        text not null,
  descricao     text,
  objeto_queixa text not null,
  tipo_id       uuid references gestao.tipos_demanda(id),
  categoria     text,
  setor         text,
  prioridade    text not null default 'normal'
                  check (prioridade in ('baixa','normal','alta','urgente')),
  situacao      text not null default 'aberta'
                  check (situacao in ('aberta','em_andamento',
                    'aguardando_complementacao','devolvida','concluida',
                    'reaberta','inativa')),
  situacao_anterior text,
  prazo         date,
  prazo_suspenso_em timestamptz,
  prazo_retomado_em timestamptz,
  data_conclusao timestamptz,
  conclusao     text,
  solicitante_id uuid not null references gestao.usuarios(id),
  responsavel_atual_id uuid not null references gestao.usuarios(id),
  unidade_responsavel_id uuid not null references gestao.unidades_organizacionais(id),
  escola_id     uuid references gestao.escolas(id),
  aluno_nome    text,
  numero_processo_solar text,
  sigilo        text not null default 'normal'
                  check (sigilo in ('normal','restrito')),
  ativo         boolean not null default true,
  inativado_em  timestamptz,
  inativado_por uuid references gestao.usuarios(id),
  motivo_inativacao text,
  criado_por    uuid not null references gestao.usuarios(id),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint chk_demanda_inativa check (ativo or motivo_inativacao is not null),
  constraint chk_demanda_conclusao
    check (situacao <> 'concluida' or conclusao is not null)
);

-- ---------------------------------------------------------------------
-- tarefas — tramitação e subtarefas ilimitadas (parent_id self).
-- ---------------------------------------------------------------------
create table if not exists gestao.tarefas (
  id            uuid primary key default gen_random_uuid(),
  demanda_id    uuid not null references gestao.demandas(id),
  parent_id     uuid references gestao.tarefas(id),
  titulo        text not null,
  descricao     text,
  responsavel_id uuid not null references gestao.usuarios(id),
  unidade_responsavel_id uuid not null references gestao.unidades_organizacionais(id),
  situacao      text not null default 'aberta'
                  check (situacao in ('aberta','em_andamento',
                    'aguardando_complementacao','devolvida','concluida',
                    'reaberta','inativa')),
  situacao_anterior text,
  prioridade    text not null default 'normal'
                  check (prioridade in ('baixa','normal','alta','urgente')),
  prazo         date,
  prazo_suspenso_em timestamptz,
  prazo_retomado_em timestamptz,
  data_conclusao timestamptz,
  conclusao     text,
  ativo         boolean not null default true,
  inativado_em  timestamptz,
  inativado_por uuid references gestao.usuarios(id),
  motivo_inativacao text,
  criado_por    uuid not null references gestao.usuarios(id),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint chk_tarefa_inativa check (ativo or motivo_inativacao is not null),
  constraint chk_tarefa_conclusao
    check (situacao <> 'concluida' or conclusao is not null)
);

-- ---------------------------------------------------------------------
-- participantes — quem participa da tramitação (base para RLS de acesso
-- "por link direto"). Mutável via função; remoção = ativo=false.
-- ---------------------------------------------------------------------
create table if not exists gestao.participantes (
  id          uuid primary key default gen_random_uuid(),
  demanda_id  uuid not null references gestao.demandas(id),
  usuario_id  uuid not null references gestao.usuarios(id),
  papel       text not null default 'participante'
                check (papel in ('solicitante','responsavel','participante')),
  ativo       boolean not null default true,
  adicionado_por uuid not null references gestao.usuarios(id),
  criado_em   timestamptz not null default now(),
  unique (demanda_id, usuario_id)
);

-- ---------------------------------------------------------------------
-- pessoas_envolvidas — nome, vínculo e observação (seção 6).
-- ---------------------------------------------------------------------
create table if not exists gestao.pessoas_envolvidas (
  id          uuid primary key default gen_random_uuid(),
  demanda_id  uuid not null references gestao.demandas(id),
  nome        text not null,
  vinculo     text not null
                check (vinculo in ('aluno','responsavel','servidor','outro')),
  observacao  text,
  ativo       boolean not null default true,
  criado_por  uuid not null references gestao.usuarios(id),
  criado_em   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- movimentacoes — IMUTÁVEL, append-only. Toda ação vira uma linha aqui.
-- Retificação/ressalva são novas linhas apontando para a original; o
-- "marcado como retificado" é derivado (existe linha que o retifica),
-- não uma coluna atualizada.
-- ---------------------------------------------------------------------
create table if not exists gestao.movimentacoes (
  id            uuid primary key default gen_random_uuid(),
  demanda_id    uuid not null references gestao.demandas(id),
  tarefa_id     uuid references gestao.tarefas(id),
  autor_id      uuid not null references gestao.usuarios(id),
  tipo          text not null
                  check (tipo in ('criacao','encaminhamento','subtarefa',
                    'devolutiva','despacho','comentario','alteracao_situacao',
                    'solicitacao_complementacao','conclusao','reabertura',
                    'edicao','retificacao','ressalva','inativacao',
                    'reativacao','emissao_relatorio')),
  texto         text,
  situacao_anterior text,
  situacao_nova text,
  destinatario_id uuid references gestao.usuarios(id),
  prioridade    text check (prioridade in ('baixa','normal','alta','urgente')),
  prazo         date,
  movimentacao_retificada_id uuid references gestao.movimentacoes(id),
  movimentacao_ressalvada_id uuid references gestao.movimentacoes(id),
  criado_em     timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- comentarios — IMUTÁVEL, append-only.
-- ---------------------------------------------------------------------
create table if not exists gestao.comentarios (
  id          uuid primary key default gen_random_uuid(),
  demanda_id  uuid not null references gestao.demandas(id),
  tarefa_id   uuid references gestao.tarefas(id),
  autor_id    uuid not null references gestao.usuarios(id),
  texto       text not null,
  criado_em   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- anexos — IMUTÁVEL, append-only. Vinculado à demanda e/ou à devolutiva
-- (movimentacao). Nome original preservado; nome_storage normalizado.
-- Inativação NÃO altera esta linha: é registrada em `auditoria`.
-- ---------------------------------------------------------------------
create table if not exists gestao.anexos (
  id            uuid primary key default gen_random_uuid(),
  demanda_id    uuid references gestao.demandas(id),
  tarefa_id     uuid references gestao.tarefas(id),
  movimentacao_id uuid references gestao.movimentacoes(id),
  nome_original text not null,
  nome_storage  text not null,
  mime          text,
  tamanho_bytes bigint check (tamanho_bytes is null or tamanho_bytes <= 20971520),
  hash_sha256   text,
  storage_path  text,
  link_externo  text,
  anexado_por   uuid not null references gestao.usuarios(id),
  criado_em     timestamptz not null default now(),
  constraint chk_anexo_origem
    check (demanda_id is not null or tarefa_id is not null),
  constraint chk_anexo_conteudo
    check (storage_path is not null or link_externo is not null)
);

-- ---------------------------------------------------------------------
-- notificacoes — mutável (marcação de leitura via função).
-- ---------------------------------------------------------------------
create table if not exists gestao.notificacoes (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null references gestao.usuarios(id),
  demanda_id  uuid references gestao.demandas(id),
  tarefa_id   uuid references gestao.tarefas(id),
  tipo        text not null,
  titulo      text not null,
  mensagem    text,
  lida        boolean not null default false,
  lida_em     timestamptz,
  criado_em   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- auditoria — IMUTÁVEL, append-only. Registra também inativação de
-- anexos e toda visualização de demanda `restrito` (seção 20 LGPD).
-- ---------------------------------------------------------------------
create table if not exists gestao.auditoria (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid references gestao.usuarios(id),
  acao        text not null,
  entidade    text not null,
  entidade_id uuid,
  dados_anteriores jsonb,
  dados_novos jsonb,
  ip          inet,
  criado_em   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- relatorios_emitidos — IMUTÁVEL, append-only. Cada emissão gera hash e
-- código de verificação únicos (seção 14).
-- ---------------------------------------------------------------------
create table if not exists gestao.relatorios_emitidos (
  id          uuid primary key default gen_random_uuid(),
  demanda_id  uuid not null references gestao.demandas(id),
  tipo        text not null check (tipo in ('resumo','inteiro_teor')),
  anonimizado boolean not null default false,
  hash_sha256 text not null,
  codigo_verificacao text not null unique,
  caminho_storage text,
  emitido_por uuid not null references gestao.usuarios(id),
  criado_em   timestamptz not null default now()
);
