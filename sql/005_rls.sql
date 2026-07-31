-- =====================================================================
-- 005_rls.sql
-- Row Level Security: privilégios + policies de visualização.
-- Sistema de Gestão de Demandas — SME Ribeirão Preto
--
-- Modelo de segurança em duas camadas:
--  1) PRIVILÉGIO: authenticated recebe apenas SELECT. Nenhum grant de
--     INSERT/UPDATE/DELETE — o front-end não consegue escrever direto.
--     Toda escrita passa pelas funções SECURITY DEFINER (007), que rodam
--     como dono e, por padrão, ignoram RLS (sem FORCE ROW LEVEL SECURITY).
--  2) VISIBILIDADE: policies de SELECT compostas com as funções de escopo.
--     Controle de acesso é RLS, nunca esconder botão (regra 4).
--
-- IMPORTANTE: rodar as migrações como o MESMO dono das tabelas (postgres),
-- para que as funções SECURITY DEFINER bypassem o RLS ao escrever/ler.
--
-- Auditoria de visualização de demanda `restrito` (LGPD, seção 20) NÃO é
-- feita aqui (policy é read-only e não deve ter efeito colateral): ela é
-- gravada pela função de abertura de demanda em 007.
-- =====================================================================

set search_path = gestao, extensions, public;

-- =====================================================================
-- Helpers de visibilidade (STABLE SECURITY DEFINER, search_path travado).
-- =====================================================================

-- fn_escopo_permite — a unidade está no escopo do usuário E, se a demanda
-- for `restrito`, o usuário tem direito de vê-la fora da tramitação:
--   • admin_ti: nunca (administra sistema, não conteúdo);
--   • gabinete (global) e gerente+ no escopo: sim;
--   • chefe_secao / agente: não.
create or replace function gestao.fn_escopo_permite(
  p_unidade uuid, p_sigilo text, p_usuario_id uuid)
returns boolean
language plpgsql stable security definer
set search_path = gestao, pg_temp
as $$
declare
  v_perfil text;
  v_nivel  smallint;
  v_global boolean;
  v_nivel_gerente smallint;
begin
  if p_unidade not in (select gestao.fn_unidades_no_escopo(p_usuario_id)) then
    return false;
  end if;

  if p_sigilo = 'restrito' then
    v_perfil := gestao.fn_perfil(p_usuario_id);
    if v_perfil = 'admin_ti' then
      return false;
    end if;
    v_global := gestao.fn_escopo_global(p_usuario_id);
    v_nivel  := gestao.fn_nivel(p_usuario_id);
    select nivel into v_nivel_gerente from gestao.perfis where codigo = 'gerente';
    return v_global or v_nivel >= v_nivel_gerente;
  end if;

  return true;   -- sigilo normal dentro do escopo
end;
$$;

-- fn_acesso_demanda_base — acesso à demanda por vínculo direto (criador,
-- solicitante, responsável atual, participante explícito) ou por escopo de
-- chefia. NÃO considera posse de tarefa (evita recursão com fn_pode_ver_tarefa).
create or replace function gestao.fn_acesso_demanda_base(
  p_demanda_id uuid, p_usuario_id uuid)
returns boolean
language plpgsql stable security definer
set search_path = gestao, pg_temp
as $$
declare
  d gestao.demandas%rowtype;
begin
  select * into d from gestao.demandas where id = p_demanda_id;
  if not found then
    return false;
  end if;

  if d.criado_por = p_usuario_id
     or d.solicitante_id = p_usuario_id
     or d.responsavel_atual_id = p_usuario_id then
    return true;
  end if;

  if exists (
    select 1 from gestao.participantes pa
     where pa.demanda_id = p_demanda_id
       and pa.usuario_id = p_usuario_id
       and pa.ativo
  ) then
    return true;
  end if;

  return gestao.fn_escopo_permite(d.unidade_responsavel_id, d.sigilo, p_usuario_id);
end;
$$;

-- fn_pode_ver_tarefa — VISIBILIDADE ESTRITA POR TAREFA (critério 4):
--   • recebeu a tarefa (responsável), OU
--   • é responsável por algum ANCESTRAL dela (vê a própria subárvore), OU
--   • tem acesso base à demanda (criador/chefia/participante).
-- NÃO enxerga tarefas irmãs.
create or replace function gestao.fn_pode_ver_tarefa(
  p_tarefa_id uuid, p_usuario_id uuid)
returns boolean
language plpgsql stable security definer
set search_path = gestao, pg_temp
as $$
declare
  v_demanda uuid;
  v_owner   boolean;
