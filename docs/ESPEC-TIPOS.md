# Espec — Tipos de demanda e formulários por formato

> **Passos 1 e 2 feitos.** `sql/046` rodado no Supabase em 2026-08-22.
> Passos 3 e 4 (pessoas envolvidas) pendentes — ver §7.
> Levantada em 2026-08-22, a partir do pedido: "atendimentos aos munícipes
> têm campos diferentes dos controles de tarefas de cada subsecretaria".

## 1. Problema

Um formulário único atende dois usos que não se parecem:

- **Atendimento ao munícipe** — alguém de fora procura a Secretaria e
  espera resposta. Precisa de objeto/queixa, escola, aluno, pessoas
  envolvidas e sigilo.
- **Controle interno** — a subsecretaria acompanha o próprio trabalho até
  concluir. Precisa de título, prazo, responsável, link da documentação e
  cronograma. Os campos acima são ruído.

Hoje os 14 campos aparecem para os dois. Na migração do painel da
Subsecretaria Pedagógica, **6 não faziam sentido** — e `objeto_queixa`,
sendo `NOT NULL`, obrigou a **copiar o título dentro dele** só para a
carga passar. Esse remendo é o sintoma que originou esta espec.

### Divergência encontrada

`ESPEC.md §3` e o banco listam tipos **diferentes**, e nenhum dos dois
cobre controle interno:

| ESPEC.md §3 | Banco (`008_seed.sql`) |
|---|---|
| Plantão da Supervisão, Solicitação do Secretário, Solicitação entre Subsecretários, Solicitação para Gerentes, Manutenção Escolar, Transporte, RH, Jurídico, Financeiro, Tecnologia, Outros | Reclamação, Solicitação, Denúncia, Requerimento, Informação, Ofício |

A lista da espec mistura duas perguntas: *o que é o registro* (Plantão da
Supervisão) e *sobre o que ele trata* (Transporte, RH). O assunto já tem
lugar — as colunas `categoria` e `setor`.

## 2. Decisões do usuário (2026-08-22)

1. **Formato por tipo.** `tipos_demanda` ganha uma coluna dizendo a que
   formato o tipo pertence. O front tem um conjunto de campos por
   formato. Criar tipo novo é escolher o formato — sem programar.
   *Descartado:* configuração campo a campo em jsonb (exigiria tela de
   administração e permitiria combinações não testadas) e tabelas
   separadas como em Licitações (duplicaria tramitação, timeline e RLS).
2. **`objeto_queixa` obrigatório só no atendimento.** Deixa de ser
   `NOT NULL` no banco; a exigência passa para `fn_criar_demanda`,
   conforme o formato do tipo.
3. **Nenhum campo novo por enquanto** — contato do munícipe, canal de
   entrada e protocolo externo ficam para depois.
4. **Pessoas envolvidas entra no escopo** (ver §5).

## 3. Formatos

| | `atendimento` | `controle` |
|---|---|---|
| Origem | de fora, exige resposta | interno, acompanhado até concluir |
| Exemplo | munícipe reclama de vaga | painel da SUBPED |

### Campos por formato

| Campo | Atendimento | Controle |
|---|---|---|
| Título, Tipo, Prioridade, Prazo, Responsável, Categoria, Setor, Descrição | sim | sim |
| **Objeto/queixa** | obrigatório | oculto |
| Escola · Aluno · Pessoas envolvidas · Sigilo | sim | oculto |
| Link da documentação | opcional | sim |
| Nº processo Solar | sim | opcional |

Sigilo sai do controle porque, pela `ESPEC.md §6`, `restrito` existe para
"demandas com dados de aluno/família" — que o controle não tem. Havendo
controle sigiloso, basta voltar o campo.

## 4. Tipos propostos

**Atendimento:** Plantão da Supervisão · Reclamação · Solicitação de
munícipe · Denúncia · Requerimento · Pedido de informação

*Ofício* fica fora por ora — ver §9.

**Controle:** Controle da Subsecretaria · Solicitação do Secretário ·
Solicitação entre Subsecretários · Solicitação para Gerentes

*Manutenção Escolar, Transporte, RH, Jurídico, Financeiro e Tecnologia*
saem da lista de tipos e passam a ser **categoria**.

Os 6 tipos do seed não estão em uso por nenhuma demanda real, então podem
ser renomeados ou inativados sem quebrar nada (regra 1: inativar, não
apagar).

## 5. Pessoas envolvidas — duas lacunas

