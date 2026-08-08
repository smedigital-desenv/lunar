# Estado do projeto

> Atualizado ao final de cada sessão do Claude Code. Máximo 40 linhas.
> Formato: o que está pronto, o que vem a seguir, decisões que não estão no código.

**Última atualização:** 2026-08-01 (Sessões 3, 9, 10 e 11)
**Fase atual:** Sessões 1–11 concluídas. Sessão 4 (serviços) em evolução.

> **Todos os SQL (`001`…`013` + seed) executados no Supabase** (confirmado pelo usuário, 2026-08-01).
> `js/config.js` **preenchido e versionado** (URL + anon key do projeto `iqldovwttomkjkoakosc`; anon é pública/protegida por RLS — service_role nunca). Removido do `.gitignore`.
> Falta p/ o real: habilitar provider Email; **rodar `sql/008b_corrige_seed_auth.sql`** (login por senha dava 500 — faltava `auth.identities` + tokens NULL nos usuários do seed); e/ou Google OAuth; publicar a Edge Function `relatorios` + bucket.
> **Testes:** roteiro em `docs/TESTES.md`.

## Concluído

- Sessão 1 (`sql/001`…`008`) rodada e commitada (`d23aca7`, no GitHub).
- **Sessão 2: `sql/999_testes.sql` — 13 critérios VERDES** (1–10 e 12 PASSOU; 11 PENDENTE=Sessão 10; 13 N/A=front). `aa661c0` no GitHub.
- Serviços (Sessão 4): `js/services/` supabaseClient, demandas, tarefas, movimentacoes, anexos, notificacoes.
- **Sessão 5 (tela de referência):** `assets/css/app.css` (design system), `js/ui/componentes.js`, `pages/demanda.html`, `js/ui/demanda.js`. Render verificado no navegador.
- **Sessão 6 (caixas):** `pages/caixa-entrada.html` + `pages/caixa-saida.html`, `js/ui/caixa.js` (filtros/paginação compartilhados), `caixa-entrada.js`/`caixa-saida.js`. Serviços `listarCaixaEntrada` (tarefas.js) e `listarCaixaSaida` (demandas.js). Filtros e paginação **verificados no navegador**.
- **Sessão 7 (modais de tramitação):** `js/ui/modais.js` (`abrirFormulario` declarativo) + `js/ui/acoes-demanda.js` (campos e execução de cada ação). Wired em `demanda.js`: barra de ações, "Devolver" nas tarefas, retificar/ressalva na timeline (retificar só na própria movimentação com janela aberta). Abertura, validação e submit-demo **verificados no navegador**.
- **Sessão 8 (painel e pesquisa):** `sql/009_dashboard_pesquisa.sql` (`fn_dashboard` e `fn_pesquisar_demandas`, SECURITY INVOKER → contadores/busca já filtrados por RLS; índice GIN em movimentacoes) — **aplicado no banco (2026-08-01)**. `js/services/painel.js`. `pages/dashboard.html`+`js/ui/dashboard.js` (KPIs, quebras por prioridade/setor/responsável, tempo médio) e `pages/pesquisa.html`+`js/ui/pesquisa.js` (busca tsvector + filtros + paginação). Estilos KPI adicionados ao `app.css`. Render e busca **verificados no navegador** (modo demo).
- **Sessão 9 (notificações):** `sql/010_notificacoes.sql` (`fn_marcar_notificacao_lida` e `fn_marcar_todas_notificacoes_lidas`, SECURITY DEFINER — a tabela segue sem UPDATE ao front) — **aplicado no banco (2026-08-01)**. `js/services/notificacoes.js` ganhou `marcarLida`/`marcarTodasLidas`. Widget `js/ui/notificacoes.js`: sino no cabeçalho com badge de não lidas, painel com lista (lida/não lida + data de leitura), marcação individual/total, clique navega p/ a demanda; **polling 60 s**; modo demo com exemplos. Sino montado nas 5 páginas (`app-header__sino`) e estilos no `app.css`. Badge, painel, marcar-todas e modo demo **verificados no navegador (mobile 390px)**. Notificações já são **criadas** pelas funções de tramitação (`sql/007b`).
- **Sessão 10 (relatórios PDF):** `sql/011_relatorios.sql` (`fn_dados_relatorio` com anonimização + anexos ativos; `fn_emitir_relatorio` grava `relatorios_emitidos` + movimentação `emissao_relatorio`; `fn_validar_relatorio` pública). Edge Function `supabase/functions/relatorios/index.ts` (Deno + pdf-lib): resumo e inteiro teor, A4, "Página X de Y", rodapé com hash SHA-256 + código + URL, versão anonimizada p/ sigilo restrito, upload ao bucket privado `relatorios` (service role), rota GET pública de validação (HTML/JSON). Serviço `js/services/relatorios.js`. Botões de emissão na barra de ações da `demanda.js` (aviso em demo). **Não testável aqui** (sem Supabase/Deno); render dos botões e aviso demo **verificados no navegador**.
- **Sessão 11 (implantação):** `docs/IMPLANTACAO.md` (Supabase, Google OAuth c/ domínio, ordem dos SQL, buckets `anexos`+`relatorios` privados, deploy da Edge Function, GitHub Pages, organograma real, checklist). Adicionado `.gitignore` (protege `js/config.js`).
- **Sessão 3 (autenticação):** `sql/012_auth_provisionamento.sql` (trigger de domínio em `auth.users` + `fn_provisionar_usuario` admin, idempotente). `js/config.js` (do exemplo, no `.gitignore`). `js/auth.js`: `loginGoogle` (OAuth c/ `hd`), `loginSenha` (teste), `logout`, `sessaoAtual`, `usuarioCorrente` (perfil+unidade via embedding PostgREST; recusa fora do domínio/não provisionado), `protegerRota`, `estaConfigurado`. `pages/login.html` + `js/ui/login.js` (Google + "acesso de teste" e-mail/senha; aviso demo). `js/ui/sessao.js`: guarda de rota + usuário/Sair no cabeçalho, com **import preguiçoso** do supabase (não quebra offline/demo). Slot `#usuario-sessao` + `iniciarSessao()` nas 5 páginas; estilos no `app.css`. **Decisão do usuário:** login bloqueado até admin provisionar; e-mail/senha habilitado p/ testes com os usuários do seed. Login demo, aviso e recuperação do dashboard **verificados no navegador (mobile)**.
- **Nova demanda (destrava testes):** o roteiro nunca previu tela de criação e o seed não traz demandas. Criados `pages/nova-demanda.html` + `js/ui/nova-demanda.js` (form: título/objeto obrigatórios, tipo/escola/responsável via `js/services/referencias.js`, pessoas envolvidas dinâmicas → `fn_criar_demanda`) e link "+ Nova" nas caixas. Verificado em demo.
- **Sessão 3 — Admin de usuários:** `sql/013_admin_usuarios.sql` (`fn_listar_contas_pendentes`, `fn_inativar_usuario`, `fn_reativar_usuario`, todas admin; inativar/reativar auditam). `js/services/admin.js`. `pages/admin.html` + `js/ui/admin.js`: libera contas pendentes (nome+perfil+unidade → `fn_provisionar_usuario`), inativa/reativa usuários, com modo demo. Link "Admin" no cabeçalho só p/ `pode_administrar` (RLS é o gate real). **Verificado no navegador (mobile)**.

