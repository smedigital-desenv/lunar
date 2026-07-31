# Estado do projeto

> Atualizado ao final de cada sessão do Claude Code. Máximo 40 linhas.
> Formato: o que está pronto, o que vem a seguir, decisões que não estão no código.

**Última atualização:** 2026-07-31 (Sessão 2)
**Fase atual:** 2 em andamento — testes de aceite escritos e validados em Postgres local.

## Concluído

- Sessão 1: banco (`sql/001`…`008`) — schema `gestao`, 16 tabelas, RLS, triggers, funções, seed.
- Sessão 2: `sql/999_testes.sql` — 13 critérios (seção 22); harness transacional (ROLLBACK), usuário simulado via `request.jwt.claims`. Validado em PG16 local (shim de `auth`/`extensions`).
- Correção `007b`/`fn_encaminhar`: INSERT do ramo "encaminhar demanda" estava desalinhado (`demanda_id` recebia `d.titulo`) — nenhuma tarefa nascia de demanda. Corrigido e revalidado.

## Resultado da última rodada (999, local)

- 10 PASSOU · 2 IGNORADO (11 PDF/Sessão 10; 13 mobile/front) · 1 FALHOU (critério 4).

## Próximo passo

- Decidir o critério 4 (ver pendências); depois rerodar 999 no Supabase real.
- Sessão 3: autenticação (login Google, guarda de rota, bloqueio de domínio no banco).

## Decisões (não óbvias no código)

- Validação offline: `initdb` efêmero + shim (`auth.users`, `auth.uid()`, `extensions`, papéis) reproduz o Supabase para testar SQL sem o projeto.
- (S1) schema `gestao`; escopo por dados; escrita só via SECURITY DEFINER; anexos imutáveis; número por sequence anual (pode ter furos); janela de retificação fecha com movimentação posterior de terceiro.

## Pendências e dúvidas

- **Critério 4 (decisão de produto):** receber subtarefa chama `fn_garantir_participante` → usuário vira participante da demanda → `fn_pode_ver_demanda` libera todas as tarefas (inclui irmãs); a ESPEC pede isolamento. Opções: (a) responsável de subtarefa não vira participante pleno; (b) `fn_pode_ver_tarefa` restringe papel 'participante' ao próprio ramo; (c) aceitar visão plena e ajustar o critério.
- (S1) Numeração sem furos? Retificação por tarefa ou demanda? Chefe de Seção inativa da própria seção? Ressalva por qualquer participante? Tamanho máx. de upload do Solar?
