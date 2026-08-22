-- =====================================================================
-- 047_pessoas_envolvidas_escrita.sql
-- Passo 4 de docs/ESPEC-TIPOS.md: corrigir pessoas envolvidas depois da
-- criação.
--
-- Até aqui elas só entravam por fn_criar_demanda. Nome digitado errado,
-- vínculo trocado ou pessoa que só apareceu depois não tinham conserto —
-- e o dado alimenta o relatório que vai ao processo administrativo.
--
-- Quem pode: apenas quem está em `participantes` (solicitante,
-- responsável atual e participantes). Decisão do usuário em 2026-08-22:
-- quem tem só tarefa NÃO edita, e fn_pode_ver_demanda não serve de
-- critério porque inclui chefia no escopo — enxergar a demanda não
-- deveria dar direito de escrever dado pessoal de terceiro
-- (LGPD, ESPEC.md §20).
--
-- Sistema de Gestão de Demandas — SME Ribeirão Preto
-- =====================================================================

set search_path = gestao, extensions, public;

-- ---------------------------------------------------------------------
-- 1. Colunas de inativação (regra 1: inativar com motivo, nunca apagar)
-- ---------------------------------------------------------------------
-- A tabela tinha `ativo` mas não onde registrar o porquê nem por quem —
-- mesma lacuna encontrada em tipos_demanda no sql/046. Espelha o padrão
-- de `demandas`.
alter table gestao.pessoas_envolvidas
  add column if not exists inativado_em timestamptz,
  add column if not exists inativado_por uuid references gestao.usuarios(id),
  add column if not exists motivo_inativacao text;

alter table gestao.pessoas_envolvidas
  drop constraint if exists chk_pessoa_inativa;
alter table gestao.pessoas_envolvidas
  add constraint chk_pessoa_inativa check (ativo or motivo_inativacao is not null);

-- ---------------------------------------------------------------------
-- 2. Quem faz parte do processo
-- ---------------------------------------------------------------------
-- Só `participantes`. A recursão de escopo e a posse de tarefa ficam de
-- fora de propósito — ver o cabeçalho.
create or replace function gestao.fn_e_participante(
  p_demanda_id uuid, p_usuario_id uuid)
returns boolean
language sql stable
set search_path = gestao, pg_temp
as $$
  select exists (
    select 1 from gestao.participantes pa
     where pa.demanda_id = p_demanda_id
       and pa.usuario_id = p_usuario_id
       and pa.ativo);
$$;

grant execute on function gestao.fn_e_participante(uuid, uuid) to authenticated;

-- Guarda comum das três funções abaixo: exige participação e devolve a
-- demanda, já garantindo que ela existe e está ativa.
create or replace function gestao.fn_exigir_participante(p_demanda_id uuid)
returns gestao.demandas
language plpgsql stable
set search_path = gestao, pg_temp
as $$
declare
  d gestao.demandas%rowtype;
begin
  select * into d from gestao.demandas where id = p_demanda_id and ativo;
  if not found then
    raise exception 'Demanda inexistente ou inativa.' using errcode = 'check_violation';
  end if;
  if not gestao.fn_e_participante(p_demanda_id, gestao.fn_usuario_corrente()) then
    raise exception 'Apenas quem participa desta demanda pode alterar as pessoas envolvidas.'
      using errcode = 'insufficient_privilege';
  end if;
  return d;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Acrescentar
-- ---------------------------------------------------------------------
create or replace function gestao.fn_pessoa_envolvida_adicionar(
  p_demanda_id uuid,
  p_nome text,
  p_vinculo text,
  p_observacao text default null,
  p_justificativa text default null)
returns uuid
language plpgsql security definer
set search_path = gestao, pg_temp
as $$
declare
  v_autor uuid := gestao.fn_usuario_corrente();
  v_pessoa uuid;
