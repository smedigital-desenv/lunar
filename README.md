# Sistema de Gestão de Demandas — SME Ribeirão Preto

Workflow de demandas institucionais da Secretaria Municipal de Educação. Cada demanda funciona como processo administrativo: nada é excluído, todo ato fica registrado, o histórico é a fonte de verdade.

## Documentação

| Arquivo | Para quê |
|---|---|
| `CLAUDE.md` | Invariantes do projeto. Carregado automaticamente em toda sessão do Claude Code. |
| `docs/ESPEC.md` | Especificação completa, dividida em seções numeradas. |
| `docs/SESSOES.md` | Roteiro de implementação, com o prompt pronto de cada sessão. |
| `docs/ESTADO.md` | Situação atual do desenvolvimento. Atualizado ao fim de cada sessão. |
| `docs/SCHEMA.md` | Resumo do banco. Gerado na Sessão 1. |

## Antes da Sessão 1

1. **Projeto no Supabase** criado, com a região `sa-east-1` se disponível.
2. **Google OAuth** habilitado em Authentication → Providers, com as credenciais do Google Cloud da Prefeitura.
3. **Restrição de domínio**: aceitar apenas `@educacao.pmrp.sp.gov.br`. Configure no provedor e confirme no banco, na função de provisionamento.
4. **Bucket de anexos** no Storage, privado.
5. `js/config.js` criado a partir de `js/config.example.js`, com a URL do projeto e a **anon key**.

> A anon key pode ir para o front-end — ela é pública e a proteção real é a RLS.
> A **service_role key nunca** entra no repositório nem no navegador.

## Rodar localmente

```bash
python3 -m http.server 8080
# abrir http://localhost:8080/pages/login.html
```

Adicione `http://localhost:8080` às Redirect URLs do Supabase Auth durante o desenvolvimento.

## Publicar

GitHub Pages a partir da branch `main`, pasta raiz. A URL de produção também precisa constar nas Redirect URLs do Supabase.

## Ordem de trabalho

Siga `docs/SESSOES.md`, uma sessão por vez, com `/clear` entre elas. As Sessões 1 e 2 definem o resto: com o banco correto, o front-end vira trabalho mecânico.
