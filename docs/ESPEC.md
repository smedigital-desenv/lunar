# Prompt — Sistema de Gestão de Demandas (Workflow) — Secretaria Municipal de Educação de Ribeirão Preto

## 1. OBJETIVO

Desenvolva um sistema web completo de Gestão de Demandas (Workflow) para a Secretaria Municipal de Educação.

O sistema controla demandas institucionais: criação, distribuição, acompanhamento, devolutivas, histórico, anexos, encerramento e emissão de relatório para juntada em processo administrativo. O módulo de Plantão da Supervisão é apenas um dos tipos de demanda.

**Premissa central:** cada demanda é um processo administrativo. Nenhum registro é excluído ou sobrescrito. Toda alteração gera novo registro. O histórico é a fonte de verdade.

---

## 2. TECNOLOGIAS OBRIGATÓRIAS

- Front-end: HTML5, CSS3, JavaScript moderno (ES modules) e Bootstrap 5. **Não usar React, Vue ou qualquer framework SPA.**
- Banco de dados: PostgreSQL no Supabase.
- Autenticação: Supabase Auth com Google OAuth, **restrito ao domínio `@educacao.pmrp.sp.gov.br`**. Bloquear login de contas fora do domínio já na policy e na função de provisionamento do usuário.
- Storage: Supabase Storage para anexos.
- Geração de PDF: Supabase Edge Function (Deno), pois a hospedagem é estática.
- Hospedagem: GitHub Pages.
- Comunicação direta com o Supabase via `supabase-js` (CDN ou ES module).
- Código modular, comentado e responsivo.
- Timezone da aplicação e de todos os cálculos de prazo: `America/Sao_Paulo`. Armazenar em `timestamptz`, exibir e calcular em horário local.

---

## 3. TIPOS DE DEMANDA

Plantão da Supervisão · Solicitação do Secretário · Solicitação entre Subsecretários · Solicitação para Gerentes · Manutenção Escolar · Transporte · RH · Jurídico · Financeiro · Tecnologia · Outros.

Tipos ficam em tabela (`tipos_demanda`), não em enum no código — devem ser administráveis.

---

## 4. ESTRUTURA

Cada demanda pode gerar quantidade ilimitada de subtarefas, em árvore (`tarefas.parent_id`), permitindo que cada responsável distribua atividades para outros usuários.

---

## 5. PERFIS, ESTRUTURA ORGANIZACIONAL E PERMISSÕES

### 5.1 Perfis

Seguem a hierarquia real da Secretaria:

1. `gabinete` — Secretário e assessoria direta
2. `subsecretario`
3. `gerente`
4. `chefe_secao`
5. `agente_administrativo`
6. `admin_ti` — perfil técnico, exclusivo da Gerência de Tecnologia da Informação, para manutenção do sistema

### 5.2 Estrutura organizacional em árvore

Criar tabela `unidades_organizacionais` com `parent_id` autorreferente, representando o organograma: Gabinete → Subsecretarias → Gerências → Seções. Cada usuário pertence a uma unidade.

O escopo de visualização de qualquer perfil de chefia é **a sua própria unidade e todas as unidades descendentes**, obtido por consulta recursiva (`WITH RECURSIVE`) sobre essa árvore — **não** por regra fixa escrita para cada perfil. Assim, mudanças no organograma não exigem reescrever RLS.

Na prática: Gabinete enxerga toda a Secretaria; Subsecretário enxerga suas gerências e seções; Gerente enxerga sua gerência e as seções subordinadas; Chefe de Seção enxerga sua seção; Agente Administrativo não tem escopo de chefia.

### 5.3 Matriz de permissões

