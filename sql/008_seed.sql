-- =====================================================================
-- 008_seed.sql
-- Dados iniciais: perfis, organograma, usuários fictícios, tipos, escolas
-- e feriados de 2026. Idempotente (ON CONFLICT / WHERE NOT EXISTS).
-- Sistema de Gestão de Demandas — SME Ribeirão Preto
--
-- ATENÇÃO: os usuários e as senhas aqui são SOMENTE PARA DESENVOLVIMENTO/
-- TESTE. Em produção, os usuários são provisionados via Google OAuth
-- (@educacao.pmrp.sp.gov.br) — ver Sessão 3. UUIDs fixos para os testes
-- de RLS (sql/999_testes.sql) poderem referenciá-los.
-- =====================================================================

set search_path = gestao, extensions, public;

-- ---------------------------------------------------------------------
-- Perfis (hierarquia). admin_ti equivale a gerente para ações de conteúdo
-- e tem escopo global; gabinete é o topo.
-- ---------------------------------------------------------------------
insert into gestao.perfis (codigo, nome, nivel, escopo_global, pode_administrar) values
  ('agente_administrativo','Agente Administrativo',1,false,false),
  ('chefe_secao',          'Chefe de Seção',       2,false,false),
  ('gerente',              'Gerente',              3,false,false),
  ('subsecretario',        'Subsecretário',        4,false,false),
  ('gabinete',             'Gabinete',             5,true, false),
  ('admin_ti',             'Administrador de TI',  3,true, true)
on conflict (codigo) do update
  set nome = excluded.nome, nivel = excluded.nivel,
      escopo_global = excluded.escopo_global, pode_administrar = excluded.pode_administrar;

-- ---------------------------------------------------------------------
-- Organograma: Gabinete → Subsecretarias → Gerências → Seções.
-- Inserção por nível (FK autorreferente exige a mãe já existente).
-- ---------------------------------------------------------------------
-- Nível 0 — Gabinete
insert into gestao.unidades_organizacionais (id, parent_id, tipo, nome, sigla) values
  ('11111111-1111-1111-1111-111111111111', null, 'gabinete', 'Gabinete do Secretário', 'GAB')
on conflict (id) do nothing;

-- Nível 1 — Subsecretarias
insert into gestao.unidades_organizacionais (id, parent_id, tipo, nome, sigla) values
  ('22222222-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','subsecretaria','Subsecretaria Pedagógica','SUBPED'),
  ('22222222-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','subsecretaria','Subsecretaria Administrativa','SUBADM'),
  ('22222222-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','subsecretaria','Subsecretaria de Planejamento','SUBPLAN')
on conflict (id) do nothing;

-- Nível 2 — Gerências
insert into gestao.unidades_organizacionais (id, parent_id, tipo, nome, sigla) values
  ('33333333-0000-0000-0000-000000000001','22222222-0000-0000-0000-000000000001','gerencia','Gerência de Ensino Fundamental','GEF'),
  ('33333333-0000-0000-0000-000000000002','22222222-0000-0000-0000-000000000001','gerencia','Gerência de Educação Infantil','GEI'),
  ('33333333-0000-0000-0000-000000000003','22222222-0000-0000-0000-000000000002','gerencia','Gerência de Recursos Humanos','GRH'),
  ('33333333-0000-0000-0000-000000000004','22222222-0000-0000-0000-000000000002','gerencia','Gerência de Tecnologia da Informação','GTI'),
  ('33333333-0000-0000-0000-000000000005','22222222-0000-0000-0000-000000000003','gerencia','Gerência de Planejamento','GPL')
on conflict (id) do nothing;

-- Nível 3 — Seções
insert into gestao.unidades_organizacionais (id, parent_id, tipo, nome, sigla) values
  ('44444444-0000-0000-0000-000000000001','33333333-0000-0000-0000-000000000001','secao','Seção de Anos Iniciais','SAI'),
  ('44444444-0000-0000-0000-000000000002','33333333-0000-0000-0000-000000000001','secao','Seção de Anos Finais','SAF'),
  ('44444444-0000-0000-0000-000000000003','33333333-0000-0000-0000-000000000002','secao','Seção de Creches','SCR'),
  ('44444444-0000-0000-0000-000000000004','33333333-0000-0000-0000-000000000003','secao','Seção de Folha de Pagamento','SFO'),
  ('44444444-0000-0000-0000-000000000005','33333333-0000-0000-0000-000000000004','secao','Seção de Sistemas','SSI'),
  ('44444444-0000-0000-0000-000000000006','33333333-0000-0000-0000-000000000005','secao','Seção de Estatística Educacional','SES')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Usuários fictícios (DEV) — primeiro em auth.users, depois em gestao.usuarios.
