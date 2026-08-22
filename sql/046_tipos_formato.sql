-- =====================================================================
-- 046_tipos_formato.sql
-- Passo 1 de docs/ESPEC-TIPOS.md: formato por tipo de demanda.
--
-- Um formulário único atendia dois usos que não se parecem — atendimento
-- ao munícipe e controle interno da subsecretaria. Cada tipo passa a
-- declarar a que formato pertence, e o front monta os campos a partir
-- disso. Criar tipo novo é escolher o formato, sem programar.
--
-- `objeto_queixa` deixa de ser NOT NULL: no controle interno ele não tem
-- sentido. Foi ele que obrigou a migração da SUBPED a copiar o título
-- dentro do campo só para a carga passar. A exigência não some — muda de
-- lugar, para fn_criar_demanda, que a aplica conforme o formato.
--
-- Sistema de Gestão de Demandas — SME Ribeirão Preto
-- =====================================================================

set search_path = gestao, extensions, public;

-- ---------------------------------------------------------------------
-- 1. Formato do tipo
-- ---------------------------------------------------------------------
-- Default 'atendimento': é o comportamento de hoje (tudo exige
-- objeto/queixa), então tipo antigo ou criado sem informar o formato
-- continua se comportando como antes.
alter table gestao.tipos_demanda
  add column if not exists formato text not null default 'atendimento'
  check (formato in ('atendimento', 'controle'));

comment on column gestao.tipos_demanda.formato is
  'Conjunto de campos do formulário. atendimento = chega de fora e exige '
  'resposta (objeto/queixa, escola, aluno, pessoas envolvidas, sigilo); '
  'controle = trabalho interno acompanhado até concluir. Ver '
  'docs/ESPEC-TIPOS.md.';

-- Regra 1: inativar exige motivo. A tabela não tinha onde guardá-lo.
alter table gestao.tipos_demanda
  add column if not exists motivo_inativacao text;

alter table gestao.tipos_demanda
  drop constraint if exists chk_tipo_inativo;
alter table gestao.tipos_demanda
  add constraint chk_tipo_inativo check (ativo or motivo_inativacao is not null);

-- ---------------------------------------------------------------------
-- 2. objeto_queixa deixa de ser obrigatório no banco
-- ---------------------------------------------------------------------
alter table gestao.demandas alter column objeto_queixa drop not null;

-- ---------------------------------------------------------------------
-- 3. Catálogo de tipos
-- ---------------------------------------------------------------------
-- Nenhuma demanda real usa os tipos do seed, então dá para renomear.
-- Ainda assim, tudo é idempotente e nada é apagado (regra 1).
update gestao.tipos_demanda
   set nome = 'Solicitação de munícipe',
       descricao = 'Pedido de providência ou serviço feito por munícipe'
 where nome = 'Solicitação';

update gestao.tipos_demanda
   set nome = 'Pedido de informação',
       descricao = 'Pedido de informação ou esclarecimento'
 where nome = 'Informação';

-- Ofício sai: não tem função própria (ESPEC-TIPOS §9). O que chega de
-- fora é atendimento; entre unidades já é tramitação (fn_encaminhar); o
-- que a SME expede é anexo. Inativado com motivo, nunca apagado.
update gestao.tipos_demanda
   set ativo = false,
       motivo_inativacao = 'Sem função própria no sistema: ofício recebido '
         || 'é atendimento, entre unidades é tramitação e o expedido é anexo. '
         || 'Decisão de 2026-08-22 (docs/ESPEC-TIPOS.md §9).'
 where nome = 'Ofício' and ativo;

-- Os que sobraram do seed são todos atendimento (é o default da coluna,
-- mas explicitar deixa o catálogo legível).
update gestao.tipos_demanda set formato = 'atendimento'
 where nome in ('Reclamação', 'Denúncia', 'Requerimento',
                'Solicitação de munícipe', 'Pedido de informação');