| Ação | Agente Adm. | Chefe de Seção | Gerente | Subsecretário | Gabinete | Admin TI |
|---|---|---|---|---|---|---|
| Criar demanda | sim | sim | sim | sim | sim | sim |
| Ver demanda que criou (processo inteiro) | sim | sim | sim | sim | sim | sim |
| Ver tarefa recebida + subtarefas derivadas | sim | sim | sim | sim | sim | sim |
| Ver tudo da própria unidade e descendentes | não | sim | sim | sim | sim | sim |
| Ver tarefas de unidades fora do seu ramo | não | não | não | não | sim | sim |
| Encaminhar para qualquer usuário | sim | sim | sim | sim | sim | sim |
| Criar subtarefa na tarefa sob sua responsabilidade | sim | sim | sim | sim | sim | sim |
| Redistribuir tarefa de outro usuário | não | sim (no escopo) | sim (no escopo) | sim (no escopo) | sim | sim |
| Retificar movimentação de sua própria autoria (janela aberta) | sim | sim | sim | sim | sim | sim |
| Retificar movimentação de terceiros (janela aberta) | não | não | sim (no escopo) | sim (no escopo) | sim | sim |
| Registrar ressalva após intervenção de terceiro | sim | sim | sim | sim | sim | sim |
| Editar campos da demanda | não | não | sim (no escopo) | sim (no escopo) | sim | sim |
| Inativar / reativar demanda ou tarefa | não | não | sim (no escopo) | sim (no escopo) | sim | sim |
| Reabrir demanda concluída | não | não | sim (no escopo) | sim (no escopo) | sim | sim |
| Ver demanda de sigilo `restrito` fora da tramitação | não | não | sim (no escopo) | sim (no escopo) | sim | não |
| Gerenciar usuários, unidades, tipos, feriados | não | não | não | não | não | sim |

Regras adicionais:

- Toda retificação, edição e inativação exige justificativa, independentemente do perfil.
- `admin_ti` administra o sistema, **não** o conteúdo: não enxerga demandas de sigilo `restrito` das quais não participa, e todo acesso seu a dados de demanda é registrado em `auditoria`.
- Nenhum perfil, inclusive `admin_ti` e `gabinete`, pode alterar ou apagar histórico (ver seção 11).
- Todas essas regras devem estar implementadas em **Row Level Security**, não apenas no front-end.

---

## 6. CAMPOS DA DEMANDA

- Número automático no formato `DEM-AAAA-NNNNNN` (sequencial por ano, gerado por sequence + trigger; nunca no front-end).
- Título.
- Descrição.
- **Objeto/queixa** (campo estruturado, obrigatório — é o que alimenta o relatório).
- Tipo de demanda · Categoria · Setor.
- Prioridade: baixa, normal, alta, urgente.
- Situação (ver máquina de estados).
- Data de criação · Prazo (opcional) · Data de conclusão.
- Responsável atual · Solicitante · Participantes.
- Escola (quando aplicável) · Aluno (quando aplicável).
- **Pessoas envolvidas** (tabela própria: nome, vínculo — aluno, responsável, servidor, outro — e observação).
- **Conclusão/desfecho**: texto obrigatório no encerramento. Sem conclusão preenchida, a demanda não pode ser concluída.
- `numero_processo_solar`: campo opcional para amarrar a demanda ao processo administrativo correspondente no sistema Solar, e permitir busca reversa.
- Nível de sigilo: `normal` ou `restrito` (demandas com dados de aluno/família).

---

## 7. MÁQUINA DE ESTADOS

Situações: `aberta`, `em_andamento`, `aguardando_complementacao`, `devolvida`, `concluida`, `reaberta`, `inativa`.

Transições permitidas (rejeitar qualquer outra no banco, com exceção explícita):

- `aberta` → `em_andamento`, `aguardando_complementacao`, `concluida`, `inativa`
- `em_andamento` → `aguardando_complementacao`, `devolvida`, `concluida`, `inativa`
- `aguardando_complementacao` → `em_andamento`, `concluida`, `inativa`
- `devolvida` → `em_andamento`, `concluida`, `inativa`
- `concluida` → `reaberta` (somente gerente ou superior), `inativa`
- `reaberta` → comporta-se como `em_andamento`
- `inativa` → reativação retorna à situação imediatamente anterior

Atenção: **prioridade não é situação**. Os filtros "urgentes" do painel filtram por prioridade, não por status.

Regra de complementação: ao solicitar complementação, a responsabilidade retorna ao autor da movimentação anterior e a **contagem de prazo é suspensa** até a resposta; registrar `prazo_suspenso_em` e `prazo_retomado_em` e considerar isso no cálculo de atraso.

---

## 8. TRAMITAÇÃO

Ações disponíveis: encaminhar demanda, criar subtarefa, registrar devolutivas ilimitadas, alterar situação, concluir, reabrir, solicitar complementação, inativar, reativar, retificar.

Modal de encaminhamento: destinatário, mensagem/despacho, prioridade, prazo (opcional), botão Enviar. Após o envio, o responsável passa a ser o destinatário.

Cada movimentação registra automaticamente: data, hora, usuário que agiu, usuário destinatário, tipo da movimentação, texto e **situação da demanda naquele momento**.

---

## 9. INATIVAÇÃO (NUNCA EXCLUSÃO)