-- Senha placeholder única; trocar/removê-los antes de produção.
-- ---------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000001','authenticated','authenticated','secretario@educacao.pmrp.sp.gov.br', extensions.crypt('dev-123456', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000002','authenticated','authenticated','subped@educacao.pmrp.sp.gov.br',     extensions.crypt('dev-123456', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000003','authenticated','authenticated','subadm@educacao.pmrp.sp.gov.br',     extensions.crypt('dev-123456', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000004','authenticated','authenticated','subplan@educacao.pmrp.sp.gov.br',    extensions.crypt('dev-123456', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000005','authenticated','authenticated','gerente.gef@educacao.pmrp.sp.gov.br',extensions.crypt('dev-123456', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000006','authenticated','authenticated','gerente.gti@educacao.pmrp.sp.gov.br',extensions.crypt('dev-123456', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000007','authenticated','authenticated','chefe.sai@educacao.pmrp.sp.gov.br',  extensions.crypt('dev-123456', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000008','authenticated','authenticated','chefe.ssi@educacao.pmrp.sp.gov.br',  extensions.crypt('dev-123456', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000009','authenticated','authenticated','agente.sai@educacao.pmrp.sp.gov.br', extensions.crypt('dev-123456', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000010','authenticated','authenticated','agente.sfo@educacao.pmrp.sp.gov.br', extensions.crypt('dev-123456', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000011','authenticated','authenticated','admin.ti@educacao.pmrp.sp.gov.br',   extensions.crypt('dev-123456', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}','{}')
on conflict (id) do nothing;

insert into gestao.usuarios (id, nome, email, perfil, unidade_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001','Ana Secretária','secretario@educacao.pmrp.sp.gov.br','gabinete',      '11111111-1111-1111-1111-111111111111'),
  ('aaaaaaaa-0000-0000-0000-000000000002','Bruno Pedagógico','subped@educacao.pmrp.sp.gov.br','subsecretario',  '22222222-0000-0000-0000-000000000001'),
  ('aaaaaaaa-0000-0000-0000-000000000003','Carla Administrativa','subadm@educacao.pmrp.sp.gov.br','subsecretario','22222222-0000-0000-0000-000000000002'),
  ('aaaaaaaa-0000-0000-0000-000000000004','Diego Planejamento','subplan@educacao.pmrp.sp.gov.br','subsecretario','22222222-0000-0000-0000-000000000003'),
  ('aaaaaaaa-0000-0000-0000-000000000005','Eduardo Gerente','gerente.gef@educacao.pmrp.sp.gov.br','gerente',    '33333333-0000-0000-0000-000000000001'),
  ('aaaaaaaa-0000-0000-0000-000000000006','Fernanda TI','gerente.gti@educacao.pmrp.sp.gov.br','gerente',        '33333333-0000-0000-0000-000000000004'),
  ('aaaaaaaa-0000-0000-0000-000000000007','Gustavo Chefe','chefe.sai@educacao.pmrp.sp.gov.br','chefe_secao',    '44444444-0000-0000-0000-000000000001'),
  ('aaaaaaaa-0000-0000-0000-000000000008','Helena Chefe','chefe.ssi@educacao.pmrp.sp.gov.br','chefe_secao',     '44444444-0000-0000-0000-000000000005'),
  ('aaaaaaaa-0000-0000-0000-000000000009','Igor Agente','agente.sai@educacao.pmrp.sp.gov.br','agente_administrativo','44444444-0000-0000-0000-000000000001'),
  ('aaaaaaaa-0000-0000-0000-000000000010','Júlia Agente','agente.sfo@educacao.pmrp.sp.gov.br','agente_administrativo','44444444-0000-0000-0000-000000000004'),
  ('aaaaaaaa-0000-0000-0000-000000000011','Kléber Admin','admin.ti@educacao.pmrp.sp.gov.br','admin_ti',         '33333333-0000-0000-0000-000000000004')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Tipos de demanda (só se a tabela estiver vazia).
-- ---------------------------------------------------------------------
insert into gestao.tipos_demanda (nome, descricao)
select v.nome, v.descricao
  from (values
    ('Reclamação','Manifestação de insatisfação de munícipe ou servidor'),
    ('Solicitação','Pedido de providência ou serviço'),
    ('Denúncia','Comunicação de irregularidade'),
    ('Requerimento','Pedido formal com base em direito'),
    ('Informação','Pedido de informação / esclarecimento'),
    ('Ofício','Comunicação oficial entre unidades')
  ) as v(nome, descricao)
 where not exists (select 1 from gestao.tipos_demanda);

-- ---------------------------------------------------------------------
-- Escolas fictícias (só se a tabela estiver vazia).
-- ---------------------------------------------------------------------
insert into gestao.escolas (nome, codigo_inep)
select v.nome, v.inep
  from (values
    ('EMEF Prof. João da Silva','35100001'),
    ('EMEF Maria Aparecida','35100002'),
    ('EMEI Pequeno Príncipe','35100003'),
    ('EMEI Cantinho Feliz','35100004'),
    ('EMEF Bairro Novo','35100005')
  ) as v(nome, inep)
 where not exists (select 1 from gestao.escolas);

-- ---------------------------------------------------------------------
-- Feriados 2026 — nacionais, estadual (SP) e municipais (Ribeirão Preto).
-- Móveis calculados a partir da Páscoa 2026 = 05/04.
-- ---------------------------------------------------------------------
insert into gestao.feriados (data, descricao, tipo) values
  ('2026-01-01','Confraternização Universal','nacional'),
  ('2026-02-16','Carnaval (segunda)','municipal'),
  ('2026-02-17','Carnaval (terça)','nacional'),
  ('2026-04-03','Sexta-feira Santa','nacional'),
  ('2026-04-21','Tiradentes','nacional'),
  ('2026-05-01','Dia do Trabalho','nacional'),
  ('2026-06-04','Corpus Christi','municipal'),
  ('2026-06-19','Aniversário de Ribeirão Preto','municipal'),
  ('2026-07-09','Revolução Constitucionalista','estadual'),
  ('2026-09-07','Independência do Brasil','nacional'),
  ('2026-10-12','Nossa Senhora Aparecida','nacional'),
  ('2026-11-02','Finados','nacional'),
  ('2026-11-15','Proclamação da República','nacional'),
  ('2026-11-20','Consciência Negra','nacional'),
  ('2026-12-25','Natal','nacional')
on conflict (data) do nothing;
