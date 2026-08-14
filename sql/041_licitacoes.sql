-- =====================================================================
-- 041_licitacoes.sql
-- Módulo de Licitações (fase 1 — compras): tabelas, RLS, RPCs e seeds.
-- Sistema de Gestão de Demandas — SME Ribeirão Preto
--
-- Espec: docs/ESPEC-LICITACOES.md. Segue as regras invioláveis:
--  - sem DELETE (inativação com motivo); lic_movimentacoes é imutável;
--  - toda escrita por função SECURITY DEFINER; front só SELECT (RLS);
--  - visibilidade B+C: gerente+ vê tudo; equipe de licitações vê tudo;
--    a unidade solicitante vê os seus (lotação direta — inclui agente —
--    ou chefia com a unidade no escopo, via fn_unidades_no_escopo);
--  - edição/andamento só pela equipe de licitações (marcação por unidade,
--    nunca por cargo ou sigla fixa no código).
-- =====================================================================

set search_path = gestao, extensions, public;

-- =====================================================================
-- 1) TABELAS
-- =====================================================================

-- Catálogo ordenado de fases da esteira. `desvio` marca estados fora da
-- sequência (Suspenso, Compra Direta). `prazo_alerta_dias`: processo sem
-- andamento há mais dias que isso acende o alerta de "parado" na fase.
create table if not exists gestao.lic_fases (
  id        uuid primary key default gen_random_uuid(),
  ordem     smallint not null,
  nome      text not null unique,
  desvio    boolean not null default false,
  prazo_alerta_dias smallint not null default 10 check (prazo_alerta_dias > 0),
  ativo     boolean not null default true
);

-- Locais de tramitação. Separado de unidades_organizacionais porque o
-- processo circula por setores de outras secretarias (ADM, FAZ, PGM).
create table if not exists gestao.lic_locais (
  id        uuid primary key default gen_random_uuid(),
  sigla     text not null unique,
  nome      text,
  ativo     boolean not null default true
);

-- Processo de compra. `numero` gerado por trigger (LIC-AAAA-NNNN).
-- Números externos todos opcionais: nascem em momentos diferentes.
-- Economia NÃO é coluna: calculada (requisicao − arrematado) na exibição.
create table if not exists gestao.lic_processos (
  id            uuid primary key default gen_random_uuid(),
  numero        text not null unique,
  objeto        text not null,
  categoria     text not null
                  check (categoria in ('almox_sede','nutricao','servicos_obras')),
  prioridade    text not null default '3_normal'
                  check (prioridade in ('1_secretario','2_alta','3_normal')),
  numero_requisicao      text,
  numero_processo_compra text,
  numero_pregao          text,
  numero_processo_solar  text,
  fase_id       uuid not null references gestao.lic_fases(id),
  local_id      uuid references gestao.lic_locais(id),
  data_pregao   date,
  valor_requisicao        numeric(14,2),
  valor_arrematado        numeric(14,2),
  valor_frustrado_deserto numeric(14,2),
  unidade_solicitante_id uuid not null references gestao.unidades_organizacionais(id),
  demanda_id    uuid references gestao.demandas(id),
  ativo         boolean not null default true,
  inativado_em  timestamptz,
  inativado_por uuid references gestao.usuarios(id),
  motivo_inativacao text,
  criado_por    uuid not null references gestao.usuarios(id),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint chk_lic_processo_inativo check (ativo or motivo_inativacao is not null)
);

-- Histórico do processo — IMUTÁVEL, append-only (o diário da planilha).
-- clock_timestamp() como em movimentacoes: ordem estável na mesma transação.
create table if not exists gestao.lic_movimentacoes (
  id            uuid primary key default gen_random_uuid(),
  processo_id   uuid not null references gestao.lic_processos(id),
  autor_id      uuid not null references gestao.usuarios(id),
  tipo          text not null
                  check (tipo in ('criacao','andamento','mudanca_fase',
                    'mudanca_local','agendamento_pregao','edicao',
                    'retificacao','ressalva','inativacao','reativacao')),
  texto         text,
  fase_anterior_id  uuid references gestao.lic_fases(id),
  fase_nova_id      uuid references gestao.lic_fases(id),
  local_anterior_id uuid references gestao.lic_locais(id),
  local_novo_id     uuid references gestao.lic_locais(id),
  data_pregao   date,
  movimentacao_retificada_id uuid references gestao.lic_movimentacoes(id),
  movimentacao_ressalvada_id uuid references gestao.lic_movimentacoes(id),
  criado_em     timestamptz not null default clock_timestamp()
);