-- Tipos novos. Por nome, para rodar de novo não duplicar.
insert into gestao.tipos_demanda (nome, descricao, formato)
select v.nome, v.descricao, v.formato
  from (values
    ('Plantão da Supervisão',
     'Atendimento do plantão da supervisão de ensino', 'atendimento'),
    ('Controle da Subsecretaria',
     'Acompanhamento interno de ação da subsecretaria até a conclusão', 'controle'),
    ('Solicitação do Secretário',
     'Determinação do Gabinete a ser cumprida e acompanhada', 'controle'),
    ('Solicitação entre Subsecretários',
     'Pedido de uma subsecretaria a outra', 'controle'),
    ('Solicitação para Gerentes',
     'Pedido da subsecretaria às gerências subordinadas', 'controle')
  ) as v(nome, descricao, formato)
 where not exists (
   select 1 from gestao.tipos_demanda t where t.nome = v.nome);

-- ---------------------------------------------------------------------
-- 4. fn_criar_demanda: objeto/queixa conforme o formato
-- ---------------------------------------------------------------------
-- Sem tipo informado, segue exigindo — o default é o comportamento
-- antigo, para nenhuma tela existente passar a aceitar campo vazio sem
-- que alguém tenha decidido isso.
create or replace function gestao.fn_criar_demanda(
  p_titulo text,
  p_objeto_queixa text,
  p_descricao text default null,
  p_tipo_id uuid default null,
  p_categoria text default null,
  p_setor text default null,
  p_prioridade text default 'normal',
  p_prazo date default null,
  p_escola_id uuid default null,
  p_aluno_nome text default null,
  p_numero_processo_solar text default null,
  p_sigilo text default 'normal',
  p_solicitante_id uuid default null,
  p_responsavel_id uuid default null,
  p_pessoas jsonb default '[]'::jsonb,
  p_link_documentacao text default null)
returns uuid
language plpgsql security definer
set search_path = gestao, pg_temp
as $$
declare
  v_autor uuid := gestao.fn_usuario_corrente();
  v_solic uuid := coalesce(p_solicitante_id, v_autor);
  v_resp  uuid := coalesce(p_responsavel_id, v_autor);
  v_unidade uuid;
  v_demanda uuid;
  v_pessoa jsonb;
  v_formato text;
begin
  if p_titulo is null or btrim(p_titulo) = '' then
    raise exception 'Título é obrigatório.' using errcode = 'check_violation';
  end if;

  select formato into v_formato from gestao.tipos_demanda where id = p_tipo_id;

  if coalesce(v_formato, 'atendimento') <> 'controle'
     and (p_objeto_queixa is null or btrim(p_objeto_queixa) = '') then
    raise exception 'Objeto/queixa é obrigatório neste tipo de demanda.'
      using errcode = 'check_violation';
  end if;

  if p_link_documentacao is not null and btrim(p_link_documentacao) <> ''
     and p_link_documentacao !~* '^https?://' then
    raise exception 'Link da documentação deve começar com http(s)://.'
      using errcode = 'check_violation';
  end if;

  select unidade_id into v_unidade from gestao.usuarios where id = v_resp and ativo;
  if v_unidade is null then
    raise exception 'Responsável inexistente ou inativo.' using errcode = 'check_violation';
  end if;

  insert into gestao.demandas(
    titulo, descricao, objeto_queixa, tipo_id, categoria, setor, prioridade,
    situacao, prazo, escola_id, aluno_nome, numero_processo_solar, sigilo,
    solicitante_id, responsavel_atual_id, unidade_responsavel_id,
    link_documentacao, criado_por)
  values (
    p_titulo, p_descricao, nullif(btrim(coalesce(p_objeto_queixa, '')), ''),
    p_tipo_id, p_categoria, p_setor,
    coalesce(p_prioridade,'normal'), 'aberta', p_prazo, p_escola_id, p_aluno_nome,
    p_numero_processo_solar, coalesce(p_sigilo,'normal'),
    v_solic, v_resp, v_unidade,
    nullif(btrim(coalesce(p_link_documentacao,'')), ''), v_autor)
  returning id into v_demanda;

  perform gestao.fn_garantir_participante(v_demanda, v_solic, 'solicitante', v_autor);
  perform gestao.fn_garantir_participante(v_demanda, v_resp,  'responsavel', v_autor);
  perform gestao.fn_garantir_participante(v_demanda, v_autor, 'participante', v_autor);

  for v_pessoa in select value from jsonb_array_elements(coalesce(p_pessoas,'[]'::jsonb)) loop
    insert into gestao.pessoas_envolvidas(demanda_id, nome, vinculo, observacao, criado_por)
      values (v_demanda, v_pessoa->>'nome', v_pessoa->>'vinculo',
              v_pessoa->>'observacao', v_autor);
  end loop;

  perform gestao.fn_registrar_movimentacao(
    v_demanda, null, v_autor, 'criacao', 'Demanda criada.',
    null, 'aberta', v_resp, coalesce(p_prioridade,'normal'), p_prazo);

  if v_resp <> v_autor then
    insert into gestao.notificacoes(usuario_id, demanda_id, tipo, titulo, mensagem)
      values (v_resp, v_demanda, 'atribuicao', 'Nova demanda atribuída',
              'Você foi definido como responsável por uma demanda.');
  end if;

  return v_demanda;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. fn_editar_demanda: mesma regra ao corrigir
