# Estado do projeto

> Atualizado ao final de cada sessão do Claude Code. Máximo 40 linhas.
> Formato: o que está pronto, o que vem a seguir, decisões que não estão no código.

**Última atualização:** 2026-07-31 (Sessões 2, 4 e 5)
**Fase atual:** Sessões 1, 2 e 5 concluídas. Sessão 4 (serviços) iniciada.

## Concluído

- Sessão 1 (`sql/001`…`008`) rodada e commitada (`d23aca7`, no GitHub).
- **Sessão 2: `sql/999_testes.sql` — 13 critérios VERDES** (1–10 e 12 PASSOU; 11 PENDENTE=Sessão 10; 13 N/A=front). `aa661c0` no GitHub.
- Serviços (Sessão 4): `js/services/` supabaseClient, demandas, tarefas, movimentacoes, anexos, notificacoes.
- **Sessão 5 (tela de referência):** `assets/css/app.css` (design system), `js/ui/componentes.js`, `pages/demanda.html`, `js/ui/demanda.js`. Renderização verificada no navegador com dados de exemplo (cabeçalho, árvore de subtarefas, timeline com retificação, ações por perfil).

## Próximo passo

- Autenticação (Sessão 3) **adiada a pedido**.
- A tela usa **dados de exemplo** (mock) até haver config/sessão; `carregarReal()` já faz import dinâmico dos serviços — a virada para dados reais é pontual quando a auth entrar. Faltam views/joins para trazer nomes (autor/responsável) e listagem de anexos ativos.
- Candidatas: Sessão 6 (caixas de entrada/saída, mesmo padrão), ou fechar lacunas de banco (marcar notificação lida, comentar, admin).

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