-- Marcação da equipe de licitações no organograma (regra 5: por unidade,
-- nunca por cargo nem sigla fixa). Lotados na unidade marcada ou em
-- descendentes editam os processos. Ajuste via fn_lic_definir_equipe.
alter table gestao.unidades_organizacionais
  add column if not exists equipe_licitacoes boolean not null default false;

-- =====================================================================
-- 2) ÍNDICES
-- =====================================================================
create index if not exists idx_lic_processos_fase
  on gestao.lic_processos(fase_id) where ativo;
create index if not exists idx_lic_processos_categoria
  on gestao.lic_processos(categoria) where ativo;
create index if not exists idx_lic_processos_unidade
  on gestao.lic_processos(unidade_solicitante_id) where ativo;
create index if not exists idx_lic_processos_solar
  on gestao.lic_processos(numero_processo_solar)
  where numero_processo_solar is not null;
-- Timeline e "último andamento" (alerta de parado).
create index if not exists idx_lic_mov_processo
  on gestao.lic_movimentacoes(processo_id, criado_em desc);

-- =====================================================================
-- 3) TRIGGERS — número, imutabilidade, touch, auditoria (reuso do 006).
-- =====================================================================
create or replace function gestao.fn_gerar_numero_licitacao()
returns trigger
language plpgsql
as $$
declare
  v_ano  int := extract(year from (now() at time zone 'America/Sao_Paulo'))::int;
  v_seq  text := format('gestao.seq_licitacao_%s', v_ano);
  v_next bigint;
begin
  execute format('create sequence if not exists %s', v_seq);
  execute format('select nextval(%L)', v_seq) into v_next;
  new.numero := format('LIC-%s-%s', v_ano, lpad(v_next::text, 4, '0'));
  return new;
end;
$$;

drop trigger if exists trg_numero_licitacao on gestao.lic_processos;
create trigger trg_numero_licitacao
  before insert on gestao.lic_processos
  for each row execute function gestao.fn_gerar_numero_licitacao();

drop trigger if exists trg_imutavel on gestao.lic_movimentacoes;
create trigger trg_imutavel
  before update or delete on gestao.lic_movimentacoes
  for each row execute function gestao.fn_impedir_alteracao();

drop trigger if exists trg_touch on gestao.lic_processos;
create trigger trg_touch
  before update on gestao.lic_processos
  for each row execute function gestao.fn_touch_atualizado();

drop trigger if exists trg_auditar on gestao.lic_processos;
create trigger trg_auditar
  after insert or update on gestao.lic_processos
  for each row execute function gestao.fn_auditar_alteracao();

-- =====================================================================
-- 4) HELPERS DE PERMISSÃO (STABLE SECURITY DEFINER, como no 005)
-- =====================================================================

-- Lotado na(s) unidade(s) marcada(s) como equipe de licitações ou em
-- qualquer descendente delas.
create or replace function gestao.fn_lic_e_equipe(p_usuario_id uuid)
returns boolean
language plpgsql stable security definer
set search_path = gestao, pg_temp
as $$
declare
  v_unidade uuid;
begin
  select unidade_id into v_unidade
    from gestao.usuarios where id = p_usuario_id and ativo;
  if v_unidade is null then
    return false;
  end if;

  return exists (
    with recursive sub as (
      select u.id from gestao.unidades_organizacionais u
       where u.equipe_licitacoes and u.ativo
      union all
      select f.id from gestao.unidades_organizacionais f
        join sub on f.parent_id = sub.id
       where f.ativo
    )
    select 1 from sub where sub.id = v_unidade
  );
end;
$$;

-- Visibilidade B+C (docs/ESPEC-LICITACOES.md).
create or replace function gestao.fn_lic_pode_ver(
  p_processo_id uuid, p_usuario_id uuid)
returns boolean
language plpgsql stable security definer
set search_path = gestao, pg_temp
as $$
declare
  v_unidade_solic uuid;
  v_unidade_usr   uuid;
  v_nivel_gerente smallint;
