# ESPEC — Módulo de Licitações (nova aba)

> Especificação funcional acordada em 2026-08-14, a partir da planilha
> "Acompanhamento Licitações e Contratos" (aba COMPRAS - ALMOX E SEDE).
> Complementa `docs/ESPEC.md`; as regras invioláveis do `CLAUDE.md` valem aqui.
> **Fase 1 = compras.** Atas, contratos e solicitações à equipe da SME são fase 2.

## Contexto

A Subsecretaria de Licitações e Contratos controla os processos de compra numa
planilha com 3 abas de mesma estrutura (Almox/Sede, Nutrição, Serviços e Obras).
Cada linha é um processo. O andamento é um diário datado dentro de uma única
célula (até 5.000 caracteres); a lista de fases divergiu entre as abas com o
tempo; o "local atual" inclui setores de outras secretarias (ADM, FAZ).
Todos os processos tramitam oficialmente no SOLAR — este módulo é
**acompanhamento**, não tramitação oficial.

## Decisões do usuário (2026-08-14)

- Licitação é **entidade própria** (`lic_processos`), não um tipo de demanda.
- Número próprio gerado no banco: `LIC-AAAA-NNNN` (sequence + trigger, como `DEM-`).
- Escala de prioridade **própria, com 3 níveis**: `1 - Secretário`, `2 - Alta`, `3 - Normal`.
- Valores arrematado/frustrados **serão controlados** (hoje vazios na planilha).
  Economia **não é gravada**: calculada (requisição − arrematado).
- Andamentos são registrados **pela equipe de licitações**; entrada de novos
  pedidos por **gerente ou acima**.
- Um processo gerará n atas/contratos (fase 2); o processo é o pai da hierarquia.
- Regras de transição entre fases: **ficam para depois**. Por ora qualquer
  fase → qualquer fase, sempre com movimentação registrada.
- **Visibilidade (opção B + C):** vê o processo quem for
  (a) gerente ou acima (`nivel >= 3`), OU
  (b) lotado na Subsecretaria de Licitações e Contratos ou descendentes
  (qualquer nível), OU
  (c) da unidade solicitante: lotado diretamente nela (**inclui agente
  administrativo** — decisão de 2026-08-14) ou chefia com ela no escopo
  (`fn_unidades_no_escopo`, regra 5 — nada fixo por cargo).
- **Alerta de "parado":** processo sem andamento há mais dias que o limite
  da fase atual. Limite por fase em `lic_fases.prazo_alerta_dias`,
  **padrão 10 dias**; personalizável por fase via admin (decisão de
  2026-08-14).

## Modelo de dados (schema `gestao`, prefixo `lic_`)

- **lic_fases** — catálogo ordenado: `id`, `ordem`, `nome`, `desvio` bool
  (Suspenso e Compra Direta são desvios, não passos da esteira),
  `prazo_alerta_dias` smallint NOT NULL DEFAULT 10, `ativo`.
  Editável por admin; a numeração da planilha morre aqui.
- **lic_locais** — locais de tramitação: `id`, `sigla` (ex.: `ADM-222`),
  `nome`, `ativo`. Separado de `unidades_organizacionais` porque inclui
  setores de outras secretarias.
- **lic_processos** — `id`, `numero` UNIQUE `LIC-AAAA-NNNN`, `objeto`,
  `categoria` (almox_sede | nutricao | servicos_obras), `prioridade`
  (1_secretario | 2_alta | 3_normal), `numero_requisicao`,
  `numero_processo_compra`, `numero_pregao`, `numero_processo_solar`
  (externos, todos opcionais — nascem em momentos diferentes),
  `fase_id`, `local_id` (estado atual; histórico nas movimentações),
  `data_pregao` (última agendada), `valor_requisicao`, `valor_arrematado`,
  `valor_frustrado_deserto`, `unidade_solicitante_id` → unidades
  (padrão: unidade do criador; editável por quem tem a unidade no escopo),
  `demanda_id` → demandas (opcional — demanda que originou o processo),
  `ativo` + `inativado_*` com motivo, `criado_por`, timestamps.
- **lic_movimentacoes** — *imutável* (trigger BEFORE UPDATE OR DELETE):
  `id`, `processo_id`, `autor_id`, `tipo`, `texto`, `fase_anterior_id`,
  `fase_nova_id`, `local_anterior_id`, `local_novo_id`, `data_pregao`,
  `movimentacao_retificada_id`, `movimentacao_ressalvada_id`, `criado_em`.
  Tipos: criacao, andamento, mudanca_fase, mudanca_local,
  agendamento_pregao, edicao, retificacao, ressalva, inativacao, reativacao.
  "Data de atualização" da planilha deixa de existir: é o último andamento.

Seed de `lic_fases` (ordem deduzida da planilha, a validar quando as regras
forem discutidas): DFD → Termo de referência → Cotação → Requisição →
Elaborar edital → Envio ao jurídico → Agendamento → Pregão agendado →
Pregão em andamento → Homologado → Assinatura de contrato/ata →
Liberado para empenho → Aguardando OS → Em execução → Contrato finalizado.
Desvios: Suspenso, Compra Direta.

## Permissões (RLS + RPCs SECURITY DEFINER, nunca escrita direta)

| Ação | Quem |
|---|---|
| Ver processo | Regra B + C acima |
| Criar pedido | Gerente ou acima (`nivel >= 3`) |
| Andamento, fase, local, pregão, valores, números externos | Lotados na Subsecretaria de Licitações e Contratos + descendentes |
| Editar/inativar/retificar/ressalvar | Idem, sempre com justificativa (regras 6 e 7) |
| Gerir catálogos (`lic_fases`, `lic_locais`) | `pode_administrar` |

A unidade da Subsecretaria de Licitações e Contratos não é hardcoded:
referenciada por configuração (a definir na implementação — provável coluna
booleana na unidade ou parâmetro), nunca por sigla fixa no código.

## Telas (fase 1)

1. `pages/licitacoes.html` — lista com filtros (categoria, fase, prioridade,
   local, busca por objeto/números) e destaque para processos **sem andamento
   há X dias**. Entra no menu como nova aba "Licitações".
2. `pages/processo-licitacao.html` — detalhe: cabeçalho (números, valores,
   economia calculada), timeline de movimentações (mesmo componente visual da
   demanda), ações conforme permissão.
3. Novo pedido — formulário para gerente+ (objeto, categoria, prioridade,
   unidade solicitante, justificativa). Números externos e fase são da equipe
   de licitações.

## Migração da planilha

Script único (fora do app): linhas das 3 abas de compras → `lic_processos`;
o diário da coluna "Situação" é quebrado em `lic_movimentacoes` individuais
(entradas "dd/mm - texto"; ano inferido pela data de atualização), com autor
de migração identificado. Locais e fases distintos alimentam os catálogos.

## Fase 2 (fora do escopo atual)

- Atas e contratos como entidades filhas do processo, com id próprio.
- Solicitações da equipe de licitações às unidades da SME — reutilizando o
  motor de `demandas`/`tarefas` (o campo `demanda_id` já deixa a ponte pronta).
- Painel/KPIs de licitações; regras de transição de fase.
- Demais abas da planilha (atas, contratos, cotações, obras, finalizados).

## Dúvidas em aberto

- Homologação parcial: a economia calculada (requisição − arrematado) cobre
  todos os casos, ou precisa de campo próprio?