begin
  select demanda_id into v_demanda from gestao.tarefas where id = p_tarefa_id;
  if v_demanda is null then
    return false;
  end if;

  if gestao.fn_acesso_demanda_base(v_demanda, p_usuario_id) then
    return true;
  end if;

  -- Posse da própria tarefa ou de algum ancestral (sobe por parent_id).
  with recursive cadeia as (
    select t.id, t.parent_id, t.responsavel_id
      from gestao.tarefas t where t.id = p_tarefa_id
    union all
    select p.id, p.parent_id, p.responsavel_id
      from gestao.tarefas p join cadeia c on p.id = c.parent_id
  )
  select exists (select 1 from cadeia where responsavel_id = p_usuario_id)
    into v_owner;

  return v_owner;
end;
$$;

-- fn_pode_ver_demanda — acesso base OU possui alguma tarefa na demanda
-- (quem recebeu uma tarefa enxerga o CABEÇALHO da demanda, mas não as
-- tarefas irmãs — estas seguem fn_pode_ver_tarefa).
create or replace function gestao.fn_pode_ver_demanda(
  p_demanda_id uuid, p_usuario_id uuid)
returns boolean
language plpgsql stable security definer
set search_path = gestao, pg_temp
as $$
begin
  if gestao.fn_acesso_demanda_base(p_demanda_id, p_usuario_id) then
    return true;
  end if;
  return exists (
    select 1 from gestao.tarefas t
     where t.demanda_id = p_demanda_id
       and t.responsavel_id = p_usuario_id
  );
end;
$$;

grant execute on function gestao.fn_escopo_permite(uuid, text, uuid)     to authenticated;
grant execute on function gestao.fn_acesso_demanda_base(uuid, uuid)      to authenticated;
grant execute on function gestao.fn_pode_ver_demanda(uuid, uuid)         to authenticated;
grant execute on function gestao.fn_pode_ver_tarefa(uuid, uuid)          to authenticated;

-- =====================================================================
-- Habilita RLS em todas as tabelas e concede apenas SELECT.
-- =====================================================================
alter table gestao.perfis                    enable row level security;
alter table gestao.unidades_organizacionais  enable row level security;
alter table gestao.usuarios                   enable row level security;
alter table gestao.tipos_demanda             enable row level security;
alter table gestao.escolas                    enable row level security;
alter table gestao.feriados                   enable row level security;
alter table gestao.demandas                   enable row level security;
alter table gestao.tarefas                    enable row level security;
alter table gestao.participantes             enable row level security;
alter table gestao.pessoas_envolvidas        enable row level security;
alter table gestao.movimentacoes             enable row level security;
alter table gestao.comentarios               enable row level security;
alter table gestao.anexos                     enable row level security;
alter table gestao.notificacoes              enable row level security;
alter table gestao.auditoria                  enable row level security;
alter table gestao.relatorios_emitidos       enable row level security;

grant select on gestao.perfis,
                gestao.unidades_organizacionais,
                gestao.usuarios,
                gestao.tipos_demanda,
                gestao.escolas,
                gestao.feriados,
                gestao.demandas,
                gestao.tarefas,
                gestao.participantes,
                gestao.pessoas_envolvidas,
                gestao.movimentacoes,
                gestao.comentarios,
                gestao.anexos,
                gestao.notificacoes,
                gestao.auditoria,
                gestao.relatorios_emitidos
  to authenticated;

-- =====================================================================
-- Policies de SELECT.
-- =====================================================================

-- --- Tabelas de referência: legíveis por qualquer autenticado (formulários,
-- --- árvore do organograma). Gestão é feita por funções admin (007).
drop policy if exists pol_sel_perfis on gestao.perfis;
create policy pol_sel_perfis on gestao.perfis
  for select to authenticated using (true);

drop policy if exists pol_sel_unidades on gestao.unidades_organizacionais;
create policy pol_sel_unidades on gestao.unidades_organizacionais
  for select to authenticated using (true);

drop policy if exists pol_sel_tipos on gestao.tipos_demanda;
create policy pol_sel_tipos on gestao.tipos_demanda
  for select to authenticated using (true);

drop policy if exists pol_sel_escolas on gestao.escolas;
create policy pol_sel_escolas on gestao.escolas
  for select to authenticated using (true);

drop policy if exists pol_sel_feriados on gestao.feriados;
create policy pol_sel_feriados on gestao.feriados
  for select to authenticated using (true);

-- --- Usuários: diretório interno de servidores (para atribuição e exibição
-- --- de nomes). Sem dados de aluno/família aqui.
drop policy if exists pol_sel_usuarios on gestao.usuarios;
create policy pol_sel_usuarios on gestao.usuarios
  for select to authenticated using (true);