begin
  select unidade_solicitante_id into v_unidade_solic
    from gestao.lic_processos where id = p_processo_id;
  if v_unidade_solic is null then
    return false;
  end if;

  -- (B) gerente ou acima, ou escopo global.
  select nivel into v_nivel_gerente from gestao.perfis where codigo = 'gerente';
  if gestao.fn_escopo_global(p_usuario_id)
     or gestao.fn_nivel(p_usuario_id) >= v_nivel_gerente then
    return true;
  end if;

  -- (C1) equipe de licitações, qualquer nível.
  if gestao.fn_lic_e_equipe(p_usuario_id) then
    return true;
  end if;

  -- (C2) lotação direta na unidade solicitante (inclui agente).
  select unidade_id into v_unidade_usr
    from gestao.usuarios where id = p_usuario_id and ativo;
  if v_unidade_usr = v_unidade_solic then
    return true;
  end if;

  -- (C3) chefia com a unidade solicitante no escopo.
  return v_unidade_solic in (select gestao.fn_unidades_no_escopo(p_usuario_id));
end;
$$;

grant execute on function gestao.fn_lic_e_equipe(uuid)        to authenticated;
grant execute on function gestao.fn_lic_pode_ver(uuid, uuid)  to authenticated;

-- =====================================================================
-- 5) RLS — front só SELECT; escrita apenas pelas RPCs abaixo.
-- =====================================================================
alter table gestao.lic_fases         enable row level security;
alter table gestao.lic_locais        enable row level security;
alter table gestao.lic_processos     enable row level security;
alter table gestao.lic_movimentacoes enable row level security;

grant select on gestao.lic_fases, gestao.lic_locais,
                gestao.lic_processos, gestao.lic_movimentacoes
  to authenticated;

drop policy if exists pol_sel_lic_fases on gestao.lic_fases;
create policy pol_sel_lic_fases on gestao.lic_fases
  for select to authenticated using (true);

drop policy if exists pol_sel_lic_locais on gestao.lic_locais;
create policy pol_sel_lic_locais on gestao.lic_locais
  for select to authenticated using (true);

drop policy if exists pol_sel_lic_processos on gestao.lic_processos;
create policy pol_sel_lic_processos on gestao.lic_processos
  for select to authenticated
  using (gestao.fn_lic_pode_ver(id, auth.uid()));

drop policy if exists pol_sel_lic_mov on gestao.lic_movimentacoes;
create policy pol_sel_lic_mov on gestao.lic_movimentacoes
  for select to authenticated
  using (gestao.fn_lic_pode_ver(processo_id, auth.uid()));

-- =====================================================================
-- 6) FUNÇÕES INTERNAS (sem grant)
-- =====================================================================
create or replace function gestao.fn_lic_registrar_movimentacao(
  p_processo uuid, p_autor uuid, p_tipo text, p_texto text,
  p_fase_ant uuid default null, p_fase_nova uuid default null,
  p_local_ant uuid default null, p_local_novo uuid default null,
  p_data_pregao date default null,
  p_retificada uuid default null, p_ressalvada uuid default null)
returns uuid
language plpgsql security definer
set search_path = gestao, pg_temp
as $$
declare
  v_id uuid;
begin
  insert into gestao.lic_movimentacoes(
    processo_id, autor_id, tipo, texto,
    fase_anterior_id, fase_nova_id, local_anterior_id, local_novo_id,
    data_pregao, movimentacao_retificada_id, movimentacao_ressalvada_id)
  values (p_processo, p_autor, p_tipo, p_texto,
    p_fase_ant, p_fase_nova, p_local_ant, p_local_novo,
    p_data_pregao, p_retificada, p_ressalvada)
  returning id into v_id;
  return v_id;
end;
$$;

-- Exige que o usuário corrente seja da equipe de licitações e devolve o
-- processo, travando a linha (FOR UPDATE) para a transação.
create or replace function gestao.fn_lic_exigir_equipe(p_processo_id uuid)
returns gestao.lic_processos
language plpgsql security definer
set search_path = gestao, pg_temp
as $$
declare
  v_autor uuid := gestao.fn_usuario_corrente();
  p gestao.lic_processos%rowtype;
begin
  if not gestao.fn_lic_e_equipe(v_autor) then
    raise exception 'Apenas a equipe de licitações pode registrar nesta tela.'
      using errcode = 'insufficient_privilege';
  end if;
  select * into p from gestao.lic_processos where id = p_processo_id for update;
  if not found then
    raise exception 'Processo inexistente.' using errcode = 'check_violation';
  end if;
  return p;
end;
$$;

-- =====================================================================
-- 7) RPCs PÚBLICAS
-- =====================================================================

