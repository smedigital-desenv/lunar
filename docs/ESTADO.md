# Estado do projeto

> Atualizado ao final de cada sessão do Claude Code. Máximo 40 linhas.
> Formato: o que está pronto, o que vem a seguir, decisões que não estão no código.

**Última atualização:** 2026-07-31 (Sessões 2, 4, 5, 6 e 7)
**Fase atual:** Sessões 1, 2, 5, 6 e 7 concluídas. Sessão 4 (serviços) em evolução.

## Concluído

- Sessão 1 (`sql/001`…`008`) rodada e commitada (`d23aca7`, no GitHub).
- **Sessão 2: `sql/999_testes.sql` — 13 critérios VERDES** (1–10 e 12 PASSOU; 11 PENDENTE=Sessão 10; 13 N/A=front). `aa661c0` no GitHub.
- Serviços (Sessão 4): `js/services/` supabaseClient, demandas, tarefas, movimentacoes, anexos, notificacoes.
- **Sessão 5 (tela de referência):** `assets/css/app.css` (design system), `js/ui/componentes.js`, `pages/demanda.html`, `js/ui/demanda.js`. Render verificado no navegador.
- **Sessão 6 (caixas):** `pages/caixa-entrada.html` + `pages/caixa-saida.html`, `js/ui/caixa.js` (filtros/paginação compartilhados), `caixa-entrada.js`/`caixa-saida.js`. Serviços `listarCaixaEntrada` (tarefas.js) e `listarCaixaSaida` (demandas.js). Filtros e paginação **verificados no navegador**.
- **Sessão 7 (modais de tramitação):** `js/ui/modais.js` (`abrirFormulario` declarativo) + `js/ui/acoes-demanda.js` (campos e execução de cada ação). Wired em `demanda.js`: barra de ações, "Devolver" nas tarefas, retificar/ressalva na timeline (retificar só na própria movimentação com janela aberta). Abertura, validação de obrigatórios e submit-demo **verificados no navegador**. Em modo demo o submit só confirma por toast; em modo real chama a RPC e recarrega.

## Próximo passo

- Autenticação (Sessão 3) **adiada a pedido**.
- Telas usam **dados de exemplo** até haver config/sessão; `carregarReal()`/`listarCaixa*` já prontos para a virada. `listarCaixa*` ainda **não testados com auth real** (usam `supabase.auth.getUser()` + `.range()`).
- Pendências de banco: views/joins p/ nomes (autor/responsável) na demanda e no `demandas(numero,titulo)` embutido; marcar notificação lida, comentar, admin (faltam RPCs).
- Candidatas: Sessão 7 (modais de tramitação — envio real dos botões), Sessão 8 (dashboard/pesquisa) ou fechar lacunas de banco.

## Decisões do usuário aplicadas (2026-07-31)

- **Visibilidade ESTRITA por tarefa (critério 4):** novo `fn_acesso_demanda_base`; `fn_pode_ver_tarefa` recursivo por `parent_id` (própria subárvore, não vê irmãs); `fn_pode_ver_demanda` = base OU possui tarefa. Removido auto-participante em encaminhar/subtarefa (007b).
- **Janela de retificação por entidade (007c):** tarefa fecha por intervenção na própria tarefa; demanda fecha por intervenção na demanda.
- **Numeração:** mantida `sequence` por ano (furos raros aceitos).
- Teste 999 corrigido: bug C8 (variável uuid recebia texto) e limpeza no C7.

## Alertas

- Critérios 11 (PDF) e 13 (mobile) = PENDENTE/N/A (Sessões 10 e 5+).
- Serviços (Sessão 4) e alterações de RLS **não commitados** ainda.
- Lacunas de banco a preencher em sessões futuras: marcar notificação lida (S9), comentar, anexar direto à demanda (fora de devolutiva), CRUD admin de usuarios/unidades/tipos/feriados (S? — faltam RPCs), `fn_emitir_relatorio` (S10).
- `admin.js` e `relatorios.js` não criados (sem RPC de suporte ainda).

## Pendências e dúvidas em aberto (do projeto)

- Numeração sem furos? Janela de retificação por tarefa ou por demanda?
- Chefe de Seção pode inativar demandas da própria seção? (hoje: só gerente+)
- Ressalva por qualquer participante (hoje: sim) ou só autor/chefias?
- Tamanho máximo de upload do Solar (afeta inteiro teor com anexos mesclados).
