-- =====================================================================
-- 007a_funcoes_apoio.sql
-- Helpers internos das funções de negócio + cálculo de prazo (dias úteis).
-- Sistema de Gestão de Demandas — SME Ribeirão Preto
--
-- Os helpers de tramitação são SECURITY DEFINER e NÃO recebem grant de
-- execução ao front: só são chamados de dentro das funções públicas (007b/c).
-- Os helpers de prazo são STABLE e ficam disponíveis para os painéis (008+).
-- =====================================================================

set search_path = gestao, extensions, public;

-- ---------------------------------------------------------------------
-- Prazo em dias úteis (regra 8): fim de semana + feriados ativos.
-- ---------------------------------------------------------------------
create or replace function gestao.fn_e_dia_util(p_data date)
returns boolean
language sql stable
set search_path = gestao, pg_temp
as $$
  select extract(isodow from p_data) < 6            -- 1..5 = seg..sex
     and not exists (
       select 1 from gestao.feriados f
        where f.data = p_data and f.ativo);
$$;

-- Soma N dias úteis a uma data (para sugerir prazo).
create or replace function gestao.fn_adiciona_dias_uteis(p_inicio date, p_dias int)
returns date
language plpgsql stable
set search_path = gestao, pg_temp
as $$
declare
  v_data date := p_inicio;
  v_rest int  := greatest(p_dias, 0);
begin
  while v_rest > 0 loop
    v_data := v_data + 1;
    if gestao.fn_e_dia_util(v_data) then
      v_rest := v_rest - 1;
    end if;
  end loop;
  return v_data;
end;
$$;

-- Dias úteis entre início (inclusive) e fim (exclusive). Negativo se fim < início.
create or replace function gestao.fn_dias_uteis_entre(p_inicio date, p_fim date)
returns int
language sql stable
set search_path = gestao, pg_temp
as $$
  select case
    when p_fim >= p_inicio then (
      select count(*)::int
        from generate_series(p_inicio, p_fim - 1, interval '1 day') g(d)
       where gestao.fn_e_dia_util(g.d::date))
    else -1 * (
      select count(*)::int
        from generate_series(p_fim, p_inicio - 1, interval '1 day') g(d)
       where gestao.fn_e_dia_util(g.d::date))
  end;
$$;

grant execute on function gestao.fn_e_dia_util(date)            to authenticated;
grant execute on function gestao.fn_adiciona_dias_uteis(date,int) to authenticated;
grant execute on function gestao.fn_dias_uteis_entre(date,date) to authenticated;

-- ---------------------------------------------------------------------
-- Guarda de justificativa obrigatória (regra 7).
-- ---------------------------------------------------------------------
create or replace function gestao.fn_exige_justificativa(p_txt text)
returns void
language plpgsql immutable
as $$
begin
  if p_txt is null or btrim(p_txt) = '' then
    raise exception 'Justificativa é obrigatória para esta operação.'
      using errcode = 'check_violation';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Usuário corrente ativo (auth.uid); levanta erro se ausente/inativo.
-- ---------------------------------------------------------------------
create or replace function gestao.fn_usuario_corrente()
returns uuid
language plpgsql stable security definer
set search_path = gestao, pg_temp
as $$
declare
  v_id uuid := auth.uid();
begin
  if v_id is null then
    raise exception 'Sessão não autenticada.' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from gestao.usuarios u where u.id = v_id and u.ativo) then
    raise exception 'Usuário inexistente ou inativo.' using errcode = 'insufficient_privilege';
  end if;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Registra uma movimentação (única forma de escrever em movimentacoes).
-- ---------------------------------------------------------------------
create or replace function gestao.fn_registrar_movimentacao(
  p_demanda_id      uuid,
  p_tarefa_id       uuid,
  p_autor_id        uuid,
  p_tipo            text,
  p_texto           text default null,
  p_situacao_anterior text default null,
  p_situacao_nova   text default null,
  p_destinatario_id uuid default null,
  p_prioridade      text default null,
  p_prazo           date default null,
  p_mov_retificada  uuid default null,
  p_mov_ressalvada  uuid default null)
returns uuid
language plpgsql security definer
set search_path = gestao, pg_temp
as $$
declare
  v_id uuid;
begin
  insert into gestao.movimentacoes(
    demanda_id, tarefa_id, autor_id, tipo, texto,
    situacao_anterior, situacao_nova, destinatario_id, prioridade, prazo,
    movimentacao_retificada_id, movimentacao_ressalvada_id)
  values (
    p_demanda_id, p_tarefa_id, p_autor_id, p_tipo, p_texto,
    p_situacao_anterior, p_situacao_nova, p_destinatario_id, p_prioridade, p_prazo,
    p_mov_retificada, p_mov_ressalvada)
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Garante participante ativo na demanda (idempotente; reativa se inativo).
-- ---------------------------------------------------------------------
create or replace function gestao.fn_garantir_participante(
  p_demanda_id uuid, p_usuario_id uuid, p_papel text, p_por uuid)
returns void
language plpgsql security definer
set search_path = gestao, pg_temp
as $$
begin
  insert into gestao.participantes(demanda_id, usuario_id, papel, adicionado_por)
    values (p_demanda_id, p_usuario_id, coalesce(p_papel, 'participante'), p_por)
  on conflict (demanda_id, usuario_id)
    do update set ativo = true;
end;
$$;

-- ---------------------------------------------------------------------
-- "Gerente ou superior dentro do escopo" — usado por edição, inativação
-- e reabertura (matriz de permissões, seção 5.3). admin_ti também gere
-- conteúdo pela matriz; seu escopo global cobre a unidade.
-- ---------------------------------------------------------------------
create or replace function gestao.fn_gerente_ou_superior_no_escopo(
  p_usuario_id uuid, p_unidade uuid)
returns boolean
language plpgsql stable security definer
set search_path = gestao, pg_temp
as $$
declare
  v_nivel_gerente smallint;
begin
  select nivel into v_nivel_gerente from gestao.perfis where codigo = 'gerente';
  return (
      gestao.fn_nivel(p_usuario_id) >= v_nivel_gerente
      or gestao.fn_pode_administrar(p_usuario_id)
    )
    and p_unidade in (select gestao.fn_unidades_no_escopo(p_usuario_id));
end;
$$;