-- fn_lic_criar_processo — entrada de novo pedido: gerente ou acima.
-- Fase inicial = primeira da esteira (menor ordem, não-desvio, ativa).
create or replace function gestao.fn_lic_criar_processo(
  p_objeto text,
  p_categoria text,
  p_prioridade text default '3_normal',
  p_unidade_solicitante_id uuid default null,
  p_texto text default null,
  p_numero_processo_solar text default null,
  p_demanda_id uuid default null)
returns uuid
language plpgsql security definer
set search_path = gestao, pg_temp
as $$
declare
  v_autor uuid := gestao.fn_usuario_corrente();
  v_nivel_gerente smallint;
  v_unidade uuid;
  v_fase uuid;
  v_processo uuid;
begin
  select nivel into v_nivel_gerente from gestao.perfis where codigo = 'gerente';
  if not (gestao.fn_escopo_global(v_autor)
          or gestao.fn_nivel(v_autor) >= v_nivel_gerente) then
    raise exception 'Apenas gerente ou superior pode registrar novo pedido.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_objeto is null or btrim(p_objeto) = '' then
    raise exception 'Objeto é obrigatório.' using errcode = 'check_violation';
  end if;

  select unidade_id into v_unidade from gestao.usuarios where id = v_autor;
  if p_unidade_solicitante_id is not null
     and p_unidade_solicitante_id <> v_unidade then
    if p_unidade_solicitante_id not in
       (select gestao.fn_unidades_no_escopo(v_autor)) then
      raise exception 'Unidade solicitante fora do seu escopo.'
        using errcode = 'insufficient_privilege';
    end if;
    v_unidade := p_unidade_solicitante_id;
  end if;

  select id into v_fase from gestao.lic_fases
   where ativo and not desvio order by ordem limit 1;
  if v_fase is null then
    raise exception 'Catálogo de fases vazio.' using errcode = 'check_violation';
  end if;

  insert into gestao.lic_processos(
    objeto, categoria, prioridade, fase_id, numero_processo_solar,
    unidade_solicitante_id, demanda_id, criado_por)
  values (
    p_objeto, p_categoria, coalesce(p_prioridade,'3_normal'), v_fase,
    p_numero_processo_solar, v_unidade, p_demanda_id, v_autor)
  returning id into v_processo;

  perform gestao.fn_lic_registrar_movimentacao(
    v_processo, v_autor, 'criacao',
    coalesce(p_texto, 'Pedido registrado.'), null, v_fase);

  return v_processo;
end;
$$;

-- fn_lic_registrar_andamento — o lançamento do diário (equipe).
create or replace function gestao.fn_lic_registrar_andamento(
  p_processo_id uuid, p_texto text)
returns uuid
language plpgsql security definer
set search_path = gestao, pg_temp
as $$
declare
  p gestao.lic_processos%rowtype := gestao.fn_lic_exigir_equipe(p_processo_id);
begin
  if p_texto is null or btrim(p_texto) = '' then
    raise exception 'Texto do andamento é obrigatório.' using errcode = 'check_violation';
  end if;
  return gestao.fn_lic_registrar_movimentacao(
    p.id, gestao.fn_usuario_corrente(), 'andamento', p_texto);
end;
$$;

-- fn_lic_mudar_fase — sem validação de transição por ora (decisão do
-- usuário: regras ficam para depois); o registro é sempre feito.
create or replace function gestao.fn_lic_mudar_fase(
  p_processo_id uuid, p_fase_id uuid, p_texto text default null)
returns uuid
language plpgsql security definer
set search_path = gestao, pg_temp
as $$
declare
  p gestao.lic_processos%rowtype := gestao.fn_lic_exigir_equipe(p_processo_id);
begin
  if not exists (select 1 from gestao.lic_fases where id = p_fase_id and ativo) then
    raise exception 'Fase inexistente ou inativa.' using errcode = 'check_violation';
  end if;
  if p_fase_id = p.fase_id then
    raise exception 'O processo já está nessa fase.' using errcode = 'check_violation';
  end if;

  update gestao.lic_processos set fase_id = p_fase_id where id = p.id;

  return gestao.fn_lic_registrar_movimentacao(
    p.id, gestao.fn_usuario_corrente(), 'mudanca_fase', p_texto,
    p.fase_id, p_fase_id);
end;
$$;