- **Controle de acesso central (catálogo):** definido o cadastro do lunar no **central da rede** (`smedigital-desenv.github.io/central/`) — sistema `lunar`, 10 telas (slug = nome do arquivo sem `.html`; `login` fora), 6 papéis espelhando `gestao.perfis` e a matriz padrão ver/editar/exportar. O SQL do catálogo é **aplicado direto no SQL Editor do Supabase e não é versionado** (como o resto do esquema do central). **Só o catálogo**: nenhum usuário liberado — os vínculos reais são feitos em `/central/admin.html`. O front do lunar ainda **não** foi ligado ao central.

- **Fase 4 — login pelo central (código pronto, falta implantar):** `supabase/functions/central-bridge/index.ts` (valida JWT ES256 do central pelo JWKS, confere domínio + acesso ao sistema `lunar`, emite magic link local); `js/auth-central.js` (carrega `/central/config.js`+`acesso-sme.js`, troca token por sessão, guarda memorizada por página); `js/auth.js` delega `protegerRota()`/`logout()` — por isso `admin.js`, `equipes.js` e `sessao.js` ficaram sem alteração; `pages/login.html` redireciona a `/central/login.html`; `MODO_TESTE` volta a `false`. **SQL da fase (`fn_provisionar_super_admin`, `036`) não é versionado** — entregue na sessão, aplicar no SQL Editor. Passo a passo em `docs/IMPLANTACAO-CENTRAL.md`. **Nada testado com o central real** (sem acesso à rede aqui): validei a função no Postgres 16 local (4 casos) e a sintaxe dos módulos.
- **Decisão (Fase 4):** super admin do central com e-mail `@educacao` é provisionado como `admin_ti` no primeiro acesso, com auditoria — não existe administrador cadastrado no sistema hoje. Super admin fora do domínio **não entra**: o CHECK `chk_email_dominio` recusa a linha em `gestao.usuarios`.
- **⚠️ O projeto Supabase é COMPARTILHADO com outro sistema** (mesmo `iqldovwttomkjkoakosc`, esquemas separados; o do lunar é `gestao`). `auth.users` é comum: 104 contas no projeto para 11 usuários do lunar, e a lista de contas pendentes traz gente de outros sistemas. **Nunca criar objeto fora de `gestao` sem pensar nos vizinhos** — foi assim que `trg_bloquear_dominio` (sql/012), escrito para o lunar, passou a recusar cadastro de fornecedor de outro sistema (13 contas `@gmail.com` afetadas). Removido em `037`; a trava do lunar segue inteira nas outras camadas.

