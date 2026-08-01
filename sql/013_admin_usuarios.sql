-- =====================================================================
-- 013_admin_usuarios.sql
-- Administração de usuários (Sessão 3 — tela de admin). Complementa o
-- provisionamento de sql/012 com: listar contas de login ainda sem acesso
-- ao sistema e inativar/reativar usuários (nunca DELETE — regra 1).
--
-- Todas restritas a quem administra (fn_pode_administrar). A escrita passa
-- por função SECURITY DEFINER; usuarios não tem UPDATE/DELETE ao front.
-- =====================================================================

set search_path = gestao, extensions, public;

-- ---------------------------------------------------------------------
-- fn_listar_contas_pendentes — contas em auth.users que ainda NÃO têm
-- acesso (sem linha em gestao.usuarios). Base da tela de provisionamento.
-- (auth não é exposto na API; por isso a leitura vem por esta função.)
-- ---------------------------------------------------------------------
create or replace function gestao.fn_listar_contas_pendentes()
returns table(id uuid, email text, criado_em timestamptz)
language plpgsql stable security definer
set search_path = gestao, pg_temp
as $$
begin
  if not gestao.fn_pode_administrar(gestao.fn_usuario_corrente()) then
    raise exception 'Apenas administradores.' using errcode = 'insufficient_privilege';
  end if;
  return query
    select u.id, lower(u.email)::text, u.created_at
    from auth.users u
    where not exists (select 1 from gestao.usuarios g where g.id = u.id)
    order by u.created_at desc;
end;
$$;

-- ---------------------------------------------------------------------
-- fn_inativar_usuario — desativa o acesso (ativo=false + motivo). Não
-- permite inativar a si mesmo. Registra em auditoria.
-- ---------------------------------------------------------------------
create or replace function gestao.fn_inativar_usuario(p_id uuid, p_motivo text)
returns void
language plpgsql volatile security definer
set search_path = gestao, pg_temp
as $$
declare
  v_admin uuid := gestao.fn_usuario_corrente();
begin
  if not gestao.fn_pode_administrar(v_admin) then
    raise exception 'Apenas administradores.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Justificativa obrigatória.' using errcode = 'check_violation';
  end if;
  if p_id = v_admin then
    raise exception 'Não é possível inativar o próprio usuário.' using errcode = 'check_violation';
  end if;

  update gestao.usuarios
     set ativo = false,
         inativado_em = now(),
         inativado_por = v_admin,
         motivo_inativacao = p_motivo
   where id = p_id and ativo;
  if not found then
    raise exception 'Usuário não encontrado ou já inativo.' using errcode = 'no_data_found';
  end if;

  insert into gestao.auditoria(usuario_id, acao, entidade, entidade_id, dados_novos)
  values (v_admin, 'inativacao', 'usuario', p_id, jsonb_build_object('motivo', p_motivo));
end;
$$;

-- ---------------------------------------------------------------------
-- fn_reativar_usuario — reativa o acesso. Registra em auditoria.
-- ---------------------------------------------------------------------
create or replace function gestao.fn_reativar_usuario(p_id uuid, p_motivo text)
returns void
language plpgsql volatile security definer
set search_path = gestao, pg_temp
as $$
declare
  v_admin uuid := gestao.fn_usuario_corrente();
begin
  if not gestao.fn_pode_administrar(v_admin) then
    raise exception 'Apenas administradores.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Justificativa obrigatória.' using errcode = 'check_violation';
  end if;

  update gestao.usuarios
     set ativo = true,
         inativado_em = null,
         inativado_por = null,
         motivo_inativacao = null,
         atualizado_em = now()
   where id = p_id and not ativo;
  if not found then
    raise exception 'Usuário não encontrado ou já ativo.' using errcode = 'no_data_found';
  end if;

  insert into gestao.auditoria(usuario_id, acao, entidade, entidade_id, dados_novos)
  values (v_admin, 'reativacao', 'usuario', p_id, jsonb_build_object('motivo', p_motivo));
end;
$$;

-- ---------------------------------------------------------------------
-- Grants (o controle de admin é feito dentro de cada função).
-- ---------------------------------------------------------------------
grant execute on function gestao.fn_listar_contas_pendentes() to authenticated;
grant execute on function gestao.fn_inativar_usuario(uuid, text) to authenticated;
grant execute on function gestao.fn_reativar_usuario(uuid, text) to authenticated;
