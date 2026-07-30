# Sistema de Gestão de Demandas — SME Ribeirão Preto

## Como usar a documentação deste repositório

- `docs/ESPEC.md` — especificação completa. **Leia apenas as seções indicadas no pedido.** Nunca carregue o arquivo inteiro.
- `docs/ESTADO.md` — o que já está pronto, o que falta, decisões tomadas. Leia no início de toda sessão.
- `docs/SCHEMA.md` — resumo do banco (tabelas, colunas, assinaturas das funções). Consulte este arquivo em vez de reler os `.sql`.
- `docs/SESSOES.md` — roteiro de implantação por sessão.

Ao final de cada sessão, atualize `docs/ESTADO.md`.

## Regras invioláveis

1. **Não existe DELETE em nenhuma tabela.** Registros são inativados (`ativo = false` + motivo).
2. **Nenhuma escrita direta do front-end.** Todo INSERT/UPDATE passa por função `SECURITY DEFINER` do Postgres, que valida perfil, grava a movimentação e a auditoria na mesma transação.
3. `movimentacoes`, `comentarios`, `anexos`, `auditoria` e `relatorios_emitidos` não têm policy de UPDATE nem DELETE, e possuem trigger `BEFORE UPDATE OR DELETE` que levanta exceção.
4. **Controle de acesso é RLS**, nunca esconder botão na interface.
5. Escopo de visualização de chefia = unidade do usuário + todas as descendentes, via `WITH RECURSIVE` sobre `unidades_organizacionais`. Nunca escrever regra fixa por cargo.
6. Retificação de movimentação só é permitida enquanto nenhum outro usuário tiver registrado movimentação posterior. Depois disso, apenas `ressalva`.
7. Toda edição, inativação, retificação e ressalva exige justificativa.
8. Timestamps em `timestamptz`; cálculo e exibição em `America/Sao_Paulo`; prazos em dias úteis, consultando `feriados`.
9. Número da demanda gerado no banco (sequence + trigger), formato `DEM-AAAA-NNNNNN`. Nunca no front-end.
10. A `service_role key` jamais aparece no front-end nem em arquivo versionado.

## Padrões de código

- HTML5, CSS3, JavaScript ES modules, Bootstrap 5. **Sem React, Vue, bundler ou build step.**
- Nomes de tabelas, colunas, funções e variáveis em português. Comentários em português.
- Um arquivo por responsabilidade. Máximo ~250 linhas por arquivo; acima disso, dividir.
- Toda chamada ao Supabase fica em `js/services/`. Páginas não chamam o banco diretamente.
- Nada de `innerHTML` com dado vindo do banco sem escapar.
- Mobile-first: o sistema é usado em celular dentro das unidades escolares.

## Fluxo de trabalho esperado

- Antes de implementar, apresente um plano curto e **pare para aprovação**.
- Implemente um arquivo por vez, aguardando OK entre eles.
- Não reescreva arquivo que já funciona: proponha alteração pontual.
- Não invente campos, tabelas ou regras fora de `docs/ESPEC.md`. Em caso de ambiguidade, pergunte.
- Não entregue várias fases de uma vez.
