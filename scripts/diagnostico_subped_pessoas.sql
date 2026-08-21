-- =====================================================================
-- Diagnóstico das 4 pessoas citadas na planilha da SUBPED.
-- Distingue: não cadastrada x inativa x grafia diferente.
-- Só leitura.
-- =====================================================================
set search_path = gestao, extensions, public;

-- 1) Busca por SOBRENOME, incluindo INATIVOS (a migração exige ativo).
select v.procurado,
       u.nome        as encontrado,
       u.ativo,
       u.perfil,
       o.nome        as unidade
  from (values ('VALERIA FERNANDES TURCI','TURCI'),
               ('ANDRE GOMES VENTURA GONCALVES','VENTURA'),
               ('GUILHERME MANTOVAN DE ALMEIDA','MANTOVAN'),
               ('FERNANDA MARIA DE OLIVEIRA','FERNANDA')
       ) as v(procurado, chave)
  left join gestao.usuarios u
    on unaccent(u.nome) ilike '%'||unaccent(v.chave)||'%'
  left join gestao.unidades_organizacionais o on o.id = u.unidade_id
 order by v.procurado, u.nome;

-- 2) Quantas pessoas existem, no total e ativas?
select count(*) as usuarios_total,
       count(*) filter (where ativo) as ativos
  from gestao.usuarios;

-- 3) Quem está lotado na Subsecretaria Pedagógica (para saber quem
--    poderia receber as tarefas dessas 4 pessoas).
select u.nome, u.perfil, u.ativo
  from gestao.usuarios u
  join gestao.unidades_organizacionais o on o.id = u.unidade_id
 where btrim(regexp_replace(upper(unaccent(translate(o.nome, '"''´`', ''))), '\s+', ' ', 'g'))
     = 'SUBSECRETARIA PEDAGOGICA'
 order by u.ativo desc, u.nome;