- **Fase 4 no ar (2026-08-07):** login pelo central funcionando em `smedigital.com.br/lunar/`. Super admin da rede entrou e foi provisionado como `admin_ti` automaticamente. Dois defeitos corrigidos na implantação: a guarda checava `window.AcessoSME` antes de ele existir (ele nasce no `montar()` do `acesso-sme.js`, depois do CDN), e as telas consultavam o banco antes da sessão existir — o que jogava tudo em modo demonstração. O segundo virou `aguardarSessao()` em `js/services/supabaseClient.js`, chamado no `rpc()` e nas 13 consultas diretas a tabelas.
- **Decisões de política (2026-08-07):** super admin do central recebe **todos** os sistemas da rede, sem cadastro (ajuste em `central/acesso-sme.js`, alinhando com o `can()`, que já dava acesso total às telas). Senhas dos 11 usuários do seed trocadas por valor aleatório — `MODO_TESTE = false` já tirava o caminho de login por senha, então a `dev-123456` num repositório público deixou de importar.

- **Organograma oficial no banco (2026-08-07, `038`):** 53 unidades ativas — 1 gabinete, 4 subsecretarias (Pedagógica; Gestão Administrativa, Financeira e Tecnológica; Licitações e Contratos; Alimentação Escolar, Logística e Materiais), 25 gerências e 23 seções, mais o Núcleo de Apoio Administrativo ligado ao Gabinete. As unidades cujo nome já batia com a realidade foram **reaproveitadas** (GAB, SUBPED, GEF, GEI, GRH, GTI, SAI, SAF), 4 renomeadas (SUBGAFT, CEI, SRP, SIE) e 3 fictícias inativadas com motivo (SUBPLAN → GPL → SES). Nada apagado (regra 1).
- **Seed de desenvolvimento desativado (2026-08-07):** os 11 usuários fictícios foram inativados em `gestao.usuarios` (com auditoria) e banidos em `auth.users`. Não aparecem em `fn_listar_contas_pendentes`, que exige ausência de linha em `usuarios`. O `037` removeu o `trg_bloquear_dominio` — ver o alerta do projeto compartilhado acima.
- **Titulares cadastrados (2026-08-07, `039`):** 52 pessoas do organograma, cada uma na unidade e no perfil corretos — 2 `gabinete`, 4 `subsecretario`, 24 `gerente`, 21 `chefe_secao`, 1 `admin_ti`. Contas criadas em `auth.users` com a receita do `008b` (tokens não-nulos + `auth.identities`), senha local aleatória: o login é o único da rede. Quem já existia foi mesclado pelo e-mail, preservando o UUID criado pela ponte. Padrão de e-mail: primeiro nome + último sobrenome, sem ponto nem acento. Sem titular: Gerência de Logística e Transporte e Núcleo de Apoio Administrativo.
- **Decisão de perfil (2026-08-07):** o perfil `gabinete` passou a ter `pode_administrar = true`. Secretário e Secretário Adjunto precisam da tela de Admin, mas **não** podem ser `admin_ti`: o `005_rls` barra esse perfil nas demandas com sigilo restrito, e o nível cairia de 5 para 3. Efeito colateral a lembrar: qualquer pessoa que receba o perfil `gabinete` passa a administrar o sistema.