-- fn_lic_mudar_local — tramitação física/digital do processo (equipe).
create or replace function gestao.fn_lic_mudar_local(
  p_processo_id uuid, p_local_id uuid, p_texto text default null)
returns uuid
language plpgsql security definer
set search_path = gestao, pg_temp
as $$
declare
  p gestao.lic_processos%rowtype := gestao.fn_lic_exigir_equipe(p_processo_id);
begin
  if not exists (select 1 from gestao.lic_locais where id = p_local_id and ativo) then
    raise exception 'Local inexistente ou inativo.' using errcode = 'check_violation';
  end if;
  if p_local_id = p.local_id then
    raise exception 'O processo já está nesse local.' using errcode = 'check_violation';
  end if;

  update gestao.lic_processos set local_id = p_local_id where id = p.id;

  return gestao.fn_lic_registrar_movimentacao(
    p.id, gestao.fn_usuario_corrente(), 'mudanca_local', p_texto,
    null, null, p.local_id, p_local_id);
end;
$$;

-- fn_lic_agendar_pregao — agenda ou reagenda a sessão (equipe).
create or replace function gestao.fn_lic_agendar_pregao(
  p_processo_id uuid, p_data date, p_texto text default null)
returns uuid
language plpgsql security definer
set search_path = gestao, pg_temp
as $$
declare
  p gestao.lic_processos%rowtype := gestao.fn_lic_exigir_equipe(p_processo_id);
begin
  if p_data is null then
    raise exception 'Data do pregão é obrigatória.' using errcode = 'check_violation';
  end if;

  update gestao.lic_processos set data_pregao = p_data where id = p.id;

  return gestao.fn_lic_registrar_movimentacao(
    p.id, gestao.fn_usuario_corrente(), 'agendamento_pregao', p_texto,
    null, null, null, null, p_data);
end;
$$;

-- fn_lic_editar — campos cadastrais e valores (equipe, com justificativa).
-- `p_campos` só aceita as chaves listadas; nenhum valor é obrigatório e
-- nada trava movimentação (decisão de 2026-08-14).
create or replace function gestao.fn_lic_editar(
  p_processo_id uuid, p_campos jsonb, p_justificativa text)
returns void
language plpgsql security definer
set search_path = gestao, pg_temp
as $$
declare
  p gestao.lic_processos%rowtype := gestao.fn_lic_exigir_equipe(p_processo_id);
  v_chave text;
  v_permitidas text[] := array[
    'objeto','categoria','prioridade','numero_requisicao',
    'numero_processo_compra','numero_pregao','numero_processo_solar',
    'valor_requisicao','valor_arrematado','valor_frustrado_deserto',
    'unidade_solicitante_id','demanda_id'];
begin
  perform gestao.fn_exige_justificativa(p_justificativa);
  if p_campos is null or p_campos = '{}'::jsonb then
    raise exception 'Nenhum campo a alterar.' using errcode = 'check_violation';
  end if;

  for v_chave in select jsonb_object_keys(p_campos) loop
    if not (v_chave = any(v_permitidas)) then
      raise exception 'Campo não editável: %', v_chave using errcode = 'check_violation';
    end if;
  end loop;

  update gestao.lic_processos set
    objeto     = coalesce(p_campos->>'objeto', objeto),
    categoria  = coalesce(p_campos->>'categoria', categoria),
    prioridade = coalesce(p_campos->>'prioridade', prioridade),
    numero_requisicao      = case when p_campos ? 'numero_requisicao'
      then nullif(p_campos->>'numero_requisicao','') else numero_requisicao end,
    numero_processo_compra = case when p_campos ? 'numero_processo_compra'
      then nullif(p_campos->>'numero_processo_compra','') else numero_processo_compra end,
    numero_pregao          = case when p_campos ? 'numero_pregao'
      then nullif(p_campos->>'numero_pregao','') else numero_pregao end,
    numero_processo_solar  = case when p_campos ? 'numero_processo_solar'
      then nullif(p_campos->>'numero_processo_solar','') else numero_processo_solar end,
    valor_requisicao        = case when p_campos ? 'valor_requisicao'
      then (nullif(p_campos->>'valor_requisicao',''))::numeric else valor_requisicao end,
    valor_arrematado        = case when p_campos ? 'valor_arrematado'
      then (nullif(p_campos->>'valor_arrematado',''))::numeric else valor_arrematado end,
    valor_frustrado_deserto = case when p_campos ? 'valor_frustrado_deserto'
      then (nullif(p_campos->>'valor_frustrado_deserto',''))::numeric else valor_frustrado_deserto end,
    unidade_solicitante_id = coalesce((p_campos->>'unidade_solicitante_id')::uuid,
      unidade_solicitante_id),
    demanda_id = case when p_campos ? 'demanda_id'
      then (nullif(p_campos->>'demanda_id',''))::uuid else demanda_id end
  where id = p.id;

  perform gestao.fn_lic_registrar_movimentacao(
    p.id, gestao.fn_usuario_corrente(), 'edicao',
    format('Campos alterados: %s. Justificativa: %s',
      (select string_agg(k, ', ') from jsonb_object_keys(p_campos) k),
      p_justificativa));
