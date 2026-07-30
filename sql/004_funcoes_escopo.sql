-- =====================================================================
-- 004_funcoes_escopo.sql
-- Funções de escopo e atributos de perfil usadas pelas policies (005).
-- Sistema de Gestão de Demandas — SME Ribeirão Preto
--
-- Todas são STABLE + SECURITY DEFINER com search_path travado: precisam
-- ler `usuarios`/`unidades`/`perfis` independentemente do RLS do chamador,
-- e não podem ser desviadas por objetos de outro schema. O escopo vem do
-- ORGANOGRAMA (parent_id), nunca de regra fixa por cargo (regra 5).
-- =====================================================================

set search_path = gestao, extensions, public;

-- ---------------------------------------------------------------------
-- fn_escopo_global — true para quem enxerga toda a Secretaria
-- (gabinete e admin_ti, via coluna `escopo_global` de perfis).
-- ---------------------------------------------------------------------
create or replace function gestao.fn_escopo_global(p_usuario_id uuid)
returns boolean
language sql stable security definer
set search_path = gestao, pg_temp
as $$
  select coalesce(p.escopo_global, false)
    from gestao.usuarios u
    join gestao.perfis p on p.codigo = u.perfil
   where u.id = p_usuario_id and u.ativo;
$$;

-- ---------------------------------------------------------------------
-- fn_nivel — nível hierárquico do usuário (para "gerente ou superior").
-- Retorna 0 se usuário inexistente/inativo.
-- ---------------------------------------------------------------------
create or replace function gestao.fn_nivel(p_usuario_id uuid)
returns smallint
language sql stable security definer
set search_path = gestao, pg_temp
as $$
  select coalesce(
    (select p.nivel
       from gestao.usuarios u
       join gestao.perfis p on p.codigo = u.perfil
      where u.id = p_usuario_id and u.ativo),
    0::smallint);
$$;

-- ---------------------------------------------------------------------
-- fn_perfil — código do perfil do usuário (ex.: 'admin_ti').
-- ---------------------------------------------------------------------
create or replace function gestao.fn_perfil(p_usuario_id uuid)
returns text
language sql stable security definer
set search_path = gestao, pg_temp
as $$
  select u.perfil
    from gestao.usuarios u
   where u.id = p_usuario_id and u.ativo;
$$;

-- ---------------------------------------------------------------------
-- fn_pode_administrar — true só para perfis que administram o sistema
-- (admin_ti): usuários, unidades, tipos e feriados.
-- ---------------------------------------------------------------------
create or replace function gestao.fn_pode_administrar(p_usuario_id uuid)
returns boolean
language sql stable security definer
set search_path = gestao, pg_temp
as $$
  select coalesce(p.pode_administrar, false)
    from gestao.usuarios u
    join gestao.perfis p on p.codigo = u.perfil
   where u.id = p_usuario_id and u.ativo;
$$;

-- ---------------------------------------------------------------------
-- fn_unidades_no_escopo — CONJUNTO de unidades que o usuário enxerga:
--   • escopo_global  → todas as unidades;
--   • chefia (nível >= chefe_secao) → sua unidade + descendentes
--     (WITH RECURSIVE sobre parent_id);
--   • agente_administrativo → vazio (sem escopo de chefia).
-- É a função central citada na seção 18 e usada nas policies do 005.
-- ---------------------------------------------------------------------
create or replace function gestao.fn_unidades_no_escopo(p_usuario_id uuid)
returns setof uuid
language plpgsql stable security definer
set search_path = gestao, pg_temp
as $$
declare
  v_unidade uuid;
  v_global  boolean;
  v_nivel   smallint;
  v_nivel_chefia smallint;
begin
  select u.unidade_id, p.escopo_global, p.nivel
    into v_unidade, v_global, v_nivel
    from gestao.usuarios u
    join gestao.perfis p on p.codigo = u.perfil
   where u.id = p_usuario_id and u.ativo;

  if not found then
    return;                       -- inexistente/inativo: escopo vazio
  end if;

  if v_global then
    return query select uo.id from gestao.unidades_organizacionais uo;
    return;
  end if;

  select nivel into v_nivel_chefia
    from gestao.perfis where codigo = 'chefe_secao';

  if v_nivel < v_nivel_chefia then
    return;                       -- agente administrativo: sem chefia
  end if;

  return query
    with recursive arvore as (
      select uo.id
        from gestao.unidades_organizacionais uo
       where uo.id = v_unidade
      union all
      select f.id
        from gestao.unidades_organizacionais f
        join arvore a on f.parent_id = a.id
    )
    select id from arvore;
end;
$$;

-- ---------------------------------------------------------------------
-- Permissões de execução (o front chama via RPC apenas onde fizer sentido;
-- as policies usam estas funções internamente).
-- ---------------------------------------------------------------------
grant execute on function gestao.fn_escopo_global(uuid)     to authenticated;
grant execute on function gestao.fn_nivel(uuid)             to authenticated;
grant execute on function gestao.fn_perfil(uuid)            to authenticated;
grant execute on function gestao.fn_pode_administrar(uuid)  to authenticated;
grant execute on function gestao.fn_unidades_no_escopo(uuid) to authenticated;