-- --- Demandas.
drop policy if exists pol_sel_demandas on gestao.demandas;
create policy pol_sel_demandas on gestao.demandas
  for select to authenticated
  using (gestao.fn_pode_ver_demanda(id, auth.uid()));

-- --- Tarefas.
drop policy if exists pol_sel_tarefas on gestao.tarefas;
create policy pol_sel_tarefas on gestao.tarefas
  for select to authenticated
  using (gestao.fn_pode_ver_tarefa(id, auth.uid()));

-- --- Participantes / pessoas envolvidas: seguem a visibilidade da demanda
-- --- (pessoas_envolvidas pode conter dado de aluno — restrito já tratado).
drop policy if exists pol_sel_participantes on gestao.participantes;
create policy pol_sel_participantes on gestao.participantes
  for select to authenticated
  using (gestao.fn_pode_ver_demanda(demanda_id, auth.uid()));

drop policy if exists pol_sel_pessoas on gestao.pessoas_envolvidas;
create policy pol_sel_pessoas on gestao.pessoas_envolvidas
  for select to authenticated
  using (gestao.fn_pode_ver_demanda(demanda_id, auth.uid()));

-- --- Movimentações e comentários: visíveis se o usuário vê a demanda ou a
-- --- tarefa correspondente.
-- Registro ligado a uma tarefa segue a visibilidade da tarefa (não vaza
-- para irmãs); registro só de demanda segue a visibilidade da demanda.
drop policy if exists pol_sel_mov on gestao.movimentacoes;
create policy pol_sel_mov on gestao.movimentacoes
  for select to authenticated
  using (
    case
      when tarefa_id is not null then gestao.fn_pode_ver_tarefa(tarefa_id, auth.uid())
      else gestao.fn_pode_ver_demanda(demanda_id, auth.uid())
    end
  );

drop policy if exists pol_sel_comentarios on gestao.comentarios;
create policy pol_sel_comentarios on gestao.comentarios
  for select to authenticated
  using (
    case
      when tarefa_id is not null then gestao.fn_pode_ver_tarefa(tarefa_id, auth.uid())
      else gestao.fn_pode_ver_demanda(demanda_id, auth.uid())
    end
  );

-- --- Anexos: quem participa da tramitação da demanda/tarefa/devolutiva,
-- --- mais chefias no escopo (seção 13). Inativos permanecem visíveis à
-- --- chefia; a listagem padrão os filtra em 007.
-- Anexo de tarefa segue a tarefa; anexo de devolutiva segue a movimentação
-- (que por sua vez segue tarefa/demanda); anexo só de demanda segue a demanda.
drop policy if exists pol_sel_anexos on gestao.anexos;
create policy pol_sel_anexos on gestao.anexos
  for select to authenticated
  using (
    case
      when tarefa_id is not null then gestao.fn_pode_ver_tarefa(tarefa_id, auth.uid())
      when movimentacao_id is not null then exists (
        select 1 from gestao.movimentacoes m
         where m.id = anexos.movimentacao_id
           and case
                 when m.tarefa_id is not null then gestao.fn_pode_ver_tarefa(m.tarefa_id, auth.uid())
                 else gestao.fn_pode_ver_demanda(m.demanda_id, auth.uid())
               end)
      when demanda_id is not null then gestao.fn_pode_ver_demanda(demanda_id, auth.uid())
      else false
    end
  );

-- --- Notificações: só as do próprio usuário.
drop policy if exists pol_sel_notif on gestao.notificacoes;
create policy pol_sel_notif on gestao.notificacoes
  for select to authenticated
  using (usuario_id = auth.uid());

-- --- Relatórios emitidos: quem vê a demanda vê seu histórico de emissões.
-- --- (A validação pública por hash é uma rota separada via Edge Function.)
drop policy if exists pol_sel_relatorios on gestao.relatorios_emitidos;
create policy pol_sel_relatorios on gestao.relatorios_emitidos
  for select to authenticated
  using (gestao.fn_pode_ver_demanda(demanda_id, auth.uid()));

-- --- Auditoria: leitura restrita a quem administra o sistema (admin_ti) e
-- --- ao gabinete. Ninguém edita/apaga (imutável em 006).
drop policy if exists pol_sel_auditoria on gestao.auditoria;
create policy pol_sel_auditoria on gestao.auditoria
  for select to authenticated
  using (
    gestao.fn_pode_administrar(auth.uid())
    or gestao.fn_escopo_global(auth.uid())
  );
