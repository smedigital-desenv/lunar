-- =====================================================================
-- 006_triggers_imutabilidade_auditoria.sql
-- Imutabilidade física, geração do número da demanda, touch e auditoria.
-- Sistema de Gestão de Demandas — SME Ribeirão Preto
--
-- Seções 11 (imutabilidade), 6/9 (número), 19 (auditoria).
-- =====================================================================

set search_path = gestao, extensions, public;

-- =====================================================================
-- 1) IMUTABILIDADE — impossível alterar/apagar histórico, nem pelo dono.
--    Tabelas append-only: movimentacoes, comentarios, anexos, auditoria,
--    relatorios_emitidos. Só INSERT é permitido.
-- =====================================================================
create or replace function gestao.fn_impedir_alteracao()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'Registro imutável: % em % não é permitido (tabela append-only).',
    tg_op, tg_table_name
    using errcode = 'check_violation';
end;
$$;

do $$
declare
  v_tab text;
begin
  foreach v_tab in array array[
    'movimentacoes','comentarios','anexos','auditoria','relatorios_emitidos'
  ] loop
    execute format('drop trigger if exists trg_imutavel on gestao.%I', v_tab);
    execute format(
      'create trigger trg_imutavel before update or delete on gestao.%I
         for each row execute function gestao.fn_impedir_alteracao()', v_tab);
  end loop;
end;
$$;

-- =====================================================================
-- 2) NÚMERO DA DEMANDA — DEM-AAAA-NNNNNN, sequencial por ANO, no banco.
--    Uma sequence por ano (criada sob demanda); reinicia a numeração a
--    cada exercício. Roda em BEFORE INSERT, antes do NOT NULL de `numero`.
-- =====================================================================
create or replace function gestao.fn_gerar_numero_demanda()
returns trigger
language plpgsql
as $$
declare
  v_ano  int := extract(year from (now() at time zone 'America/Sao_Paulo'))::int;
  v_seq  text := format('gestao.seq_demanda_%s', v_ano);
  v_next bigint;
begin
  -- Número é sempre gerado aqui; ignora valor vindo de fora.
  execute format('create sequence if not exists %s', v_seq);
  execute format('select nextval(%L)', v_seq) into v_next;
  new.numero := format('DEM-%s-%s', v_ano, lpad(v_next::text, 6, '0'));
  return new;
end;
$$;

drop trigger if exists trg_numero_demanda on gestao.demandas;
create trigger trg_numero_demanda
  before insert on gestao.demandas
  for each row execute function gestao.fn_gerar_numero_demanda();

-- =====================================================================
-- 3) TOUCH — mantém atualizado_em nas tabelas mutáveis.
-- =====================================================================
create or replace function gestao.fn_touch_atualizado()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

do $$
declare
  v_tab text;
begin
  foreach v_tab in array array[
    'usuarios','unidades_organizacionais','demandas','tarefas'
  ] loop
    execute format('drop trigger if exists trg_touch on gestao.%I', v_tab);
    execute format(
      'create trigger trg_touch before update on gestao.%I
         for each row execute function gestao.fn_touch_atualizado()', v_tab);
  end loop;
end;
$$;

-- =====================================================================
-- 4) AUDITORIA AUTOMÁTICA — rede de segurança para as entidades centrais.
--    Registra INSERT/UPDATE com dados anteriores/novos em JSONB, usuário
--    (auth.uid) e IP (quando o header x-forwarded-for estiver disponível).
--    Garante que nenhuma alteração de demanda/tarefa fique sem trilha.
-- =====================================================================
create or replace function gestao.fn_auditar_alteracao()
returns trigger
language plpgsql
security definer
set search_path = gestao, pg_temp
as $$
declare
  v_ip inet;
begin
  begin
    v_ip := nullif(
      split_part(
        (current_setting('request.headers', true))::jsonb ->> 'x-forwarded-for',
        ',', 1), '')::inet;
  exception when others then
    v_ip := null;
  end;

  if tg_op = 'INSERT' then
    insert into gestao.auditoria(
        usuario_id, acao, entidade, entidade_id, dados_novos, ip)
      values (auth.uid(), 'insercao', tg_table_name, new.id, to_jsonb(new), v_ip);
    return new;
  elsif tg_op = 'UPDATE' then
    insert into gestao.auditoria(
        usuario_id, acao, entidade, entidade_id,
        dados_anteriores, dados_novos, ip)
      values (auth.uid(), 'atualizacao', tg_table_name, new.id,
        to_jsonb(old), to_jsonb(new), v_ip);
    return new;
  end if;
  return new;
end;
$$;

do $$
declare
  v_tab text;
begin
  foreach v_tab in array array['demandas','tarefas'] loop
    execute format('drop trigger if exists trg_auditar on gestao.%I', v_tab);
    execute format(
      'create trigger trg_auditar after insert or update on gestao.%I
         for each row execute function gestao.fn_auditar_alteracao()', v_tab);
  end loop;
end;
$$;
