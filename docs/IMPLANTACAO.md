# Implantação — Sistema de Gestão de Demandas (SME Ribeirão Preto)

Passo a passo para publicar o sistema do zero. Siga na ordem. Ao final, use o
**checklist de verificação**. Regras invioláveis do `CLAUDE.md` valem aqui:
sem DELETE, escrita só por função `SECURITY DEFINER`, e a **`service_role key`
jamais é versionada nem vai ao front**.

> Convenções: o banco todo vive no schema `gestao`. O front é estático (HTML +
> ES modules + Bootstrap por CDN), sem build step. As Edge Functions são Deno.

---

## 1. Criar o projeto no Supabase

1. Em <https://supabase.com>, crie uma organização e um **New project**.
   - Region: `South America (São Paulo)`.
   - Guarde a senha do banco (Postgres) num cofre.
2. Em **Project Settings → API**, anote:
   - `Project URL` (ex.: `https://xxxx.supabase.co`);
   - `anon public` key (vai para o front);
   - `service_role` key (**NUNCA** no front nem no git — só em ambiente de servidor).
3. Em **Project Settings → API → Exposed schemas**, adicione `gestao` à lista
   (além de `public`), para que `from()`/`rpc()` enxerguem o schema.

---

## 2. Rodar os scripts SQL (na ordem)

No **SQL Editor** do Supabase (ou `psql`), execute **um a um, em ordem**:

```
sql/001_extensoes.sql
sql/002_tabelas.sql
sql/003_indices.sql
sql/004_funcoes_escopo.sql
sql/005_rls.sql
sql/006_triggers_imutabilidade_auditoria.sql
sql/007a_funcoes_apoio.sql
sql/007b_funcoes_criacao_tramitacao.sql
sql/007c_funcoes_edicao_ressalva.sql
sql/008_seed.sql
sql/009_dashboard_pesquisa.sql
sql/010_notificacoes.sql
sql/011_relatorios.sql
sql/012_auth_provisionamento.sql
sql/013_admin_usuarios.sql
```

> `sql/012` cria a **trava de domínio** em `auth.users` (trigger) e a função
> `fn_provisionar_usuario` (admin). O trigger é criado no schema `auth`; rode-o
> como `postgres`/dono do projeto (o SQL Editor do Supabase já roda com esse
> privilégio).

- `008_seed.sql` cria o organograma de exemplo, usuários fictícios, tipos de
  demanda, escolas e feriados do ano. Em produção, **substitua** pelo organograma
  real (passo 7) — o seed serve para validar antes da carga real.
- **Validação:** rode `sql/999_testes.sql`. Todos os critérios devem imprimir
  `PASSOU` (11=PDF e 13=mobile são verificados fora deste script).

---

## 3. Configurar o Google OAuth (login restrito ao domínio)

O acesso é por conta Google institucional **`@educacao.pmrp.sp.gov.br`**.

1. No **Google Cloud Console**: crie um projeto → **APIs & Services → OAuth
   consent screen** (tipo *Internal*, se o domínio for gerenciado) → **Credentials
   → Create OAuth client ID → Web application**.
   - **Authorized redirect URI:** `https://xxxx.supabase.co/auth/v1/callback`.
   - Anote **Client ID** e **Client secret**.
2. No Supabase: **Authentication → Providers → Google** → cole Client ID/Secret
   → **Enable**.
3. **Authentication → URL Configuration:** defina o **Site URL** (a URL do GitHub
   Pages, passo 6) e adicione-a às **Redirect URLs**.
4. **Trava de domínio (três camadas):**
   - Front (`js/auth.js`): recusa login cujo e-mail não termine em
     `@educacao.pmrp.sp.gov.br` e desloga.
   - `auth.users`: trigger `trg_bloquear_dominio` (de `sql/012`) barra a criação
     de qualquer conta fora do domínio.
   - `gestao.usuarios`: `CHECK` de domínio + `fn_provisionar_usuario` revalida.
5. **Provisionamento (login bloqueado até cadastro):** ter conta Google no
   domínio **não** dá acesso. É preciso uma linha em `gestao.usuarios` (perfil +
   unidade), criada por um **admin** via `fn_provisionar_usuario(auth_id, nome,
   perfil, unidade_id)`. Fluxo: a pessoa faz login uma vez (cria a conta em
   `auth.users`); um admin pega o `id` dela (Auth → Users) e chama a função. O
   **primeiro admin** vem do seed (`admin_ti`); em produção, semeie o admin real
   antes de liberar. Depois disso, o admin usa a tela **`pages/admin.html`**
   (link "Admin" no cabeçalho) para liberar contas pendentes e inativar/reativar
   usuários — sem mexer em SQL.
6. **Acesso de teste (e-mail/senha):** para testar sem configurar o Google OAuth,
   habilite **Authentication → Providers → Email** e use os usuários do seed
   (`secretario@…`, `agente.sai@…`, etc.; senha `dev-123456`). A tela de login
   tem a seção "Acesso de teste". Se o login por senha falhar (versões de GoTrue
   que exigem `auth.identities`), recrie os usuários de teste em **Auth → Add
   user** com o mesmo e-mail. **Remova/!inative os usuários de teste antes de
   produção.**

> Sem `js/config.js` preenchido, o front opera em *modo demonstração* (dados de
> exemplo) e não redireciona para o login. Com config real, as páginas internas
> exigem sessão e usuário provisionado.

