# Estado do projeto

> Atualizado ao final de cada sessão do Claude Code. Máximo 40 linhas.
> Formato: o que está pronto, o que vem a seguir, decisões que não estão no código.

**Última atualização:** 2026-08-01 (Sessões 3, 9, 10 e 11)
**Fase atual:** Sessões 1–11 concluídas. Sessão 4 (serviços) em evolução.

> `sql/009` e `sql/010` **executados no Supabase em 2026-08-01.**
> ATENÇÃO (ainda não feito): rodar `sql/011_relatorios.sql` e `sql/012_auth_provisionamento.sql`; publicar a Edge Function `relatorios` (`--no-verify-jwt`) + bucket privado `relatorios`; preencher `js/config.js`; habilitar provider Email (login de teste) e/ou Google OAuth.

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
- **Sessão 3 — Admin de usuários:** `sql/013_admin_usuarios.sql` (`fn_listar_contas_pendentes`, `fn_inativar_usuario`, `fn_reativar_usuario`, todas admin; inativar/reativar auditam). `js/services/admin.js`. `pages/admin.html` + `js/ui/admin.js`: libera contas pendentes (nome+perfil+unidade → `fn_provisionar_usuario`), inativa/reativa usuários, com modo demo. Link "Admin" no cabeçalho só p/ `pode_administrar` (RLS é o gate real). **Verificado no navegador (mobile)**.

## Próximo passo

- **Ligar o real:** rodar `sql/011`+`sql/012`+`sql/013`, preencher `js/config.js`, habilitar provider Email (login de teste com usuários do seed, senha `dev-123456`) e/ou Google OAuth, deploy da Edge Function `relatorios` + bucket. Aí as telas saem do modo demo.
- Telas usam **dados de exemplo** até haver config/sessão; `carregarReal()`/`listarCaixa*` já prontos. `listarCaixa*` e o fluxo autenticado ainda **não testados com Supabase real** (sem acesso ao `esm.sh`/banco aqui).
- Pendências de banco: views/joins p/ nomes (autor/responsável); comentar; CRUD admin de **unidades/tipos/escolas/feriados** (a admin de **usuários** já está pronta via `sql/013`+`admin.html`).

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
