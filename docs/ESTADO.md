# Estado do projeto

> Atualizado ao final de cada sessão do Claude Code. Máximo 40 linhas.
> Formato: o que está pronto, o que vem a seguir, decisões que não estão no código.

**Última atualização:** 2026-07-31 (Sessões 2 e 4)
**Fase atual:** Sessões 1 e 2 concluídas (banco validado). Sessão 4 (serviços) iniciada.

## Concluído

- Sessão 1 (`sql/001`…`008`) rodada e commitada (`d23aca7`, no GitHub).
- **Sessão 2: `sql/999_testes.sql` — todos os 13 critérios VERDES** (1–10 e 12 PASSOU; 11 PENDENTE=Sessão 10; 13 N/A=front). Roda em transação com ROLLBACK, `auth.uid()` simulado + `SET LOCAL ROLE`.
- `docs/SCHEMA.md` gerado e atualizado.
- Serviços (Sessão 4) criados: `js/services/` supabaseClient, demandas, tarefas, movimentacoes, anexos, notificacoes.

## Próximo passo

- Definir a próxima frente com o usuário. Autenticação (Sessão 3) **adiada a pedido** — não criar login/guarda por ora.
- Candidatas sem depender de auth: Sessão 5 (tela da demanda, padrão visual) usando dados de seed; completar serviços que faltam RPC (marcar notificação lida, comentar, admin) quando definirmos as funções.

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
