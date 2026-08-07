# Implantação — Controle de Acesso central (Fase 4)

> Passo a passo para ligar este sistema ao Controle de Acesso central da rede
> (`smedigital.com.br/central/`). O código já está pronto; o que falta é
> configuração de servidor, e nada disso pode ser feito a partir do repositório.
>
> **Os arquivos `.sql` não são versionados neste projeto.** O SQL desta fase
> (`fn_provisionar_super_admin`) foi entregue na sessão do Claude Code e deve
> ser colado direto no SQL Editor do Supabase, como o restante do esquema.

## Como o acesso passa a funcionar

```
navegador → /central/login.html  (Google, projeto CENTRAL)
              ↓ token do central
          central-bridge  (Edge Function, projeto do LUNAR)
              ↓ valida assinatura + domínio + acesso ao sistema 'lunar'
              ↓ emite magic link e devolve o token_hash
          sessão local  → auth.uid() volta a funcionar → RLS decide os dados
```

Três camadas, e é importante não confundi-las:

| Camada | Onde mora | Decide |
|---|---|---|
| Telas | central (`perfil_tela`) | quais páginas aparecem |
| Sessão | `central-bridge` | se a pessoa entra |
| Dados | RLS de `gestao.usuarios` | quais linhas ela vê |

**A RLS continua sendo a autorização real.** O central nunca amplia o que a
pessoa pode ver; ele só esconde telas. Liberar uma tela no painel não dá
acesso a nenhum dado — para isso é preciso perfil e unidade em
`gestao.usuarios`.

---

## Passo 1 — Rodar o SQL no projeto do LUNAR

SQL Editor do projeto `iqldovwttomkjkoakosc` → colar o bloco entregue na
sessão (`fn_provisionar_super_admin`) → **Run**.

Os dois `SELECT` de conferência ao final devem mostrar:

- a função existe e é `security_definer = t`;
- **apenas `service_role`** pode executá-la.

Se `authenticated` aparecer na segunda lista, **pare**: qualquer sessão
conseguiria se promover a administrador.

### Pré-requisito: unidade raiz

A função precisa de um gabinete raiz (`tipo = 'gabinete'`, `parent_id is null`,
`ativo`) para preencher `usuarios.unidade_id`, que é `not null`. Confira:

```sql
select id, nome, sigla from gestao.unidades_organizacionais
 where tipo = 'gabinete' and parent_id is null and ativo;
```

Sem nenhuma linha, o primeiro login do administrador falha com mensagem
explícita. O `sql/008_seed.sql` cria o organograma completo.

## Passo 2 — Habilitar o provider Email

Authentication → Providers → **Email** → Enable, no projeto do LUNAR.

Não é para as pessoas digitarem senha: a ponte usa **magic link**, e o
Supabase só gera magic link se o provider Email estiver ligado. Sem isso todo
login falha em `falha_ao_gerar_sessao`.

## Passo 3 — Publicar a Edge Function

```bash
supabase functions deploy central-bridge --no-verify-jwt
```

O `--no-verify-jwt` **não é opcional**. O token que chega é do projeto
CENTRAL; com a verificação embutida ligada, o Supabase o rejeita antes de a
função rodar, e o erro não diz o motivo.

Não é preciso configurar segredo nenhum: `SUPABASE_URL` e
`SUPABASE_SERVICE_ROLE_KEY` já existem no ambiente das funções. A
`service_role` nunca é versionada (regra 10).

## Passo 4 — Publicar o sistema na mesma origem do central

O sistema precisa responder em **`https://smedigital.com.br/lunar/`**.

Mesma origem é requisito, não preferência:

- o `acesso-sme.js` é carregado de `/central/` por caminho absoluto;
- a sessão do central fica em `localStorage` da origem — em outro domínio, o
  SSO simplesmente não existe;
- o CORS da `central-bridge` libera só `https://smedigital.com.br`.

Publicar em `smedigital-desenv.github.io/lunar/` **não funciona**. Replique o
que já é feito para `/mapa-sme/`.

## Passo 5 — Cadastrar as pessoas no central