Não existe DELETE em nenhuma tabela do sistema. Demandas e tarefas são inativadas.

- Campos: `ativo boolean not null default true`, `inativado_em`, `inativado_por`, `motivo_inativacao` (obrigatório quando inativado).
- A inativação gera movimentação do tipo `inativacao` e aparece normalmente na timeline.
- Efeito: sai das caixas de entrada/saída, da pesquisa padrão e dos contadores do dashboard; permanece consultável por gerente ou superior dentro do escopo, e por link direto para quem participou da tramitação.
- Reativação exige justificativa e também gera movimentação (`reativacao`).

---

## 10. EDIÇÃO E RETIFICAÇÃO

Duas regras distintas:

**a) Campos da demanda** (título, descrição, objeto/queixa, categoria, prioridade, prazo, escola, aluno): editáveis por gerente ou superior, dentro do seu escopo, com **justificativa obrigatória**. Cada edição grava em `auditoria` os valores anterior e novo em JSONB (`dados_anteriores`, `dados_novos`).

**b) Texto de movimentação ou devolutiva**: **nunca editável in loco**, por nenhum perfil. Aplica-se o modelo de retificação do processo administrativo:

- O registro original permanece íntegro e visível, marcado como retificado.
- É criada uma nova movimentação do tipo `retificacao`, com `movimentacao_retificada_id` apontando para a original, contendo o texto correto e a justificativa.
- Na timeline, exibir "Registro retificado por Fulano — motivo: X", com o conteúdo anterior expansível.

**Janela de retificação — regra obrigatória:** uma movimentação só pode ser retificada enquanto **nenhum outro usuário tiver intervindo** naquela demanda ou tarefa depois dela. Considera-se intervenção qualquer movimentação posterior registrada por usuário diferente do autor (devolutiva, despacho, encaminhamento, comentário, criação de subtarefa ou mudança de situação); a simples visualização não conta.

- `fn_retificar_movimentacao` deve rejeitar a operação, com mensagem clara, se existir movimentação posterior de outro usuário na mesma demanda ou tarefa. A validação é feita no banco, não no front-end.
- A regra vale para todos os perfis, inclusive `gabinete` e chefias: uma vez que o ato produziu efeito para terceiro, ele não se altera mais.
- Na interface, o botão "Retificar" só aparece enquanto a janela estiver aberta.

**Ressalva (após intervenção de terceiro):** passada a janela, o erro não é corrigido — é apontado. Qualquer usuário que participe da tramitação pode registrar movimentação do tipo `ressalva`, vinculada por `movimentacao_ressalvada_id` à movimentação equivocada, informando o teor correto. O registro original e todos os posteriores permanecem intactos; a timeline exibe a marcação de ressalva junto ao registro original.

---

## 11. IMUTABILIDADE — IMPLEMENTAÇÃO OBRIGATÓRIA

Não basta a regra estar escrita: ela deve ser fisicamente impossível de violar.

- As tabelas `movimentacoes`, `comentarios`, `anexos`, `auditoria` e `relatorios_emitidos` **não possuem policy de UPDATE nem de DELETE** em nenhum perfil.
- Criar trigger `BEFORE UPDATE OR DELETE` nessas tabelas com `RAISE EXCEPTION`, garantindo que nem o dono do banco altere por engano.
- **Nenhuma escrita ocorre por UPDATE/INSERT direto do front-end.** Toda ação passa por funções `SECURITY DEFINER` que validam o perfil e gravam a movimentação e o registro de auditoria **na mesma transação**:

```
fn_criar_demanda(...)
fn_encaminhar(demanda_id/tarefa_id, destinatario_id, texto, prioridade, prazo)
fn_criar_subtarefa(parent_id, responsavel_id, titulo, descricao, prazo)
fn_registrar_devolutiva(tarefa_id, texto, anexos[])
fn_alterar_situacao(demanda_id, nova_situacao, texto)
fn_solicitar_complementacao(...)
fn_concluir(demanda_id, conclusao)
fn_reabrir(demanda_id, justificativa)
fn_editar_demanda(demanda_id, campos jsonb, justificativa)
fn_retificar_movimentacao(movimentacao_id, texto_correto, justificativa)
fn_registrar_ressalva(movimentacao_id, texto_correto, justificativa)
fn_inativar(entidade, id, motivo)
fn_reativar(entidade, id, motivo)
fn_emitir_relatorio(demanda_id, tipo)
```

