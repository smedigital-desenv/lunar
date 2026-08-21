-- =====================================================================
-- 1) CONFIRMA que a migração abortada não deixou resíduo.
--    Esperado: 0 em tudo.
-- =====================================================================
select 'demandas da migracao' as o, count(*) as qtd
  from gestao.demandas d
  join gestao.usuarios a on a.id = d.criado_por
 where a.email = 'dados.importados@educacao.pmrp.sp.gov.br'
union all
select 'tarefas da migracao', count(*)
  from gestao.tarefas t
  join gestao.usuarios a on a.id = t.criado_por
 where a.email = 'dados.importados@educacao.pmrp.sp.gov.br';

-- =====================================================================
-- 2) NOMES REAIS das unidades sob a Subsecretaria Pedagógica.
--    É daqui que sai o mapeamento das grafias da planilha.
-- =====================================================================
with recursive arvore as (
  select id, parent_id, nome, sigla, tipo, ativo, 0 as nivel
    from gestao.unidades_organizacionais
   where upper(unaccent(nome)) = upper(unaccent('SUBSECRETARIA PEDAGÓGICA'))
  union all
  select u.id, u.parent_id, u.nome, u.sigla, u.tipo, u.ativo, a.nivel + 1
    from gestao.unidades_organizacionais u
    join arvore a on u.parent_id = a.id
)
select nivel, tipo, sigla, nome, ativo,
       (select count(*) from gestao.usuarios x
         where x.unidade_id = arvore.id and x.ativo) as pessoas_ativas
  from arvore order by nivel, nome;

-- =====================================================================
-- 3) Qualquer unidade que lembre "Paulo Freire" / "Formação",
--    inclusive fora da Subsecretaria Pedagógica.
-- =====================================================================
select tipo, sigla, nome, ativo
  from gestao.unidades_organizacionais
 where unaccent(nome) ilike unaccent('%Freire%')
    or unaccent(nome) ilike unaccent('%Forma%')
 order by nome;
