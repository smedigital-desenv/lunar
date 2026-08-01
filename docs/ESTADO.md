# Estado do projeto

> Atualizado ao final de cada sessão do Claude Code. Máximo 40 linhas.
> Formato: o que está pronto, o que vem a seguir, decisões que não estão no código.

**Última atualização:** 2026-08-01 (Sessões 2, 4, 5, 6, 7, 8 e 9)
**Fase atual:** Sessões 1, 2, 5, 6, 7, 8 e 9 concluídas. Sessão 4 (serviços) em evolução.

> `sql/009_dashboard_pesquisa.sql` e `sql/010_notificacoes.sql` **executados no Supabase em 2026-08-01.**

## Concluído

- Sessão 1 (`sql/001`…`008`) rodada e commitada (`d23aca7`, no GitHub).
- **Sessão 2: `sql/999_testes.sql` — 13 critérios VERDES** (1–10 e 12 PASSOU; 11 PENDENTE=Sessão 10; 13 N/A=front). `aa661c0` no GitHub.
- Serviços (Sessão 4): `js/services/` supabaseClient, demandas, tarefas, movimentacoes, anexos, notificacoes.
- **Sessão 5 (tela de referência):** `assets/css/app.css` (design system), `js/ui/componentes.js`, `pages/demanda.html`, `js/ui/demanda.js`. Render verificado no navegador.
- **Sessão 6 (caixas):** `pages/caixa-entrada.html` + `pages/caixa-saida.html`, `js/ui/caixa.js` (filtros/paginação compartilhados), `caixa-entrada.js`/`caixa-saida.js`. Serviços `listarCaixaEntrada` (tarefas.js) e `listarCaixaSaida` (demandas.js). Filtros e paginação **verificados no navegador**.
- **Sessão 7 (modais de tramitação):** `js/ui/modais.js` (`abrirFormulario` declarativo) + `js/ui/acoes-demanda.js` (campos e execução de cada ação). Wired em `demanda.js`: barra de ações, "Devolver" nas tarefas, retificar/ressalva na timeline (retificar só na própria movimentação com janela aberta). Abertura, validação e submit-demo **verificados no navegador**.
- **Sessão 8 (painel e pesquisa):** `sql/009_dashboard_pesquisa.sql` (`fn_dashboard` e `fn_pesquisar_demandas`, SECURITY INVOKER → contadores/busca já filtrados por RLS; índice GIN em movimentacoes) — **aplicado no banco (2026-08-01)**. `js/services/painel.js`. `pages/dashboard.html`+`js/ui/dashboard.js` (KPIs, quebras por prioridade/setor/responsável, tempo médio) e `pages/pesquisa.html`+`js/ui/pesquisa.js` (busca tsvector + filtros + paginação). Estilos KPI adicionados ao `app.css`. Render e busca **verificados no navegador** (modo demo).
- **Sessão 9 (notificações):** `sql/010_notificacoes.sql` (`fn_marcar_notificacao_lida` e `fn_marcar_todas_notificacoes_lidas`, SECURITY DEFINER — a tabela segue sem UPDATE ao front) — **aplicado no banco (2026-08-01)**. `js/services/notificacoes.js` ganhou `marcarLida`/`marcarTodasLidas`. Widget `js/ui/notificacoes.js`: sino no cabeçalho com badge de não lidas, painel com lista (lida/não lida + data de leitura), marcação individual/total, clique navega p/ a demanda; **polling 60 s**; modo demo com exemplos. Sino montado nas 5 páginas (`app-header__sino`) e estilos no `app.css`. Badge, painel, marcar-todas e modo demo **verificados no navegador (mobile 390px)**. Notificações já são **criadas** pelas funções de tramitação (`sql/007b`).

## Próximo passo

- Autenticação (Sessão 3) **adiada a pedido**.
- Telas usam **dados de exemplo** até haver config/sessão; `carregarReal()`/`listarCaixa*` já prontos para a virada. `listarCaixa*` ainda **não testados com auth real** (usam `supabase.auth.getUser()` + `.range()`).
- Pendências de banco: views/joins p/ nomes (autor/responsável) na demanda e no `demandas(numero,titulo)` embutido; comentar, admin (faltam RPCs).
- Candidatas: Sessão 10 (relatórios PDF), Sessão 3 (autenticação, quando liberada) ou fechar lacunas de banco.

## Decisões do usuário aplicadas (2026-07-31)

- **Visibilidade ESTRITA por tarefa (critério 4):** novo `fn_acesso_demanda_base`; `fn_pode_ver_tarefa` recursivo por `parent_id` (própria subárvore, não vê irmãs); `fn_pode_ver_demanda` = base OU possui tarefa. Removido auto-participante em encaminhar/subtarefa (007b).
- **Janela de retificação por entidade (007c):** tarefa fecha por intervenção na própria tarefa; demanda fecha por intervenção na demanda.
- **Numeração:** mantida `sequence` por ano (furos raros aceitos).
- Teste 999 corrigido: bug C8 (variável uuid recebia texto) e limpeza no C7.

## Alertas

- Critérios 11 (PDF) e 13 (mobile) = PENDENTE/N/A (Sessões 10 e 5+).
- Serviços (Sessão 4) e alterações de RLS **não commitados** ainda.
- Lacunas de banco a preencher em sessões futuras: comentar, anexar direto à demanda (fora de devolutiva), CRUD admin de usuarios/unidades/tipos/feriados (S? — faltam RPCs), `fn_emitir_relatorio` (S10).
- `admin.js` e `relatorios.js` não criados (sem RPC de suporte ainda).

## Pendências e dúvidas em aberto (do projeto)

- Numeração sem furos? Janela de retificação por tarefa ou por demanda?
- Chefe de Seção pode inativar demandas da própria seção? (hoje: só gerente+)
- Ressalva por qualquer participante (hoje: sim) ou só autor/chefias?
- Tamanho máximo de upload do Solar (afeta inteiro teor com anexos mesclados).
