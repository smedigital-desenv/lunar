# Estado do projeto

> Atualizado ao final de cada sessão do Claude Code. Máximo 40 linhas.
> Formato: o que está pronto, o que vem a seguir, decisões que não estão no código.

**Última atualização:** 2026-07-30 (Sessão 1)
**Fase atual:** 1 concluída — banco de dados criado e populado (seed DEV)

## Concluído

- Sessão 1 inteira (`sql/001`…`008`) rodada com sucesso no Supabase.
- Schema próprio **`gestao`** (exposto na API); extensões em `extensions`.
- 16 tabelas, índices, RLS, triggers de imutabilidade/auditoria/número, funções de escopo e de negócio, seed.
- `docs/SCHEMA.md` gerado — referência das próximas sessões.

## Próximo passo

- Sessão 2: `sql/999_testes.sql` — 13 critérios de aceite (seção 22) com `auth.uid()` simulado.
- Lembrar: adicionar `gestao` em Settings → API → Exposed schemas antes de usar o front.

## Decisões tomadas nesta sessão (não óbvias no código)

- **Schema `gestao`** em vez de `public` (a pedido). Exige expor no painel.
- PKs em `uuid`; enums como CHECK(text); escopo dirigido por dados (`perfis.nivel`/`escopo_global`), nunca por cargo fixo.
- Segurança em 2 camadas: front só tem `SELECT`; escrita só por funções `SECURITY DEFINER` (front fisicamente não escreve).
- **Anexos imutáveis**: inativação registrada em `auditoria` (não altera a linha). Listagem ativa filtra por auditoria.
- **Número da demanda**: uma sequence por ano (`seq_demanda_AAAA`) — pode ter furos (transação revertida). Confirmar se numeração sem furos é requisito.
- **Janela de retificação**: fecha se QUALQUER terceiro movimentou a demanda depois (leitura estrita). Confirmar se deveria ser só na mesma tarefa.
- Auditoria de visualização de `restrito` (LGPD) ficará na função de abertura da demanda (Sessão 5), não no RLS.
- `fn_emitir_relatorio` adiada para a Sessão 10 (junto da Edge Function).
- Seed cria usuários fictícios em `auth.users` (DEV, senha `dev-123456`) — remover antes de produção.

## Pendências e dúvidas em aberto

- Numeração sem furos? Janela de retificação por tarefa ou por demanda? (ver decisões acima)
- Chefe de Seção pode inativar demandas da própria seção? (hoje: não, só gerente+)
- Ressalva por qualquer participante (hoje: sim) ou só autor/chefias?
- Tamanho máximo de upload do Solar (afeta inteiro teor com anexos mesclados).