end;
$$;

-- fn_lic_inativar / fn_lic_reativar — nunca DELETE (regra 1).
create or replace function gestao.fn_lic_inativar(
  p_processo_id uuid, p_motivo text)
returns void
language plpgsql security definer
set search_path = gestao, pg_temp
as $$
declare
  p gestao.lic_processos%rowtype := gestao.fn_lic_exigir_equipe(p_processo_id);
  v_autor uuid := gestao.fn_usuario_corrente();
begin
  perform gestao.fn_exige_justificativa(p_motivo);
  if not p.ativo then
    raise exception 'Processo já inativo.' using errcode = 'check_violation';
  end if;

  update gestao.lic_processos
     set ativo = false, inativado_em = now(), inativado_por = v_autor,
         motivo_inativacao = p_motivo
   where id = p.id;

  perform gestao.fn_lic_registrar_movimentacao(
    p.id, v_autor, 'inativacao', p_motivo);
end;
$$;

create or replace function gestao.fn_lic_reativar(
  p_processo_id uuid, p_motivo text)
returns void
language plpgsql security definer
set search_path = gestao, pg_temp
as $$
declare
  p gestao.lic_processos%rowtype := gestao.fn_lic_exigir_equipe(p_processo_id);
  v_autor uuid := gestao.fn_usuario_corrente();
begin
  perform gestao.fn_exige_justificativa(p_motivo);
  if p.ativo then
    raise exception 'Processo já ativo.' using errcode = 'check_violation';
  end if;

  update gestao.lic_processos
     set ativo = true, inativado_em = null, inativado_por = null,
         motivo_inativacao = null
   where id = p.id;

  perform gestao.fn_lic_registrar_movimentacao(
    p.id, v_autor, 'reativacao', p_motivo);
end;
$$;

-- fn_lic_retificar — só o autor, e só enquanto NENHUM outro usuário tiver
-- movimentação posterior no processo (regra 6). Depois, só ressalva.
create or replace function gestao.fn_lic_retificar(
  p_movimentacao_id uuid, p_texto_correto text, p_justificativa text)
returns uuid
language plpgsql security definer
set search_path = gestao, pg_temp
as $$
declare
  v_autor uuid := gestao.fn_usuario_corrente();
  m gestao.lic_movimentacoes%rowtype;
begin
  perform gestao.fn_exige_justificativa(p_justificativa);
  if p_texto_correto is null or btrim(p_texto_correto) = '' then
    raise exception 'Texto corrigido é obrigatório.' using errcode = 'check_violation';
  end if;

  select * into m from gestao.lic_movimentacoes where id = p_movimentacao_id;
  if not found then
    raise exception 'Movimentação inexistente.' using errcode = 'check_violation';
  end if;
  if m.autor_id <> v_autor then
    raise exception 'Só o autor pode retificar a própria movimentação.'
      using errcode = 'insufficient_privilege';
  end if;
  if exists (
    select 1 from gestao.lic_movimentacoes x
     where x.processo_id = m.processo_id
       and x.criado_em > m.criado_em
       and x.autor_id <> v_autor
  ) then
    raise exception 'Janela de retificação encerrada: use ressalva.'
      using errcode = 'check_violation';
  end if;

  return gestao.fn_lic_registrar_movimentacao(
    m.processo_id, v_autor, 'retificacao',
    format('%s Justificativa: %s', p_texto_correto, p_justificativa),
    null, null, null, null, null, m.id);
end;
$$;

-- fn_lic_registrar_ressalva — qualquer membro da equipe, sempre possível.
create or replace function gestao.fn_lic_registrar_ressalva(
  p_movimentacao_id uuid, p_texto_correto text, p_justificativa text)
