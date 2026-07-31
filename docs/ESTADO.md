# Estado do projeto

> Atualizado ao final de cada sessão do Claude Code. Máximo 40 linhas.
> Formato: o que está pronto, o que vem a seguir, decisões que não estão no código.

**Última atualização:** 2026-07-31 (Sessão 2)
**Fase atual:** 2 concluída e validada localmente — testes de aceite verdes; falta rodar no Supabase real.

## Concluído

- Sessão 1: banco (`sql/001`…`008`) — schema `gestao`, 16 tabelas, RLS, triggers, funções, seed.
- Sessão 2: `sql/999_testes.sql` — 13 critérios (seção 22); harness transacional (ROLLBACK), usuário via `request.jwt.claims`. Validado em PG16 local (shim de `auth`/`extensions`).
- Fix `007b`/`fn_encaminhar`: INSERT do ramo "encaminhar demanda" estava desalinhado (`demanda_id` recebia `d.titulo`) — nenhuma tarefa nascia de demanda.
- Fix `005`/`fn_pode_ver_tarefa` (critério 4): participante "simples" não vê tarefas irmãs; vê a própria e as descendentes (por ancestralidade). Autor/solicitante/responsável atual/chefia veem todas.

## Resultado da última rodada (999, local)

- 11 PASSOU · 2 IGNORADO (11 PDF/Sessão 10; 13 mobile/front) · 0 FALHOU.
- Smoke das funções fora do 999 (devolutiva, subtarefa, complementação, retomada, concluir/reabrir, inativar/reativar, retificação por chefia): 8/8 OK.

## Próximo passo

- Rodar `999_testes.sql` no Supabase real (lembrar: expor schema `gestao` em Settings → API).
- Sessão 3: autenticação (login Google, guarda de rota, bloqueio de domínio no banco).

## Decisões (não óbvias no código)

- Validação offline: `initdb` efêmero + shim (`auth.users`, `auth.uid()`, `extensions`, papéis) reproduz o Supabase para testar SQL sem o projeto.
- (S1) schema `gestao`; escopo por dados; escrita só via SECURITY DEFINER; anexos imutáveis; número por sequence anual (pode ter furos); janela de retificação fecha com movimentação posterior de terceiro.

## Pendências e dúvidas

- Timeline vs. critério 4: participante ainda vê movimentacoes de tarefas irmãs (via `fn_pode_ver_demanda`); o critério trata de tarefas. Escopar a timeline também? (a decidir)
- (S1) Numeração sem furos? Retificação por tarefa ou demanda? Chefe de Seção inativa da própria seção? Ressalva por qualquer participante? Tamanho máx. de upload do Solar?
