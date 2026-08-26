# Os scripts de banco não moram mais no Git

Os `.sql` deste diretório foram **desrastreados** em 2026-08-26. Eles continuam
no seu disco e continuam sendo a fonte para rodar no SQL Editor do Supabase —
o que mudou é que não são mais versionados.

## Por quê

Este repositório é público. A auditoria da rede encontrou, em quatro deles,
**14 endereços `@educacao.pmrp.sp.gov.br` de servidores identificáveis** —
onze só no `008_seed.sql`. Endereço de servidor é dado pessoal, e a regra da
rede é explícita: `.sql` não entra no Git, sem exceção.

## Onde os arquivos estão

- **No seu disco**, em `sql/` e `scripts/` — nada foi apagado.
- **No histórico do Git**, recuperáveis a qualquer momento:

  ```bash
  git show 754a4df:sql/008_seed.sql > sql/008_seed.sql
  git show 754a4df:sql/ -- --name-only   # lista o que havia
  ```

⚠️ **Isso significa que o histórico ainda os contém, e o histórico é público.**
Desrastrear impede o PRÓXIMO commit; não desfaz os anteriores. Fechar o
passado exige privar o repositório (e, se a gestão entender necessário,
reescrever o histórico com `git filter-repo`).

## E a documentação que cita `sql/00X.sql`

`docs/ESPEC.md`, `docs/SCHEMA.md` e `docs/SESSOES.md` continuam citando os
arquivos pelo nome. Os nomes seguem válidos — é assim que os scripts se chamam
no disco de quem trabalha. Só não estão mais neste repositório.
