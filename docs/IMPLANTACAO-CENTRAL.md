# Implantação — Controle de Acesso central (Fase 4)

> Passo a passo para ligar este sistema ao Controle de Acesso central da rede
> (`smedigital.com.br/central/`). O código já está pronto; o que falta é
> configuração de servidor, e nada disso pode ser feito a partir do repositório.
>
> **Os arquivos `.sql` não são versionados neste projeto.** O SQL desta fase
> (`fn_provisionar_super_admin`) foi entregue na sessão do Claude Code e deve
> ser colado direto no SQL Editor do Supabase, como o restante do esquema.

## ⚠️ O projeto Supabase é compartilhado

Este sistema **não tem projeto Supabase só dele**. O projeto
`iqldovwttomkjkoakosc` (que no painel aparece com o nome de outro sistema)
hospeda mais de um sistema, cada um no seu esquema; o do lunar é `gestao`.

Duas consequências que valem para sempre:

- **`auth.users` é comum a todos.** A contagem de contas ali não diz nada
  sobre quantas pessoas usam este sistema — em fevereiro/2026 eram 104 contas
  no projeto para 11 usuários em `gestao.usuarios`. A lista de "contas
  pendentes" de `pages/admin.html` inclui gente de outros sistemas.
- **Qualquer trigger em `auth.users` afeta os outros sistemas.** Foi o que
  aconteceu com `trg_bloquear_dominio` (sql/012): escrito para o lunar,
  passou a recusar o cadastro de contas fora do domínio no projeto inteiro,
  inclusive fornecedores de outro sistema. Removido por isso.

A trava de domínio do lunar continua inteira sem ele: o CHECK
`chk_email_dominio` em `gestao.usuarios`, a validação em
`fn_provisionar_usuario` e em `fn_provisionar_super_admin`, e a recusa na
própria `central-bridge` antes de criar a conta. Conta fora do domínio pode
existir no projeto; usuária do lunar, não.

**Antes de escrever qualquer objeto fora do esquema `gestao`, pense se ele
não vai atingir os vizinhos.**

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

Não é preciso configurar segredo nenhum: `SUPABASE_URL` e
`SUPABASE_SERVICE_ROLE_KEY` já existem no ambiente das funções. A
`service_role` nunca é versionada (regra 10).

O `verify_jwt = false` já está fixado em `supabase/config.toml`, junto com o
motivo. Fixar ali é melhor do que passar a flag na linha de comando: a flag
vale só para aquele deploy, e o próximo publicado por outra pessoa voltaria ao
padrão, quebrando o login sem aviso.

### Caminho A — Supabase CLI (recomendado)

Uma vez por máquina:

```bash
npm install -g supabase          # ou: brew install supabase/tap/supabase
supabase login                   # abre o navegador
```

Na raiz do repositório do LUNAR:

```bash
supabase link --project-ref iqldovwttomkjkoakosc
supabase functions deploy central-bridge
```

O `link` pede a senha do banco — é a que foi definida quando o projeto foi
criado (Settings → Database → *Database password*; dá para redefinir ali sem
perder dados).

O deploy lê o `config.toml`, então **não precisa** de `--no-verify-jwt`. Se a
sua versão do CLI for antiga e ignorar o arquivo, acrescente a flag:

```bash
supabase functions deploy central-bridge --no-verify-jwt
```

### Caminho B — pelo painel, sem instalar nada

Dashboard → **Edge Functions** → *Deploy a new function* → *Via editor*.

1. Nome exatamente `central-bridge` (o front chama esse caminho).
2. Cole o conteúdo de `supabase/functions/central-bridge/index.ts`.
3. **Desligue "Verify JWT"** antes de publicar. Se publicar com ele ligado,
   volte em *Function settings* e desligue depois — sem isso nada funciona.

### Conferir se subiu certo

```bash
curl -i -X POST \
  'https://iqldovwttomkjkoakosc.supabase.co/functions/v1/central-bridge' \
  -H 'Content-Type: application/json' -d '{}'
```

