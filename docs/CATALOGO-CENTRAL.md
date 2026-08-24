# Catálogo do lunar no Controle de Acesso CENTRAL

> Quais telas deste sistema existem no central, quem enxerga cada uma, e o
> script que registra o que estiver faltando.
>
> **Por que este arquivo existe:** o `ESTADO.md` acumulou três vezes a mesma
> pendência — "registrar a tela X no catálogo do central". A tela nasce aqui e
> é liberada lá, em outro projeto Supabase, por SQL colado à mão: nada no
> `git push` faz isso sozinho. Sem uma lista escrita, a cada tela nova alguém
> redescobre a matriz inteira.

## Como o central bloqueia uma tela

`central/acesso-sme.js` deriva o slug do **nome do arquivo sem `.html`**
(`telaAtual()`) e, se `can(slug, 'ver')` for falso, pinta "Você não tem
permissão para a tela X" no lugar da página.

Consequências que valem sempre:

- **Página nova = tela nova no catálogo.** Renomear um arquivo em `pages/`
  também é: o slug muda junto e o antigo deixa de valer.
- **Tela que não está no catálogo fica invisível para todo mundo** (menos o
  super admin da rede, que passa por cima). O `CLAUDE.md` do central chama
  isso de "tela nova nasce fechada", e é deliberado.
- **`pages/login.html` fica de fora de propósito.** Ela redireciona para
  `/central/login.html` antes de carregar qualquer script — nunca chega a
  consultar permissão. Cadastrá-la não teria efeito.

## O que o lunar NÃO usa do central

`pode_editar` e `pode_exportar`. Não há um único `data-perm` nem uma chamada a
`can(tela, 'editar')` neste repositório: quem autoriza ação é a RLS e as
funções `SECURITY DEFINER` do banco do lunar (regra 4 do `CLAUDE.md`). As
liberações abaixo gravam **só `pode_ver`** — as outras duas ficam `false`,
como faz o gatilho `trg_tela_nova_para_papeis` do central.

Marcar `pode_editar` no painel não libera nada e não tira nada; só confunde
quem for auditar depois.

## A matriz

Os papéis do lunar no central espelham `gestao.perfis` — mesmos seis códigos:
`agente_administrativo`, `chefe_secao`, `gerente`, `subsecretario`,
`gabinete`, `admin_ti`.

**A regra é a do sistema, não a do painel:** quando o lunar restringe uma
tela, a restrição vem de uma função do banco, e é ela que manda. Sem regra no
lunar, a tela é de todos os papéis — esconder no central o que o banco deixa
abrir só produz gente pedindo acesso ao que já podia usar.

| Tela (slug) | Página | Quem vê | Regra no lunar |
|---|---|---|---|
| `admin` | `pages/admin.html` | `admin_ti`, `gabinete` | `perfis.pode_administrar` (`fn_pode_administrar`) |
| `organograma` | `pages/organograma.html` | `admin_ti`, `gabinete` | `perfis.pode_gerir_organograma` (SQL 040) |
| `nova-licitacao` | `pages/nova-licitacao.html` | `gerente`, `subsecretario`, `gabinete`, `admin_ti` | `fn_lic_criar_processo` (SQL 041): escopo global **ou** nível ≥ `gerente` |
| `ajuda` | `pages/ajuda.html` | todos | — |
| `caixa-entrada` | `pages/caixa-entrada.html` | todos | — |
| `caixa-saida` | `pages/caixa-saida.html` | todos | — |
| `dashboard` | `pages/dashboard.html` | todos | — |
| `demanda` | `pages/demanda.html` | todos | — |
| `equipes` | `pages/equipes.html` | todos | ver é aberto; **alterar** exige admin (`fn_definir_equipe`, SQL 017) |
| `licitacoes` | `pages/licitacoes.html` | todos | — |
| `lista` | `pages/lista.html` | todos | — |
| `meus-processos` | `pages/meus-processos.html` | todos | — |
| `nova-demanda` | `pages/nova-demanda.html` | todos | — |
| `painel-licitacoes` | `pages/painel-licitacoes.html` | todos | — |
| `pesquisa` | `pages/pesquisa.html` | todos | — |
| `processo-licitacao` | `pages/processo-licitacao.html` | todos | ver é aberto; **registrar andamento** exige equipe ou admin (`fn_lic_pode_editar`, SQL 042) |

As três primeiras linhas são as únicas com recorte. Repare no padrão das duas
últimas: **a tela é aberta e a ação é fechada**. Fechar `equipes` ou
`processo-licitacao` no central tiraria a consulta de quem tem direito a ela
sem tirar poder nenhum de ninguém — a ação já estava barrada no banco.

## O script

SQL Editor do projeto **central** (não o do lunar). Ele é **idempotente e não
regride nada**: tudo é `where not exists`, então tela já cadastrada não é
renomeada e liberação já existente não é sobrescrita — inclusive as que
alguém tenha ajustado à mão no painel.

> O SQL Editor envolve o script inteiro numa transação: se algo falhar no
> meio, **nada** foi aplicado, mesmo que a mensagem de erro sugira o
> contrário.

### Pré-voo — o que já existe

```sql
-- Telas do lunar hoje no catálogo.
select t.ordem, t.slug, t.nome
  from telas t join sistemas s on s.id = t.sistema_id
 where s.slug = 'lunar' order by t.ordem, t.slug;

-- Papéis do lunar. Os slugs TÊM que bater com os da matriz acima: o passo 2
-- casa por slug, e um papel escrito de outro jeito é ignorado em silêncio.
select pa.id, pa.slug, pa.nome
  from papeis pa join sistemas s on s.id = pa.sistema_id
 where s.slug = 'lunar' order by pa.id;
```