begin
  perform gestao.fn_exigir_participante(p_demanda_id);
  perform gestao.fn_exige_justificativa(p_justificativa);

  if p_nome is null or btrim(p_nome) = '' then
    raise exception 'Nome é obrigatório.' using errcode = 'check_violation';
  end if;
  -- O CHECK da tabela já barra, mas a mensagem dele não ajuda quem lê.
  if p_vinculo not in ('aluno', 'responsavel', 'servidor', 'outro') then
    raise exception 'Vínculo inválido: use aluno, responsavel, servidor ou outro.'
      using errcode = 'check_violation';
  end if;

  insert into gestao.pessoas_envolvidas(
    demanda_id, nome, vinculo, observacao, criado_por)
  values (p_demanda_id, btrim(p_nome), p_vinculo,
          nullif(btrim(coalesce(p_observacao, '')), ''), v_autor)
  returning id into v_pessoa;

  -- Vai à timeline: é conteúdo do registro que alimenta o relatório, não
  -- detalhe interno. O nome fica no texto para o histórico ficar legível.
  perform gestao.fn_registrar_movimentacao(
    p_demanda_id, null, v_autor, 'edicao',
    format('Pessoa envolvida acrescentada: %s (%s). Justificativa: %s',
           btrim(p_nome), p_vinculo, p_justificativa));

  return v_pessoa;
end;
$$;

grant execute on function gestao.fn_pessoa_envolvida_adicionar(uuid, text, text, text, text)
  to authenticated;

-- ---------------------------------------------------------------------
-- 4. Corrigir
-- ---------------------------------------------------------------------
-- Só os campos informados mudam; null significa "não mexer". Para
-- esvaziar a observação, mande string vazia.
create or replace function gestao.fn_pessoa_envolvida_editar(
  p_pessoa_id uuid,
  p_nome text default null,
  p_vinculo text default null,
  p_observacao text default null,
  p_justificativa text default null)
returns void
language plpgsql security definer
set search_path = gestao, pg_temp
as $$
declare
  v_autor uuid := gestao.fn_usuario_corrente();
  p gestao.pessoas_envolvidas%rowtype;
begin
  select * into p from gestao.pessoas_envolvidas where id = p_pessoa_id and ativo;
  if not found then
    raise exception 'Pessoa envolvida inexistente ou já inativada.'
      using errcode = 'check_violation';
  end if;
  perform gestao.fn_exigir_participante(p.demanda_id);
  perform gestao.fn_exige_justificativa(p_justificativa);

  if p_nome is not null and btrim(p_nome) = '' then
    raise exception 'Nome não pode ficar vazio.' using errcode = 'check_violation';
  end if;
  if p_vinculo is not null
     and p_vinculo not in ('aluno', 'responsavel', 'servidor', 'outro') then
    raise exception 'Vínculo inválido: use aluno, responsavel, servidor ou outro.'
      using errcode = 'check_violation';
  end if;

  update gestao.pessoas_envolvidas set
    nome       = coalesce(btrim(p_nome), nome),
    vinculo    = coalesce(p_vinculo, vinculo),
    observacao = case when p_observacao is null then observacao
                      else nullif(btrim(p_observacao), '') end
   where id = p_pessoa_id;

  perform gestao.fn_registrar_movimentacao(
    p.demanda_id, null, v_autor, 'edicao',
    format('Pessoa envolvida corrigida: %s. Justificativa: %s',
           p.nome, p_justificativa));
end;
$$;

grant execute on function gestao.fn_pessoa_envolvida_editar(uuid, text, text, text, text)
  to authenticated;

-- ---------------------------------------------------------------------
-- 5. Inativar (nunca apagar — regra 1)
-- ---------------------------------------------------------------------
create or replace function gestao.fn_pessoa_envolvida_inativar(
  p_pessoa_id uuid,
  p_motivo text)
returns void
language plpgsql security definer
set search_path = gestao, pg_temp
as $$
declare
  v_autor uuid := gestao.fn_usuario_corrente();
  p gestao.pessoas_envolvidas%rowtype;
begin
  select * into p from gestao.pessoas_envolvidas where id = p_pessoa_id and ativo;
  if not found then
    raise exception 'Pessoa envolvida inexistente ou já inativada.'
      using errcode = 'check_violation';
  end if;
  perform gestao.fn_exigir_participante(p.demanda_id);
  perform gestao.fn_exige_justificativa(p_motivo);

  update gestao.pessoas_envolvidas
     set ativo = false,
         inativado_em = now(),
         inativado_por = v_autor,
         motivo_inativacao = p_motivo
   where id = p_pessoa_id;

  perform gestao.fn_registrar_movimentacao(
    p.demanda_id, null, v_autor, 'edicao',
    format('Pessoa envolvida removida: %s. Motivo: %s', p.nome, p_motivo));
end;
$$;

grant execute on function gestao.fn_pessoa_envolvida_inativar(uuid, text) to authenticated;