O esperado é **401 com o corpo `{"erro":"sem_token"}`**. Parece erro, mas é o
resultado certo: a requisição chegou até a função, que recusou por falta de
token. Isso prova as duas coisas de uma vez — a função está publicada e o
`verify_jwt` está desligado.

Como distinguir os dois 401 possíveis:

| Corpo da resposta | O que significa |
|---|---|
| `{"erro":"sem_token"}` | ✅ tudo certo — a função rodou |
| `{"code":401,"message":"Missing authorization header"}` | ❌ `verify_jwt` ainda ligado; parou no gateway |
| `404` | ❌ função não publicada, ou nome diferente de `central-bridge` |

Para conferir o preflight de CORS, que é o que o navegador faz antes do POST:

```bash
curl -i -X OPTIONS \
  'https://iqldovwttomkjkoakosc.supabase.co/functions/v1/central-bridge' \
  -H 'Origin: https://smedigital.com.br' \
  -H 'Access-Control-Request-Method: POST'
```

Tem que voltar **200**, com `Access-Control-Allow-Origin: https://smedigital.com.br`.
Se voltar 401, o `verify_jwt` continua ligado.

### Se precisar investigar

Dashboard → Edge Functions → `central-bridge` → **Logs**. Todo erro da função
sai com um código curto (`token_invalido`, `sem_acesso_ao_lunar`,
`falha_ao_gerar_sessao`), e o provisionamento do super admin, quando falha,
escreve `provisionamento do super admin falhou:` seguido da mensagem do banco.

## Passo 4 — Publicar o sistema na mesma origem do central

O sistema precisa responder em **`https://smedigital.com.br/lunar/`**.

Mesma origem é requisito, não preferência:

- o `acesso-sme.js` é carregado de `/central/` por caminho absoluto;
- a sessão do central fica em `localStorage` da origem — em outro domínio, o
  SSO simplesmente não existe;
- o CORS da `central-bridge` libera só `https://smedigital.com.br`.

### Como o endereço se resolve sozinho

`smedigital.com.br` é o domínio personalizado da **conta**, configurado no
repositório `smedigital-desenv.github.io`. O GitHub Pages serve o Pages de
cada repositório em `<domínio-da-conta>/<nome-do-repositório>/`. É assim que
`/mapa-sme/` e `/gom-sme/` chegam lá — cada um publica o próprio repositório
por GitHub Actions.

Como este repositório se chama **`lunar`**, ele cai em
`https://smedigital.com.br/lunar/` sem nenhuma configuração de domínio, e a
mesma origem do `/central/` vem de graça.

> Não crie `CNAME` neste repositório. O domínio pertence ao
> `smedigital-desenv.github.io`; um `CNAME` aqui brigaria com ele.

### O que fazer

O workflow já está no repositório: `.github/workflows/deploy-pages.yml`.
Falta só ligar o Pages, uma vez:

**Settings → Pages → Source: `GitHub Actions`.**

A partir daí, todo push na `main` publica. Para publicar sem esperar um push,
use a aba **Actions → Publicar no GitHub Pages → Run workflow**.

O workflow **não publica** `sql/`, `supabase/`, `docs/` nem o `CLAUDE.md`.
Isso importa: servido, o `sql/008_seed.sql` ficaria legível por qualquer um em
`https://smedigital.com.br/lunar/sql/008_seed.sql`, com os usuários de teste
lá dentro. Ao acrescentar pasta nova de conteúdo de servidor, lembre de
excluí-la também.

### Conferir

Depois do primeiro deploy, `https://smedigital.com.br/lunar/pages/caixa-entrada.html`
deve carregar. Sem sessão no central, o esperado é ser levado para
`/central/login.html` — isso já é o controle de acesso funcionando.

Confira também que `https://smedigital.com.br/lunar/sql/008_seed.sql`
devolve **404**. Se devolver o arquivo, o `rsync` do workflow não excluiu o
que devia.

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
> provisionamento. O administrador da rede é `desenvsme@educacao.pmrp.sp.gov.br`,
> que já é do domínio — antes a administração saía de uma conta `@gmail.com`,
> que passava no central mas era barrada aqui.
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
