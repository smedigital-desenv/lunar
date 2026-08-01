# Roteiro de testes (navegador)

Testes manuais de ponta a ponta, agora que a autenticação existe. Rode na
ordem — cada passo depende do anterior. Marque conforme for validando.

## 0. Pré-requisitos

- [ ] `js/config.js` preenchido com **URL** e **anon key** do seu Supabase.
- [ ] SQL `001`…`013` **e** `008_seed.sql` executados.
- [ ] **Authentication → Providers → Email** habilitado (para o login de teste).
- [ ] (Relatórios) Edge Function `relatorios` publicada + bucket `relatorios`.
- [ ] Opcional: rode `sql/999_testes.sql` — todos os critérios devem dar `PASSOU`.

**Usuários do seed** (senha `dev-123456`):

| Login | Nome | Perfil | Unidade |
|---|---|---|---|
| `secretario@educacao.pmrp.sp.gov.br` | Ana | gabinete | Gabinete |
| `gerente.gef@educacao.pmrp.sp.gov.br` | Eduardo | gerente | GEF |
| `chefe.sai@educacao.pmrp.sp.gov.br` | Gustavo | chefe_secao | SAI |
| `agente.sai@educacao.pmrp.sp.gov.br` | Igor | agente | SAI |
| `agente.sfo@educacao.pmrp.sp.gov.br` | Júlia | agente | SFO |
| `admin.ti@educacao.pmrp.sp.gov.br` | Kléber | admin_ti | (global) |

> Se o login por senha falhar, recrie os usuários de teste em **Auth → Add
> user** (mesmo e-mail) — ver `docs/IMPLANTACAO.md`, passo 6.

## 1. Login e sessão (Sessão 3)

- [ ] `pages/login.html` → "Acesso de teste" → entra como **Gustavo**.
- [ ] Cabeçalho mostra nome + perfil; botão **Sair** funciona.
- [ ] Link **Admin** NÃO aparece para Gustavo.
- [ ] Entra como **Kléber** → link **Admin** aparece.
- [ ] Abrir uma página interna sem sessão (aba anônima) redireciona ao login.

## 2. Criar demanda (tela "Nova demanda")

- [ ] Como **Gustavo**: Caixa de entrada → **+ Nova** → preenche Título e
      Objeto/queixa, prioridade **alta**, adiciona uma pessoa envolvida → **Criar**.
- [ ] Redireciona para a demanda com número **`DEM-2026-000001`** (gerado no banco).
- [ ] A demanda aparece na **Caixa de saída** de Gustavo.

## 3. Tramitação (Sessão 7)

- [ ] Na demanda, **Encaminhar** para **Igor**; informe texto/prazo.
- [ ] Entra como **Igor** → a tarefa aparece na **Caixa de entrada**.
- [ ] Igor abre a tarefa e registra **Devolutiva** (com anexo, se testar Storage).
- [ ] **Solicitar complementação** e **Concluir** (conclusão é obrigatória).

## 4. Visibilidade / RLS (critério 4)

- [ ] Entra como **Júlia** (unidade SFO, sem relação com a demanda):
      a demanda de Gustavo **não** aparece nas caixas dela.
- [ ] Abrir a URL `demanda.html?id=<id da demanda>` como Júlia **não** mostra
      os dados (RLS bloqueia).
- [ ] Como **Eduardo** (gerente da GEF): enxerga demandas da sua unidade e
      descendentes; não enxerga as de outra subsecretaria.

## 5. Notificações (Sessão 9)

- [ ] Após o encaminhamento, o **sino** de Igor mostra o contador.
- [ ] Abrir o painel, clicar numa notificação (navega à demanda) e
      **Marcar todas como lidas** zera o contador.

## 6. Painel e pesquisa (Sessão 8)

- [ ] **Painel**: contadores refletem as demandas criadas (respeitando o escopo).
- [ ] **Pesquisa**: busca por título, número e nº de processo Solar retorna a demanda.

## 7. Retificação e ressalva (Seção 10)

- [ ] Retifica a **própria** movimentação enquanto ninguém registrou depois.
- [ ] Depois de outra movimentação, a retificação some e resta **Ressalva**.
- [ ] Toda edição/inativação/retificação exige justificativa.

## 8. Relatórios (Sessão 10 — precisa da Edge Function + bucket)

- [ ] Na demanda, **Relatório-resumo** e **Inteiro teor**: baixa PDF A4 com
      "Página X de Y" e rodapé com hash + código + URL.
- [ ] Demanda **restrita** oferece versão **anonimizada** (sem nome de aluno).
- [ ] Abrir a **URL de validação** com o código confirma o documento.
- [ ] A emissão vira uma movimentação `emissao_relatorio` na timeline.

## 9. Administração de usuários (Sessão 3)

- [ ] Como **Kléber**: **Admin** → inativa e reativa um usuário (com justificativa).
- [ ] Um usuário novo faz login uma vez → aparece em **"Contas aguardando
      liberação"** → Kléber define perfil/unidade → **Liberar** → o usuário passa
      a ter acesso.

## 10. Imutabilidade (critério 1)

- [ ] No SQL Editor, tentar `update`/`delete` em `movimentacoes`, `comentarios`,
      `anexos`, `auditoria` ou `relatorios_emitidos` → **exceção** (trigger).