Assim é impossível alterar dados sem histórico, em vez de depender de o front-end lembrar de gravar.

---

## 12. TIMELINE

Cada demanda possui linha do tempo cronológica única, agregando: criação, encaminhamentos, despachos, comentários, devolutivas, anexos, criação de subtarefas, alterações de situação, mudanças de responsável, retificações, inativação/reativação, emissões de relatório e encerramento.

A timeline da demanda-mãe consolida também os eventos das subtarefas, respeitando as permissões de visualização de cada usuário. Disponível durante toda a vida da demanda.

---

## 13. ANEXOS

- Upload para Supabase Storage ou informação de link do Google Drive, em qualquer demanda ou devolutiva.
- Registrar: nome original, tipo MIME, tamanho, hash SHA-256, quem anexou e quando.
- Tipos aceitos: PDF, Word, Excel, imagens (JPG/PNG), até 20 MB por arquivo.
- Nome de arquivo normalizado no storage (sem acentos/espaços); nome original preservado no banco.
- Acesso por policy: apenas quem participa da tramitação daquela demanda/tarefa, mais as chefias no escopo hierárquico correspondente.
- Anexos não são excluídos — apenas inativados.

---

## 14. RELATÓRIOS PARA O PROCESSO (SOLAR)

Dois documentos distintos, gerados por Edge Function:

**1. Relatório-resumo (1–2 páginas)** — para juntada ao processo: cabeçalho institucional da SME, número da demanda, datas de abertura e conclusão, unidade escolar, solicitante, quem atendeu, objeto/queixa, pessoas envolvidas, encaminhamentos realizados, conclusão/desfecho e responsável.

**2. Inteiro teor (certidão de tramitação)** — timeline completa, todas as movimentações e devolutivas na íntegra, e relação de anexos (nome, tipo, tamanho, hash, quem anexou, data).

Requisitos dos dois:

- A4, margens de processo, numeração "Página X de Y" contínua.
- Rodapé com hash do documento, código de verificação e URL pública de validação.
- Cada emissão grava linha em `relatorios_emitidos` (usuário, data/hora, tipo, hash) **e** uma movimentação do tipo `emissao_relatorio` — assim se sabe exatamente qual PDF foi juntado ao processo.
- Para demandas com sigilo `restrito`, oferecer também versão anonimizada (sem nome de aluno e responsáveis), marcada como tal no documento.

---

## 15. NOTIFICAÇÕES

Notificação in-app a cada encaminhamento, devolutiva, solicitação de complementação, retificação, inativação e conclusão. Controlar lida/não lida, com data de leitura. Badge com contador no cabeçalho.

---

## 16. PAINÉIS

Dashboard com: demandas abertas, em andamento, atrasadas, concluídas, próximas do prazo (prazo em até 24 h úteis), urgentes, por setor, por responsável, por prioridade e tempo médio de atendimento.

Cálculo de prazo em **dias úteis**, com tabela `feriados` (municipais, estaduais e nacionais) alimentável pelo perfil `admin_ti`. Todos os contadores respeitam as permissões do usuário.

---

## 17. PESQUISA

Pesquisar por número, título, solicitante, escola, aluno, responsável, situação, prioridade, tipo, setor, período, número do processo Solar e palavras existentes nas devolutivas e movimentações.

Busca textual com `tsvector` em português, índice GIN. Resultados paginados e sempre filtrados pelas permissões do usuário.

---

## 18. BANCO DE DADOS

Tabelas:

`usuarios` · `perfis` · `unidades_organizacionais` · `tipos_demanda` · `demandas` · `tarefas` · `movimentacoes` · `comentarios` · `participantes` · `pessoas_envolvidas` · `anexos` · `notificacoes` · `escolas` · `feriados` · `auditoria` · `relatorios_emitidos`

Requisitos:

- `tarefas.parent_id` autorreferente, para subtarefas ilimitadas.
- `unidades_organizacionais.parent_id` autorreferente, representando o organograma da Secretaria; criar função recursiva `fn_unidades_no_escopo(usuario_id)` usada pelas policies de RLS.
- Toda movimentação com FK para a demanda (e para a tarefa, quando aplicável).
- `movimentacoes.movimentacao_retificada_id` autorreferente.
- Modelo normalizado, com FKs, constraints `NOT NULL` e `CHECK` onde a regra existir (ex.: `motivo_inativacao` obrigatório quando `ativo = false`; `conclusao` obrigatória quando situação = `concluida`).
- Índices para as consultas de caixa de entrada, dashboard e pesquisa.

