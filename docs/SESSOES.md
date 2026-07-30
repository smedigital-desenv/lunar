# Roteiro de implantação — uma sessão por bloco

Regras gerais de uso:

- Comece **toda** sessão com: `Leia CLAUDE.md e docs/ESTADO.md. Não leia mais nada até eu pedir.`
- Termine **toda** sessão com o comando de encerramento (final deste arquivo).
- Entre sessões, use `/clear`. Dentro de uma sessão longa, `/compact` por volta de 60% do contexto, com instrução de preservação.
- Faça commit a cada entrega aprovada.

---

## Sessão 1 — Banco de dados

```
Leia CLAUDE.md e docs/ESTADO.md.
Depois leia SOMENTE as seções 2, 5, 6, 7, 9, 10, 11, 13, 18, 19 e 20 de docs/ESPEC.md.

Antes de escrever qualquer código, apresente um plano de no máximo 30 linhas com:
- lista de tabelas e suas colunas-chave;
- lista das funções SECURITY DEFINER com assinatura;
- como a consulta recursiva sobre unidades_organizacionais será usada nas policies.
Pare e aguarde minha aprovação.

Depois de aprovado, gere um arquivo por vez, aguardando meu OK entre cada um:
sql/001_extensoes.sql
sql/002_tabelas.sql
sql/003_indices.sql
sql/004_funcoes_escopo.sql
sql/005_rls.sql
sql/006_triggers_imutabilidade_auditoria.sql
sql/007_funcoes_negocio.sql
sql/008_seed.sql

O seed deve criar o organograma completo (Gabinete, 3 subsecretarias, gerências e seções),
usuários fictícios em todos os perfis, tipos de demanda, escolas e feriados do ano corrente.
```

Ao final: `Gere docs/SCHEMA.md com no máximo uma página: tabelas com colunas, relacionamentos e assinatura de todas as funções. É este arquivo que as próximas sessões vão consultar.`

---

## Sessão 2 — Testes de RLS e regras

```
Leia CLAUDE.md, docs/ESTADO.md e docs/SCHEMA.md.
Leia SOMENTE a seção 22 de docs/ESPEC.md (critérios de aceite).

Gere sql/999_testes.sql: um script que executa cada um dos 13 critérios de aceite
usando SET LOCAL ROLE / auth.uid() simulado, imprimindo PASSOU ou FALHOU por critério.
Não altere o schema nesta etapa. Depois de eu rodar, corrija apenas o que falhar.
```

---

## Sessão 3 — Autenticação

```
Leia CLAUDE.md, docs/ESTADO.md e docs/SCHEMA.md.
Leia SOMENTE a seção 2 de docs/ESPEC.md.

Implemente:
- js/config.js a partir de js/config.example.js (não versionar valores reais);
- js/auth.js: login com Google via Supabase Auth, restrito ao domínio @educacao.pmrp.sp.gov.br,
  logout, guarda de rota e obtenção do usuário corrente com perfil e unidade;
- pages/login.html com Bootstrap 5.

O bloqueio de domínio deve existir também no banco, na função de provisionamento do usuário.
```

---

## Sessão 4 — Camada de serviços

```
Leia CLAUDE.md, docs/ESTADO.md e docs/SCHEMA.md.

Implemente js/services/, um arquivo por vez, aguardando meu OK:
demandas.js · tarefas.js · movimentacoes.js · anexos.js · notificacoes.js · relatorios.js · admin.js

Cada função é um wrapper fino sobre as funções do banco (rpc), com tratamento de erro
padronizado e nenhuma regra de negócio duplicada no JavaScript.
```

---

## Sessão 5 — Tela da demanda (define o padrão visual)

```
Leia CLAUDE.md, docs/ESTADO.md e docs/SCHEMA.md.
Leia SOMENTE as seções 8, 10 e 12 de docs/ESPEC.md.

Implemente pages/demanda.html + js/ui/demanda.js: cabeçalho com dados da demanda,
árvore de subtarefas, timeline cronológica completa e ações disponíveis conforme o perfil.

Esta tela é a REFERÊNCIA visual e estrutural do sistema. Capriche no layout, no CSS
compartilhado (assets/css/app.css) e nos componentes reutilizáveis (js/ui/componentes.js).
As telas seguintes vão copiar este padrão.
```

---

## Sessão 6 — Caixa de entrada e caixa de saída

```
Leia CLAUDE.md, docs/ESTADO.md e docs/SCHEMA.md.

Implemente pages/caixa-entrada.html e pages/caixa-saida.html seguindo EXATAMENTE o padrão
de pages/demanda.html e js/ui/componentes.js. Filtros: pendentes, em andamento, urgentes,
encerrados, todos. Paginação. Nada de estilo novo — reutilize assets/css/app.css.
```

---

## Sessão 7 — Modais de tramitação

```
Leia CLAUDE.md, docs/ESTADO.md e docs/SCHEMA.md.
Leia SOMENTE as seções 8, 9, 10 e 13 de docs/ESPEC.md.

Implemente os modais em js/ui/: encaminhar, criar subtarefa, registrar devolutiva com anexos,
solicitar complementação, concluir (com conclusão obrigatória), reabrir, inativar/reativar,
retificar (só com a janela aberta) e ressalva. Reutilize os componentes existentes.
```

---

## Sessão 8 — Dashboard e pesquisa

```
Leia CLAUDE.md, docs/ESTADO.md e docs/SCHEMA.md.
Leia SOMENTE as seções 16 e 17 de docs/ESPEC.md.

Implemente pages/dashboard.html e pages/pesquisa.html. Os contadores vêm de views ou funções
no banco, já filtradas por RLS — não calcule no JavaScript. Busca textual com tsvector em português.
```

---

## Sessão 9 — Notificações

```
Leia CLAUDE.md, docs/ESTADO.md e docs/SCHEMA.md.
Leia SOMENTE a seção 15 de docs/ESPEC.md.

Implemente o badge de notificações no cabeçalho, a lista com lida/não lida e a marcação de leitura.
Use Supabase Realtime se for simples; caso contrário, polling a cada 60 segundos.
```

---

## Sessão 10 — Relatórios em PDF

```
Leia CLAUDE.md, docs/ESTADO.md e docs/SCHEMA.md.
Leia SOMENTE a seção 14 de docs/ESPEC.md.

Implemente uma Edge Function (Deno) que gera os dois documentos: relatório-resumo e inteiro teor.
A4, numeração "Página X de Y", rodapé com hash SHA-256 e código de verificação, versão anonimizada
para demandas de sigilo restrito. Cada emissão grava em relatorios_emitidos e na timeline.
Inclua também a rota pública de validação do hash.
```

---

## Sessão 11 — Implantação

```
Leia CLAUDE.md e docs/ESTADO.md.

Gere docs/IMPLANTACAO.md: passo a passo para criar o projeto no Supabase, configurar o Google OAuth
com restrição de domínio, rodar os scripts SQL na ordem, criar o bucket de anexos com suas policies,
publicar as Edge Functions, configurar o GitHub Pages e cadastrar o organograma real.
Inclua checklist de verificação pós-implantação.
```

---

## Comando de encerramento de sessão

```
Atualize docs/ESTADO.md: o que foi concluído nesta sessão, o que ficou pendente,
decisões tomadas que não estão evidentes no código e dúvidas em aberto.
Máximo 40 linhas. Não repita o que já está em docs/ESPEC.md.
```