A tabela `pessoas_envolvidas` (nome, vínculo `aluno|responsavel|servidor|
outro`, observação) registra quem aparece no caso **sem ser usuário do
sistema**. Seu único consumidor hoje é o relatório em PDF, onde faz a
anonimização por sigilo (`fn_dados_relatorio`: nome vira `[anonimizado]`
quando `sigilo = restrito`, preservando vínculo e observação).

1. **A tela nunca mostra o dado.** `js/ui/demanda.js:100` devolve
   `pessoas: []` fixo no caminho com dado real. A função de render existe
   e funciona em demonstração, mas com Supabase real a lista sempre chega
   vazia — falta o serviço de leitura. O usuário preenche, grava, entra
   no PDF e some da interface.
2. **Não dá para corrigir depois.** As pessoas só entram por
   `fn_criar_demanda`. Não há RPC para acrescentar, corrigir ou inativar
   numa demanda existente.

Um campo que não se vê e não se corrige acaba não sendo preenchido — por
isso as duas lacunas entram junto com a separação dos formulários.

## 6. Impacto no que está no ar

- As **31 demandas migradas da SUBPED** estão com `tipo_id` nulo: marcar
  como *Controle da Subsecretaria*.
- Elas têm `objeto_queixa` = cópia do título. Com o campo oculto no
  controle, isso deixa de aparecer — **não é preciso mexer nos dados**.
- Nenhuma demanda real usa os tipos do seed.

## 7. Implementação (4 passos, com parada entre eles)

1. ~~**SQL — formato e tipos.**~~ **Feito:** `sql/046_tipos_formato.sql`.
   Coluna de formato em `tipos_demanda`;
   `objeto_queixa` deixa de ser `NOT NULL`; `fn_criar_demanda` passa a
   exigi-lo conforme o formato; tipos criados/renomeados/inativados (um
   único *Controle da Subsecretaria*, sem restrição de quem escolhe); as
   31 demandas recebem o tipo de controle.
2. ~~**Tela de nova demanda.**~~ **Feito.** Os blocos que só valem no
   atendimento levam `data-so="atendimento"` no HTML e somem quando o
   tipo escolhido é de controle; o `formato` viaja no próprio `<option>`.
   Sem tipo escolhido **mostra tudo** — mesmo critério do banco, que só
   dispensa o objeto/queixa quando o tipo é de controle.
3. **Pessoas envolvidas — leitura.** Serviço + exibição no detalhe.
4. **Pessoas envolvidas — escrita.** RPC para acrescentar/corrigir/
   inativar depois da criação, com justificativa (regra 7), restrita a
   quem faz parte do processo (§8.3).

## 8. Decisões complementares (2026-08-22)

1. **"Controle da Subsecretaria" é um tipo único** — não um por
   subsecretaria. A unidade responsável já diz de quem é o controle.
2. **Escolha de tipo fica livre.** Qualquer pessoa cria qualquer tipo;
   nenhuma restrição por perfil nas funções.
3. **Pessoas envolvidas: edita quem está em `participantes`** —
   solicitante, responsável atual e participantes. Só isso: quem tem
   apenas tarefa **não** edita, e `fn_pode_ver_demanda` **não** serve de
   critério (inclui chefia no escopo, que enxerga a demanda sem
   participar dela). Trata-se de escrever dado pessoal de terceiro
   (LGPD, `ESPEC.md §20`), então o critério é o mais estreito.

## 9. Ofício — descartado como tipo

**Decisão (2026-08-22): o ofício não tem função própria no sistema e sai
da lista de tipos.** O tipo do seed é inativado (regra 1: inativar com
motivo, nunca apagar).

O que sustentou a decisão: o sistema se contradizia sobre o que era um
ofício, e nada havia sido construído sobre nenhuma das definições —

| Onde | O que diz | Sentido |
|---|---|---|
| `sql/008_seed.sql:112` | "Comunicação oficial **entre unidades**" | interno |
| `js/ui/caixa-entrada.js:13` (exemplo) | "Responder ofício **da Câmara**" | externo |

esses são os dois únicos lugares onde a palavra aparece em todo o
repositório. Sem campo, sem regra e sem fluxo, o tipo era um rótulo sem
comportamento.

Na prática, o que o ofício faria já tem lugar:

- **ofício que chega** de fora (Câmara, MP, Defensoria) é um atendimento
  como outro qualquer — o que importa é a providência, não o veículo;
- **ofício entre unidades** é o que `fn_encaminhar` já registra como
  tramitação, com movimentação na timeline;
- **ofício que a SME expede** é produto de uma demanda, não o começo
  dela — cabe como anexo.

Se um dia for preciso guardar número e data de ofício, a conversa volta —
mas aí como campo, não como tipo.