### Passo 1 — cadastrar as telas que faltam

`ordem` só governa a ordem de exibição no painel; os valores altos deixam as
telas novas no fim da lista sem mexer nas antigas.

```sql
insert into public.telas (sistema_id, slug, nome, ordem)
select s.id, c.slug, c.nome, c.ordem
  from public.sistemas s
 cross join (values
   ('caixa-entrada',      'Caixa de entrada',        10),
   ('caixa-saida',        'Caixa de saída',          20),
   ('lista',              'Todos os processos',      30),
   ('demanda',            'Detalhe da demanda',      40),
   ('nova-demanda',       'Nova demanda',            50),
   ('pesquisa',           'Buscar',                  60),
   ('dashboard',          'Painel',                  70),
   ('equipes',            'Equipes',                 80),
   ('admin',              'Administração',           90),
   ('ajuda',              'Ajuda',                  100),
   ('organograma',        'Organograma',            110),
   ('meus-processos',     'Meus processos',         120),
   ('licitacoes',         'Licitações',             130),
   ('painel-licitacoes',  'Painel de licitações',   140),
   ('processo-licitacao', 'Processo de licitação',  150),
   ('nova-licitacao',     'Novo pedido de compra',  160)
 ) as c(slug, nome, ordem)
 where s.slug = 'lunar'
   and not exists (select 1 from public.telas t
                    where t.sistema_id = s.id and t.slug = c.slug);
```

### Passo 2 — liberar cada tela nos papéis

`null` na segunda coluna quer dizer **todos os papéis do sistema** — a lista
não é escrita à mão de propósito: se um papel for criado amanhã, o critério
continua certo sem alguém ter de lembrar de vir aqui.

```sql
insert into public.papel_permissoes
       (papel_id, tela_id, pode_ver, pode_editar, pode_exportar)
select pa.id, t.id, true, false, false
  from public.sistemas s
  join public.telas  t  on t.sistema_id  = s.id
  join public.papeis pa on pa.sistema_id = s.id
  join (values
   ('admin',              array['admin_ti','gabinete']::text[]),
   ('organograma',        array['admin_ti','gabinete']::text[]),
   ('nova-licitacao',     array['gerente','subsecretario','gabinete','admin_ti']::text[]),
   ('ajuda',              null::text[]),
   ('caixa-entrada',      null::text[]),
   ('caixa-saida',        null::text[]),
   ('dashboard',          null::text[]),
   ('demanda',            null::text[]),
   ('equipes',            null::text[]),
   ('licitacoes',         null::text[]),
   ('lista',              null::text[]),
   ('meus-processos',     null::text[]),
   ('nova-demanda',       null::text[]),
   ('painel-licitacoes',  null::text[]),
   ('pesquisa',           null::text[]),
   ('processo-licitacao', null::text[])
 ) as c(slug, papeis) on c.slug = t.slug
 where s.slug = 'lunar'
   and (c.papeis is null or pa.slug = any (c.papeis))
   and not exists (select 1 from public.papel_permissoes pp
                    where pp.papel_id = pa.id and pp.tela_id = t.id);
```

### Conferência

```sql
-- A matriz inteira, uma linha por tela.
select t.slug as tela,
       coalesce(string_agg(pa.slug, ', ' order by pa.slug)
                filter (where pp.pode_ver), '(ninguém)') as quem_ve
  from telas t
  join sistemas s on s.id = t.sistema_id and s.slug = 'lunar'
  left join papel_permissoes pp on pp.tela_id = t.id
  left join papeis pa on pa.id = pp.papel_id
 group by t.slug order by t.slug;
```

Compare com a tabela da matriz. Uma tela com `(ninguém)` não abre para
ninguém além do super admin — foi cadastrada e não liberada.

Se alguma linha vier **mais larga** que a matriz, o script não fez isso: ele
nunca amplia o que já existia. Veio de liberação anterior feita no painel, e
a correção é lá, com a matriz na mão.

### Por que quase ninguém precisa ser tocado individualmente

A liberação vai para o **papel**, não para a pessoa: quem já tem o papel
recebe a tela nova no próximo carregamento, sem nenhum cadastro. A exceção é
quem tiver linha em `perfil_tela` para aquela tela — exceção individual vence
o papel, inclusive para negar, e essa pessoa **não** acompanha a mudança:

```sql
-- Exceções individuais em telas do lunar. Idealmente, vazio.
select p.email, t.slug, pt.pode_ver
  from perfil_tela pt
  join telas t    on t.id = pt.tela_id
  join sistemas s on s.id = t.sistema_id and s.slug = 'lunar'
  join perfis p   on p.id = pt.perfil_id
 order by p.email, t.slug;
```

## Ao criar a próxima tela

1. Acrescente a página na tabela da matriz acima, com a regra do lunar que a
   restringe (ou um `—` se não houver).
2. Rode os passos 1 e 2 novamente. Eles só enxergam o que falta.
3. Confira com a consulta de conferência.

Não ligue `papeis.auto_novas_telas` para resolver isso de uma vez: a tela
passaria a aparecer no instante do cadastro, ainda em construção, para todo
mundo que tem o papel. O `CLAUDE.md` do central explica o alcance disso.