---

## 19. AUDITORIA

Tabela `auditoria` registrando automaticamente, via trigger e via funções: usuário, data, hora, endereço IP quando disponível, tipo da ação, entidade e id afetados, `dados_anteriores` e `dados_novos` em JSONB.

Não editável nem excluível por nenhum perfil, incluindo `gabinete` e `admin_ti`.

---

## 20. LGPD

O sistema trata dados de alunos e famílias. Prever: marcação de sigilo por demanda, restrição de visualização coerente com o sigilo, versão anonimizada do relatório e registro em auditoria de toda visualização de demanda marcada como `restrito`.

---

## 21. ENTREGA EM FASES — PARE E AGUARDE APROVAÇÃO AO FIM DE CADA FASE

**Fase 1 — Banco:** script SQL completo (tabelas, constraints, índices, sequences), políticas de RLS, triggers de imutabilidade e auditoria, funções `SECURITY DEFINER` e seed de dados de teste (organograma completo em `unidades_organizacionais`, perfis, tipos, escolas, usuários fictícios em todos os níveis da hierarquia). **Parar e aguardar aprovação.**

**Fase 2 — Autenticação e camada de dados:** login Google OAuth restrito ao domínio, provisionamento de usuário, e módulo JS de serviços encapsulando todas as chamadas às funções do banco. **Parar.**

**Fase 3 — Interface:** caixa de entrada com filtros, caixa de saída, tela da demanda com timeline e árvore de subtarefas, modais de encaminhamento e devolutiva, dashboard, pesquisa e notificações. **Parar.**

**Fase 4 — Relatórios e implantação:** Edge Function de geração dos dois PDFs, validação por hash, configuração do Supabase, configuração do GitHub Pages e tutorial de implantação passo a passo.

Antes de escrever código em cada fase, apresente um plano curto do que vai fazer.

---

## 22. CRITÉRIOS DE ACEITE (o sistema só está pronto se todos passarem)

1. `UPDATE` ou `DELETE` em `movimentacoes`, `anexos` ou `auditoria` falha, mesmo executado por `gabinete` ou `admin_ti`.
2. Encaminhar altera `responsavel_atual_id`, cria exatamente 1 movimentação e 1 notificação, na mesma transação.
3. Um `agente_administrativo` de outra unidade, consultando a API diretamente com seu token, não recebe nenhuma linha de uma demanda alheia (RLS, não filtro de front-end).
4. Quem recebeu uma subtarefa enxerga ela e suas descendentes, e não enxerga as tarefas irmãs.
5. Um gerente enxerga as demandas das seções subordinadas à sua gerência e não enxerga as de outra gerência; ao mover uma seção para outra gerência no organograma, a visibilidade acompanha, sem alteração de código.
6. Editar campo da demanda sem justificativa é rejeitado; com justificativa, gera linha em `auditoria` com valores anterior e novo.
7. Retificar movimentação preserva o texto original consultável e cria novo registro vinculado. A retificação é rejeitada pelo banco assim que outro usuário registra qualquer movimentação posterior; nesse caso, resta apenas a ressalva.
8. Inativar exige motivo, remove a demanda dos contadores e mantém a timeline íntegra.
9. Concluir sem preencher a conclusão é rejeitado.
10. Demanda com prazo suspenso por complementação não é contada como atrasada durante a suspensão.
11. O relatório-resumo em PDF é gerado, registra a emissão na timeline e o hash do rodapé confere com o arquivo baixado.
12. Transição de situação não prevista na máquina de estados é rejeitada pelo banco.
13. Toda a interface é utilizável em celular (uso frequente em campo, nas unidades escolares).

---

## 23. O QUE NÃO FAZER

- Não criar nenhum `DELETE` — em lugar algum, para perfil algum.
- Não permitir `INSERT` ou `UPDATE` direto do front-end nas tabelas de processo; tudo via funções.
- Não expor a `service_role key` no front-end.
- Não usar framework SPA nem bundler.
- Não inventar campos, tabelas ou regras fora deste documento: se algo estiver ambíguo, pergunte antes de implementar.
- Não implementar controle de acesso apenas escondendo botões na interface.
- Não entregar as quatro fases de uma vez.

---

## 24. QUALIDADE

Arquitetura limpa, componentes reutilizáveis, código comentado em português, nomes de tabelas e colunas em português, interface moderna e responsiva, pronta para produção e preparada para expansão com novos módulos.