-- ---------------------------------------------------------------------
-- A função inteira está no sql/044; aqui só a checagem de objeto/queixa
-- muda, então basta redefinir o trecho — mas o CREATE OR REPLACE exige o
-- corpo completo. Alterada apenas a validação, comentada abaixo.
create or replace function gestao.fn_editar_demanda(
  p_demanda_id uuid,
  p_campos jsonb,
  p_justificativa text)
returns void
language plpgsql security definer
set search_path = gestao, pg_temp
as $$
declare
  v_autor uuid := gestao.fn_usuario_corrente();
  d gestao.demandas%rowtype;
  v_pode_geral boolean;
  v_sou_dono boolean;
  v_novo_responsavel uuid;
  v_nova_unidade uuid;
  v_formato text;
begin
  perform gestao.fn_exige_justificativa(p_justificativa);
  select * into d from gestao.demandas where id = p_demanda_id and ativo;
  if not found then
    raise exception 'Demanda inexistente ou inativa.' using errcode = 'check_violation';
  end if;

  v_pode_geral := gestao.fn_gerente_ou_superior_no_escopo(v_autor, d.unidade_responsavel_id);
  v_sou_dono := (v_autor = d.criado_por or v_autor = d.responsavel_atual_id);

  if not v_pode_geral and not (v_sou_dono and p_campos ? 'responsavel_id') then
    raise exception 'Edição exige gerente ou superior no escopo.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_campos ? 'responsavel_id' and not v_sou_dono then
    raise exception 'Apenas quem criou a demanda ou o responsável atual podem alterar o responsável.'
      using errcode = 'insufficient_privilege';
  end if;

  if v_sou_dono and not v_pode_geral and (p_campos - 'responsavel_id') <> '{}'::jsonb then
    raise exception 'Sem permissão para editar os demais campos da demanda — apenas o responsável.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_campos ? 'titulo' and btrim(coalesce(p_campos->>'titulo', '')) = '' then
    raise exception 'Título não pode ficar vazio.' using errcode = 'check_violation';
  end if;

  -- Objeto/queixa só não pode esvaziar em tipo de atendimento. O formato
  -- considerado é o que a demanda TERÁ depois da edição, porque a mesma
  -- chamada pode trocar o tipo e limpar o objeto.
  select formato into v_formato from gestao.tipos_demanda
   where id = coalesce(
     case when p_campos ? 'tipo_id' then nullif(p_campos->>'tipo_id','')::uuid end,
     d.tipo_id);
  if p_campos ? 'objeto_queixa'
     and btrim(coalesce(p_campos->>'objeto_queixa', '')) = ''
     and coalesce(v_formato, 'atendimento') <> 'controle' then
    raise exception 'Objeto/queixa não pode ficar vazio neste tipo de demanda.'
      using errcode = 'check_violation';
  end if;

  if p_campos ? 'sigilo' and p_campos->>'sigilo' not in ('normal', 'restrito') then
    raise exception 'Sigilo inválido: use normal ou restrito.' using errcode = 'check_violation';
  end if;
  if p_campos ? 'link_documentacao'
     and btrim(coalesce(p_campos->>'link_documentacao', '')) <> ''
     and p_campos->>'link_documentacao' !~* '^https?://' then
    raise exception 'Link da documentação deve começar com http(s)://.'
      using errcode = 'check_violation';
  end if;

  if p_campos ? 'responsavel_id' then
    v_novo_responsavel := nullif(p_campos->>'responsavel_id', '')::uuid;
    if v_novo_responsavel is null then
      raise exception 'Informe o novo responsável.' using errcode = 'check_violation';
    end if;
    select unidade_id into v_nova_unidade
      from gestao.usuarios where id = v_novo_responsavel and ativo;
    if v_nova_unidade is null then
      raise exception 'Responsável inexistente ou inativo.' using errcode = 'check_violation';
    end if;
  end if;

  update gestao.demandas set
    titulo        = case when p_campos ? 'titulo' then p_campos->>'titulo' else titulo end,
    descricao     = case when p_campos ? 'descricao' then p_campos->>'descricao' else descricao end,
    objeto_queixa = case when p_campos ? 'objeto_queixa'
                      then nullif(btrim(p_campos->>'objeto_queixa'), '') else objeto_queixa end,
    tipo_id       = case when p_campos ? 'tipo_id' then nullif(p_campos->>'tipo_id', '')::uuid else tipo_id end,
    categoria     = case when p_campos ? 'categoria' then p_campos->>'categoria' else categoria end,
    setor         = case when p_campos ? 'setor' then p_campos->>'setor' else setor end,
    prioridade    = case when p_campos ? 'prioridade' then p_campos->>'prioridade' else prioridade end,
    prazo         = case when p_campos ? 'prazo' then nullif(p_campos->>'prazo', '')::date else prazo end,
    escola_id     = case when p_campos ? 'escola_id' then nullif(p_campos->>'escola_id', '')::uuid else escola_id end,
    aluno_nome    = case when p_campos ? 'aluno_nome' then p_campos->>'aluno_nome' else aluno_nome end,
    numero_processo_solar = case when p_campos ? 'numero_processo_solar'
                             then nullif(p_campos->>'numero_processo_solar', '') else numero_processo_solar end,
    sigilo        = case when p_campos ? 'sigilo' then p_campos->>'sigilo' else sigilo end,
    link_documentacao = case when p_campos ? 'link_documentacao'
                          then nullif(btrim(p_campos->>'link_documentacao'), '') else link_documentacao end,
    responsavel_atual_id   = coalesce(v_novo_responsavel, responsavel_atual_id),
    unidade_responsavel_id = coalesce(v_nova_unidade, unidade_responsavel_id)
  where id = p_demanda_id;

  perform gestao.fn_registrar_movimentacao(
    p_demanda_id, null, v_autor, 'edicao', p_justificativa,
    null, null, v_novo_responsavel);

  if v_novo_responsavel is not null and v_novo_responsavel <> v_autor then
    insert into gestao.notificacoes(usuario_id, demanda_id, tipo, titulo, mensagem)
      values (v_novo_responsavel, p_demanda_id, 'edicao',
              'Você foi definido como responsável', 'O responsável desta demanda foi alterado.');
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. As 31 demandas migradas da SUBPED recebem o tipo de controle
-- ---------------------------------------------------------------------
-- Identificadas pelo autor da carga (usuário de serviço "Dados
-- importados") e por ainda estarem sem tipo. UPDATE direto: `demandas`
-- não é tabela append-only, e uma movimentação por linha só poluiria a
-- timeline com um acerto de catálogo.
update gestao.demandas d
   set tipo_id = (select id from gestao.tipos_demanda
                   where nome = 'Controle da Subsecretaria')
  from gestao.usuarios u
 where u.id = d.criado_por
   and u.email = 'dados.importados@educacao.pmrp.sp.gov.br'
   and d.tipo_id is null;