---

## 4. Buckets de Storage e policies

Crie **dois buckets privados** em **Storage**:

1. **`anexos`** — arquivos das devolutivas/demandas (≤ 20 MB; tipos em
   `js/config.js → tiposAnexoPermitidos`).
2. **`relatorios`** — PDFs emitidos pela Edge Function (resumo e inteiro teor).

Policies (Storage → Policies), ambos **privados** (sem leitura anônima):

- **anexos — leitura:** permitir `SELECT` a `authenticated` apenas para objetos
  de demandas que o usuário pode ver (a checagem fina de acesso é feita nas
  funções/serviços; o bucket não deve ser público).
- **anexos — escrita:** o upload passa pelo fluxo de anexo do sistema; não
  habilite `INSERT` livre a `anon`.
- **relatorios:** **sem** policy para `anon`/`authenticated`. A Edge Function
  grava e lê usando a `service_role` (server-side). Assim o PDF do processo não
  fica exposto por URL pública — a autenticidade é conferida pelo **código de
  verificação** (passo 5).

---

## 5. Publicar as Edge Functions

Pré-requisito: [Supabase CLI](https://supabase.com/docs/guides/cli) e login
(`supabase login`); vincule o projeto com `supabase link --project-ref <ref>`.

Função **`relatorios`** (geração de PDF + validação pública):

```
supabase functions deploy relatorios --no-verify-jwt
```

- `--no-verify-jwt` é necessário porque a rota **GET** de validação é **pública**.
  A rota **POST** (emissão) valida a sessão por conta própria: usa o header
  `Authorization` do chamador para acessar os dados sob **RLS** e só então grava
  a emissão (`fn_emitir_relatorio`).
- **Segredos:** `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`
  já são injetados automaticamente pelo Supabase — **não** crie-os à mão nem os
  versione.
- URL pública de validação:
  `https://xxxx.supabase.co/functions/v1/relatorios?codigo=XXXX-XXXX-XXXX`.

---

## 6. Configurar o GitHub Pages (front)

1. Crie `js/config.js` a partir de `js/config.example.js` e preencha
   `SUPABASE_URL` e `SUPABASE_ANON_KEY`. **`js/config.js` está no `.gitignore`**
   e não pode ser versionado.
   - Para o GitHub Pages (site estático sem build), publique o `config.js` por um
     passo de CI que o gera a partir de *secrets* do repositório, ou hospede o
     front num ambiente onde o arquivo seja injetado. **Nunca** faça commit da
     anon key em texto claro se o repositório for público.
2. **Settings → Pages:** *Source* = branch (`main`) / pasta raiz. O site fica em
   `https://<org>.github.io/<repo>/`.
3. Página inicial: aponte para `pages/caixa-entrada.html` (ou crie um `index.html`
   que redirecione). Ajuste o **Site URL/Redirect** do Supabase (passo 3) para
   essa URL.

---

## 7. Cadastrar o organograma real

Antes de liberar aos usuários, substitua os dados de exemplo do seed:

1. **Unidades** (`unidades_organizacionais`): Gabinete → 3 subsecretarias →
   gerências → seções, via função `SECURITY DEFINER` de administração (perfil
   `admin_ti`). Nunca `INSERT` direto.
2. **Usuários:** um por servidor, com `perfil` e `unidade_id` corretos e e-mail
   no domínio institucional.
3. **Tipos de demanda**, **escolas** (com `codigo_inep`) e **feriados** do ano
   (municipais, estaduais e nacionais).
4. Inative (não apague) os registros fictícios do seed que não forem usados
   (`ativo = false` + motivo).

---

## 8. Checklist de verificação pós-implantação

- [ ] `sql/999_testes.sql` imprime **PASSOU** em todos os critérios aplicáveis.
- [ ] Schema `gestao` aparece em **Exposed schemas**.
- [ ] Login Google funciona **apenas** com `@educacao.pmrp.sp.gov.br`; outro
      domínio é recusado no front **e** no banco.
- [ ] Um usuário só enxerga demandas da sua unidade + descendentes (chefia) e as
      tarefas da sua subárvore (visibilidade estrita) — teste com dois perfis.
- [ ] Criar demanda gera número `DEM-AAAA-NNNNNN` pelo banco (nunca no front).
- [ ] Encaminhar/devolutiva/concluir geram **movimentação** e **notificação**; o
      sino mostra o contador e "marcar como lida" funciona.
- [ ] Tentar `UPDATE`/`DELETE` em `movimentacoes` (ou anexos/auditoria) é
      **bloqueado** por trigger.
- [ ] Dashboard e pesquisa respeitam o escopo do usuário (contadores/resultados
      filtrados por RLS).
- [ ] Emitir **relatório-resumo** e **inteiro teor**: PDF A4 com "Página X de Y",
      rodapé com hash + código + URL; grava linha em `relatorios_emitidos` e
      movimentação `emissao_relatorio`.
- [ ] Demanda `restrito`: versão **anonimizada** omite nomes de aluno/responsáveis
      e vem marcada como tal.
- [ ] A URL pública `/functions/v1/relatorios?codigo=...` valida o documento e
      exibe o hash para conferência.
- [ ] Buckets `anexos` e `relatorios` são **privados** (sem leitura anônima).
- [ ] `js/config.js` **não** está no repositório; `service_role` só no servidor.
- [ ] Uso em celular (mobile-first) OK nas telas principais.