Em `https://smedigital.com.br/central/admin.html`:

1. **Usuários** — cadastre o e-mail (allowlist) e deixe ativo.
2. **Acessos por tela** — sistema *Demandas SME* + a pessoa → aplique o papel
   correspondente (`gerente`, `chefe_secao`, …).
3. **Ver como** — confira as telas liberadas antes de avisar a pessoa.

> O botão "Abrir portal simulando este usuário" **não funciona** — o
> `index.html` do portal ignora a simulação. Use o botão **Ver**, que mostra a
> árvore de permissões na própria tela.

## Passo 6 — Primeiro acesso do administrador

Quem é **super admin no central** e tem e-mail `@educacao.pmrp.sp.gov.br`
entra e é provisionado automaticamente como `admin_ti`, com auditoria. É assim
que se resolve o ovo e a galinha: não existe nenhum administrador cadastrado
neste sistema hoje.

A partir daí, esse administrador cadastra os demais em `pages/admin.html`
(perfil + unidade), usando a lista de contas pendentes.

> ⚠️ **Super admin com e-mail fora do domínio não entra.** São três camadas
> que barram: o trigger `trg_bloquear_dominio` em `auth.users`, o CHECK
> `chk_email_dominio` na tabela `usuarios` e a validação nas funções de
> provisionamento. `desenv.sme@gmail.com` administra o central, mas precisa de
> uma conta `@educacao.pmrp.sp.gov.br` para usar o sistema de Demandas.
> Mudar isso significa alterar as três camadas — é decisão de segurança, não
> ajuste de configuração.

---

## Como testar

Ordem que isola o erro quando algo falha:

1. `smedigital.com.br/central/login.html` → entre com a conta institucional.
2. No portal, o card **Demandas SME** deve aparecer.
3. Clique. Você deve cair na caixa de entrada, já autenticado, com seu nome e
   perfil no cabeçalho.
4. Abra uma tela que o seu papel **não** tem no central. Deve aparecer
   "Você não tem permissão para a tela …". Esse é o gate do central.
5. Entre com alguém sem cadastro em `gestao.usuarios`. Deve aparecer
   "Cadastro pendente" — sessão aberta, nenhum dado. Esse é o gate da RLS.

### Mensagens de erro e o que significam

| Mensagem | Onde olhar |
|---|---|
| "não pertence ao domínio" | conta fora de `@educacao.pmrp.sp.gov.br` |
| "não tem acesso ao sistema de Demandas" | falta liberar no painel do central |
| "Cadastro pendente" | falta a linha em `gestao.usuarios` (`pages/admin.html`) |
| "Você não tem permissão para a tela X" | falta marcar a tela no `perfil_tela` |
| `falha_ao_gerar_sessao` | provider Email desligado (passo 2) |
| `token_invalido` | função publicada **sem** `--no-verify-jwt` (passo 3) |

## Desenvolvimento local

Com `js/config.js` preenchido, a guarda exige o central em `/central/` — que
não existe no servidor local deste repositório. Duas saídas:

- **Modo demo:** deixe a config vazia. As telas seguem com dados de exemplo,
  sem tocar o banco. É o caminho normal para mexer em layout.
- **Ambiente completo:** sirva os dois repositórios sob a mesma raiz, para que
  `/central/` e `/lunar/` respondam no mesmo host.

O `MODO_TESTE` do `config.js` (barra "Testar como…") está **false no
repositório** e deve continuar assim. Ligado, ele é um login por senha que
atravessa o controle de acesso inteiro — serve para a sua cópia local, nunca
para o ar.

## O que esta fase não faz

- Não muda nenhuma policy de RLS nem função de negócio.
- Não cadastra ninguém: quem cria a linha em `gestao.usuarios` continua sendo
  um administrador, por `fn_provisionar_usuario`. A única exceção é o super
  admin da rede, descrita no passo 6.
- Não remove o `sql/008_seed.sql`. Se o banco for de produção, os usuários de
  teste com senha `dev-123456` **precisam ser inativados** antes de publicar.