returns uuid
language plpgsql security definer
set search_path = gestao, pg_temp
as $$
declare
  v_autor uuid := gestao.fn_usuario_corrente();
  m gestao.lic_movimentacoes%rowtype;
begin
  perform gestao.fn_exige_justificativa(p_justificativa);
  if p_texto_correto is null or btrim(p_texto_correto) = '' then
    raise exception 'Texto da ressalva é obrigatório.' using errcode = 'check_violation';
  end if;
  if not gestao.fn_lic_e_equipe(v_autor) then
    raise exception 'Apenas a equipe de licitações pode registrar ressalva.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into m from gestao.lic_movimentacoes where id = p_movimentacao_id;
  if not found then
    raise exception 'Movimentação inexistente.' using errcode = 'check_violation';
  end if;

  return gestao.fn_lic_registrar_movimentacao(
    m.processo_id, v_autor, 'ressalva',
    format('%s Justificativa: %s', p_texto_correto, p_justificativa),
    null, null, null, null, null, null, m.id);
end;
$$;

-- =====================================================================
-- 8) RPCs DE ADMINISTRAÇÃO (pode_administrar)
-- =====================================================================
create or replace function gestao.fn_lic_definir_equipe(
  p_unidade_id uuid, p_ativa boolean)
returns void
language plpgsql security definer
set search_path = gestao, pg_temp
as $$
declare
  v_autor uuid := gestao.fn_usuario_corrente();
begin
  if not gestao.fn_pode_administrar(v_autor) then
    raise exception 'Apenas administradores.' using errcode = 'insufficient_privilege';
  end if;
  update gestao.unidades_organizacionais
     set equipe_licitacoes = p_ativa where id = p_unidade_id;
  if not found then
    raise exception 'Unidade inexistente.' using errcode = 'check_violation';
  end if;
  insert into gestao.auditoria(usuario_id, acao, entidade, entidade_id, dados_novos)
    values (v_autor, 'definir_equipe_licitacoes', 'unidades_organizacionais',
            p_unidade_id, jsonb_build_object('equipe_licitacoes', p_ativa));
end;
$$;

-- Upsert de fase (id nulo = criar). Personalização do prazo_alerta_dias
-- por fase acontece aqui.
create or replace function gestao.fn_lic_salvar_fase(
  p_nome text, p_ordem smallint,
  p_id uuid default null, p_desvio boolean default false,
  p_prazo_alerta_dias smallint default 10, p_ativo boolean default true)
returns uuid
language plpgsql security definer
set search_path = gestao, pg_temp
as $$
declare
  v_id uuid := p_id;
begin
  if not gestao.fn_pode_administrar(gestao.fn_usuario_corrente()) then
    raise exception 'Apenas administradores.' using errcode = 'insufficient_privilege';
  end if;
  if p_nome is null or btrim(p_nome) = '' then
    raise exception 'Nome da fase é obrigatório.' using errcode = 'check_violation';
  end if;

  if v_id is null then
    insert into gestao.lic_fases(nome, ordem, desvio, prazo_alerta_dias, ativo)
      values (p_nome, p_ordem, p_desvio, p_prazo_alerta_dias, p_ativo)
      returning id into v_id;
  else
    update gestao.lic_fases
       set nome = p_nome, ordem = p_ordem, desvio = p_desvio,
           prazo_alerta_dias = p_prazo_alerta_dias, ativo = p_ativo
     where id = v_id;
    if not found then
      raise exception 'Fase inexistente.' using errcode = 'check_violation';
    end if;
  end if;
  return v_id;
end;
$$;

create or replace function gestao.fn_lic_salvar_local(
  p_sigla text, p_nome text default null,
  p_id uuid default null, p_ativo boolean default true)
returns uuid
language plpgsql security definer
set search_path = gestao, pg_temp
as $$
declare
  v_id uuid := p_id;
begin
  if not gestao.fn_pode_administrar(gestao.fn_usuario_corrente()) then
    raise exception 'Apenas administradores.' using errcode = 'insufficient_privilege';
  end if;
  if p_sigla is null or btrim(p_sigla) = '' then
    raise exception 'Sigla do local é obrigatória.' using errcode = 'check_violation';
  end if;

  if v_id is null then
    insert into gestao.lic_locais(sigla, nome, ativo)
      values (p_sigla, p_nome, p_ativo)
      returning id into v_id;
  else
    update gestao.lic_locais
       set sigla = p_sigla, nome = p_nome, ativo = p_ativo
     where id = v_id;
    if not found then
      raise exception 'Local inexistente.' using errcode = 'check_violation';
    end if;
  end if;
  return v_id;
