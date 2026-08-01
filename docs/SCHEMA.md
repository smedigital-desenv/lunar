# SCHEMA — resumo do banco (schema `gestao`)

> Consulte este arquivo em vez de reler os `.sql`. Tudo no schema **`gestao`**
> (exposto na API do Supabase). Extensões em `extensions`. Config de busca:
> `gestao.portugues_sem_acento`. Fuso: `America/Sao_Paulo`.
>
> **Regra de acesso:** front recebe só `SELECT` (RLS). Toda escrita é por
> função `SECURITY DEFINER` (RPC). Tabelas imutáveis são append-only.

## Tabelas (colunas-chave)

- **perfis**(`codigo` PK, nome, `nivel` smallint, `escopo_global` bool, `pode_administrar` bool)
  — códigos: agente_administrativo(1), chefe_secao(2), gerente(3), subsecretario(4), gabinete(5, global), admin_ti(3, global, administra).
- **unidades_organizacionais**(`id` PK, `parent_id`→self, tipo[gabinete|subsecretaria|gerencia|secao], nome, sigla, ativo, inativado_*) — organograma.
- **usuarios**(`id` PK = `auth.users.id`, nome, email[UNIQUE, domínio @educacao.pmrp.sp.gov.br], `perfil`→perfis, `unidade_id`→unidades, ativo, inativado_*).
- **tipos_demanda**(`id` PK, nome, descricao, ativo) · **escolas**(`id` PK, nome, codigo_inep, ativo) · **feriados**(`data` PK, descricao, tipo, ativo).
- **demandas**(`id` PK, `numero` UNIQUE `DEM-AAAA-NNNNNN`, titulo, descricao, `objeto_queixa`, `tipo_id`→tipos, categoria, setor, prioridade[baixa|normal|alta|urgente], `situacao`, situacao_anterior, prazo, prazo_suspenso_em, prazo_retomado_em, data_conclusao, conclusao, `solicitante_id`→usuarios, `responsavel_atual_id`→usuarios, `unidade_responsavel_id`→unidades, escola_id→escolas, aluno_nome, numero_processo_solar, `sigilo`[normal|restrito], ativo, inativado_*, criado_por, criado_em, atualizado_em).
  — CHECK: conclusao obrigatória se `concluida`; motivo obrigatório se inativo.
- **tarefas**(`id` PK, `demanda_id`→demandas, `parent_id`→self [subtarefas], titulo, descricao, `responsavel_id`→usuarios, `unidade_responsavel_id`→unidades, situacao, situacao_anterior, prioridade, prazo, prazo_suspenso_em/retomado_em, data_conclusao, conclusao, ativo, inativado_*, criado_por, timestamps).
- **participantes**(`id` PK, `demanda_id`, `usuario_id`, papel[solicitante|responsavel|participante], ativo, UNIQUE(demanda_id,usuario_id)).
- **pessoas_envolvidas**(`id` PK, `demanda_id`, nome, vinculo[aluno|responsavel|servidor|outro], observacao, ativo).
- **movimentacoes** *(imutável)*(`id` PK, `demanda_id`, `tarefa_id`, `autor_id`, `tipo`, texto, situacao_anterior, situacao_nova, destinatario_id, prioridade, prazo, `movimentacao_retificada_id`→self, `movimentacao_ressalvada_id`→self, criado_em).
  — tipos: criacao, encaminhamento, subtarefa, devolutiva, despacho, comentario, alteracao_situacao, solicitacao_complementacao, conclusao, reabertura, edicao, retificacao, ressalva, inativacao, reativacao, emissao_relatorio.
- **comentarios** *(imutável)*(`id` PK, demanda_id, tarefa_id, autor_id, texto, criado_em).
- **anexos** *(imutável)*(`id` PK, demanda_id, tarefa_id, movimentacao_id, nome_original, nome_storage, mime, tamanho_bytes[≤20MB], hash_sha256, storage_path, link_externo, anexado_por, criado_em). Inativação só em `auditoria`.
- **notificacoes**(`id` PK, `usuario_id`, demanda_id, tarefa_id, tipo, titulo, mensagem, lida, lida_em, criado_em).
- **auditoria** *(imutável)*(`id` PK, usuario_id, acao, entidade, entidade_id, dados_anteriores jsonb, dados_novos jsonb, ip, criado_em).
- **relatorios_emitidos** *(imutável)*(`id` PK, `demanda_id`, tipo[resumo|inteiro_teor], anonimizado, hash_sha256, codigo_verificacao UNIQUE, caminho_storage, emitido_por, criado_em).

## Regras físicas (triggers)