## Próximo passo

- **Ligar o real:** rodar `sql/011`+`sql/012`+`sql/013`, preencher `js/config.js`, habilitar provider Email (login de teste com usuários do seed, senha `dev-123456`) e/ou Google OAuth, deploy da Edge Function `relatorios` + bucket. Aí as telas saem do modo demo.
- Telas usam **dados de exemplo** até haver config/sessão; `carregarReal()`/`listarCaixa*` já prontos. `listarCaixa*` e o fluxo autenticado ainda **não testados com Supabase real** (sem acesso ao `esm.sh`/banco aqui).
- Pendências de banco: views/joins p/ nomes (autor/responsável); comentar; CRUD admin de **unidades/tipos/escolas/feriados** (a admin de **usuários** já está pronta via `sql/013`+`admin.html`).
- **Implantar a Fase 4** (o código está pronto; falta o que só se faz no servidor): rodar o SQL `036`, habilitar o provider **Email** no Auth do lunar, publicar a Edge Function com `--no-verify-jwt`, e servir o sistema em `smedigital.com.br/lunar/` — **mesma origem do central**, senão não há SSO. Roteiro completo em `docs/IMPLANTACAO-CENTRAL.md`.
- `js/ui/login.js` ficou **fora de uso** (a página virou redirecionamento). Mantido de propósito: é a única interface de login própria que existe.
- **Antes de produção:** inativar os usuários do `sql/008_seed.sql` (senha `dev-123456`).

## Decisões do usuário aplicadas (2026-07-31)

- **Visibilidade ESTRITA por tarefa (critério 4):** novo `fn_acesso_demanda_base`; `fn_pode_ver_tarefa` recursivo por `parent_id` (própria subárvore, não vê irmãs); `fn_pode_ver_demanda` = base OU possui tarefa. Removido auto-participante em encaminhar/subtarefa (007b).
- **Janela de retificação por entidade (007c):** tarefa fecha por intervenção na própria tarefa; demanda fecha por intervenção na demanda.
- **Numeração:** mantida `sequence` por ano (furos raros aceitos).
- Teste 999 corrigido: bug C8 (variável uuid recebia texto) e limpeza no C7.

## Alertas

- Critério 11 (PDF): implementado na Sessão 10, mas **validar com deploy real** (hash é do conteúdo canônico, não dos bytes do PDF — decisão para evitar circularidade com o hash impresso no rodapé). Critério 13 (mobile) OK nas telas principais.
- Lacunas de banco a preencher em sessões futuras: comentar, anexar direto à demanda (fora de devolutiva), CRUD admin de usuarios/unidades/tipos/feriados (S? — faltam RPCs).
- `admin.js` não criado (sem RPC de suporte ainda). `relatorios.js` criado (S10).

## Pendências e dúvidas em aberto (do projeto)

- Numeração sem furos? Janela de retificação por tarefa ou por demanda?
- Chefe de Seção pode inativar demandas da própria seção? (hoje: só gerente+)
- Ressalva por qualquer participante (hoje: sim) ou só autor/chefias?
- Tamanho máximo de upload do Solar (afeta inteiro teor com anexos mesclados).