end;
$$;

-- =====================================================================
-- 9) GRANTS DE EXECUTE
-- =====================================================================
grant execute on function gestao.fn_lic_criar_processo(text,text,text,uuid,text,text,uuid) to authenticated;
grant execute on function gestao.fn_lic_registrar_andamento(uuid,text)          to authenticated;
grant execute on function gestao.fn_lic_mudar_fase(uuid,uuid,text)              to authenticated;
grant execute on function gestao.fn_lic_mudar_local(uuid,uuid,text)             to authenticated;
grant execute on function gestao.fn_lic_agendar_pregao(uuid,date,text)          to authenticated;
grant execute on function gestao.fn_lic_editar(uuid,jsonb,text)                 to authenticated;
grant execute on function gestao.fn_lic_inativar(uuid,text)                     to authenticated;
grant execute on function gestao.fn_lic_reativar(uuid,text)                     to authenticated;
grant execute on function gestao.fn_lic_retificar(uuid,text,text)               to authenticated;
grant execute on function gestao.fn_lic_registrar_ressalva(uuid,text,text)      to authenticated;
grant execute on function gestao.fn_lic_definir_equipe(uuid,boolean)            to authenticated;
grant execute on function gestao.fn_lic_salvar_fase(text,smallint,uuid,boolean,smallint,boolean) to authenticated;
grant execute on function gestao.fn_lic_salvar_local(text,text,uuid,boolean)    to authenticated;

-- =====================================================================
-- 10) SEEDS — idempotentes (não sobrescrevem ajustes feitos via admin).
-- =====================================================================

-- Esteira deduzida da planilha (ordem espaçada p/ encaixes futuros).
insert into gestao.lic_fases (ordem, nome, desvio)
select v.ordem, v.nome, v.desvio
  from (values
    (10,  'DFD',                        false),
    (20,  'Termo de referência',        false),
    (30,  'Cotação',                    false),
    (40,  'Requisição',                 false),
    (50,  'Elaborar edital',            false),
    (60,  'Envio ao jurídico',          false),
    (70,  'Agendamento',                false),
    (80,  'Pregão agendado',            false),
    (90,  'Pregão em andamento',        false),
    (100, 'Homologado',                 false),
    (110, 'Assinatura de contrato/ata', false),
    (120, 'Liberado para empenho',      false),
    (130, 'Aguardando OS',              false),
    (140, 'Em execução',                false),
    (150, 'Contrato finalizado',        false),
    (900, 'Suspenso',                   true),
    (910, 'Compra Direta',              true)
  ) as v(ordem, nome, desvio)
where not exists (select 1 from gestao.lic_fases f where f.nome = v.nome);

-- Locais vistos nas 3 abas de compras da planilha (grafias normalizadas:
-- a migração mapeia as variantes — ex.: 'EDUC - ATAS E CONTRATOS' e
-- 'EDUC-SUBLICITACOES'). Nomes por extenso preenchíveis via admin.
insert into gestao.lic_locais (sigla)
select v.sigla
  from (values
    ('ADM-17'), ('ADM-18'), ('ADM-19'), ('ADM-20'), ('ADM-21'), ('ADM-22'),
    ('ADM-210'), ('ADM-211'), ('ADM-212'), ('ADM-213'), ('ADM-214'),
    ('ADM-222'), ('ADM-CL'), ('ADM-S.2'),
    ('EDUC-ALMOX'), ('EDUC-ATAS E CONTRATOS'), ('EDUC-COMPRAS'),
    ('EDUC-CONTRATOS'), ('EDUC-DEPT.ALIM.ESCOLAR'), ('EDUC-DISTRIB.ALIM'),
    ('EDUC-ED.AMBIENTAL'), ('EDUC-FINANÇAS'), ('EDUC-GAB'),
    ('EDUC-LICITAÇÕES'), ('EDUC-NUTRI.ESCOLAR'), ('EDUC-OBRAS'),
    ('EDUC-SUB.LICITAÇÕES'), ('FAZ-41'), ('PGM-PJ')
  ) as v(sigla)
where not exists (select 1 from gestao.lic_locais l where l.sigla = v.sigla);