- Imutabilidade: `BEFORE UPDATE OR DELETE` levanta exceção em movimentacoes, comentarios, anexos, auditoria, relatorios_emitidos.
- Número da demanda: `BEFORE INSERT` gera `DEM-AAAA-NNNNNN` (sequence por ano `seq_demanda_AAAA`).
- Touch `atualizado_em` em usuarios, unidades, demandas, tarefas.
- Auditoria automática: `AFTER INSERT/UPDATE` em demandas e tarefas grava dados anteriores/novos.

## Funções — escopo e RLS

- `fn_unidades_no_escopo(usuario_id uuid) → setof uuid` — unidade + descendentes (recursivo); todas se global; vazio p/ agente.
- `fn_escopo_global(uuid) → bool` · `fn_nivel(uuid) → smallint` · `fn_perfil(uuid) → text` · `fn_pode_administrar(uuid) → bool`.
- `fn_escopo_permite(unidade uuid, sigilo text, usuario uuid) → bool` — escopo + trava de `restrito`.
- `fn_acesso_demanda_base(demanda_id, usuario) → bool` — acesso à demanda por vínculo direto/chefia (sem posse de tarefa).
- `fn_pode_ver_demanda(demanda_id, usuario) → bool` — base OU possui alguma tarefa na demanda (vê o cabeçalho).
- `fn_pode_ver_tarefa(tarefa_id, usuario) → bool` — **visibilidade estrita por tarefa**: própria tarefa + subárvore (recursivo por `parent_id`) OU acesso base; NÃO vê tarefas irmãs (critério 4).

## Funções — apoio

- `fn_e_dia_util(date) → bool` · `fn_adiciona_dias_uteis(inicio date, n int) → date` · `fn_dias_uteis_entre(inicio date, fim date) → int`.
- Internas: `fn_usuario_corrente() → uuid`, `fn_exige_justificativa(text)`, `fn_registrar_movimentacao(...)`, `fn_garantir_participante(demanda,usuario,papel,por)`, `fn_gerente_ou_superior_no_escopo(usuario,unidade) → bool`, `fn_transicao_valida(atual,nova) → bool`.

## Funções de negócio (RPC — retorno)

- `fn_criar_demanda(titulo, objeto_queixa, descricao, tipo_id, categoria, setor, prioridade, prazo, escola_id, aluno_nome, numero_processo_solar, sigilo, solicitante_id, responsavel_id, pessoas jsonb) → uuid`
- `fn_encaminhar(destinatario_id, texto, demanda_id, tarefa_id, prioridade, prazo) → uuid` (tarefa)
- `fn_criar_subtarefa(parent_id, responsavel_id, titulo, descricao, prazo, prioridade) → uuid`
- `fn_registrar_devolutiva(tarefa_id, texto, anexos jsonb) → uuid` (movimentacao)
- `fn_alterar_situacao(demanda_id, nova_situacao, texto) → void`
- `fn_solicitar_complementacao(demanda_id, texto) → void` (suspende prazo)
- `fn_concluir(demanda_id, conclusao) → void` · `fn_reabrir(demanda_id, justificativa) → void` (gerente+)
- `fn_editar_demanda(demanda_id, campos jsonb, justificativa) → void` (gerente+)
- `fn_retificar_movimentacao(movimentacao_id, texto_correto, justificativa) → uuid` (janela aberta)
- `fn_registrar_ressalva(movimentacao_id, texto_correto, justificativa) → uuid`
- `fn_inativar(entidade[demanda|tarefa|anexo], id, motivo) → void` · `fn_reativar(entidade, id, motivo) → void` (gerente+)
- `fn_dados_relatorio(demanda_id, anonimizado) → jsonb` — dados p/ o PDF (checa acesso; anonimiza aluno/responsáveis; anexos ativos). SECURITY DEFINER.
- `fn_emitir_relatorio(demanda_id, tipo, anonimizado, hash, codigo, caminho) → uuid` — grava `relatorios_emitidos` + movimentação `emissao_relatorio` (hash/código vêm da Edge Function).
- `fn_validar_relatorio(codigo) → jsonb` — rota **pública** (anon): confirma emissão e devolve metadados + hash.
- **Notificações (S9):** `fn_marcar_notificacao_lida(id)` · `fn_marcar_todas_notificacoes_lidas() → int` (SECURITY DEFINER; tabela sem UPDATE ao front).
- **Autenticação (S3):** trigger `trg_bloquear_dominio` em `auth.users` (via `fn_bloquear_dominio_auth`) barra e-mail fora do domínio · `fn_provisionar_usuario(auth_id, nome, perfil, unidade_id) → uuid` (admin; cria/ajusta acesso, idempotente). Login exige linha em `gestao.usuarios`.

## Convenções de escrita do front

- Chamar via `supabase.rpc('fn_...', { p_param: ... })`. Nunca INSERT/UPDATE direto.
- SELECT de tabelas é permitido (RLS filtra). Anexos ativos: excluir os que têm `auditoria` com acao `inativacao` (e sem `reativacao` posterior).
