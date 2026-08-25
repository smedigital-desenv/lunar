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

---

## Guarda anti-vazamento

#### Regra dura: script SQL não entra no Git

**Nunca versione `.sql`.** Nem migração, nem carga, nem "só o esquema", nem
exemplo com dado fictício. Não há exceção a avaliar caso a caso — a regra existe
justamente porque o caso a caso falha.

Como funciona no lugar disso:

- os scripts ficam em `db/`, que **existe só na máquina de quem trabalha** e é
  barrado pelo `.gitignore`;
- são entregues fora do repositório (anexo na conversa, e-mail, upload direto),
  rodados no SQL Editor do Supabase, e vivem lá;
- precisa de um script antigo? Peça a quem executou. Não o traga de volta.

Isto não é hipótese. Até 2026-08-25 o repositório `site` versionava 17 arquivos
`.sql`; quatro deles somavam **3.152 e-mails de servidores da rede**, e ficaram
baixáveis pela web enquanto estiveram lá — o Pages publica da raiz, então todo
arquivo commitado vira URL.

Onde a definição de esquema já está versionada de antes — é o caso de `lunar`,
`saelm`, `repositorio` e `questoes` —, ela fica listada em `.guarda-permitidos`,
arquivo por arquivo e com a justificativa escrita. Estar na lista **não** é
liberação para acrescentar mais: cada arquivo novo exige uma linha nova, e a
linha exige que alguém tenha aberto o arquivo.

**Também nunca versione:**

- `*.csv`, `*.dump`, `*.xlsx`, `*.xls` — export carrega dado real junto, quase
  sempre sem quem escreveu perceber. Estão no `.gitignore`.
- Dado pessoal de qualquer natureza: nome, e-mail, RA, matrícula, CPF, telefone,
  endereço. Nem em código, nem em comentário, nem em dado de exemplo, nem em
  mensagem de commit.
- Credencial de qualquer tipo: `service_role`, senha de banco, token de API,
  chave privada.

#### As CINCO portas da guarda

Nada disso depende de alguém lembrar. **Uma** regra —
`.claude/hooks/verificar-vazamento.sh` — atende cinco portas, porque fechar só
uma não fecha nada:

| Porta | Cobre | O que ela pergunta |
|---|---|---|
| `PreToolUse` / Bash | `git commit` e `git push` do Claude Code | o que está staged; o que está versionado |
| `PreToolUse` / MCP do GitHub | `create_or_update_file`, `push_files` | escrita direta pela API, que não passa por git nenhum |
| `pre-commit` do git | terminal, VS Code, GitHub Desktop | o que está staged |
| `pre-push` do git | última barreira antes de sair da máquina | o que está versionado, e o que os commits não publicados tocaram |
| `.github/workflows/guarda-dados.yml` | o GitHub, a cada push e PR | o que está versionado — e não depende de máquina nenhuma |

⚠️ **O workflow não reimplementa a regra: ele CHAMA a mesma guarda**, em modo
de push. Duas implementações da mesma regra divergem na primeira correção feita
só em uma — e aí uma libera o que a outra barra, sem ninguém saber qual está
certa.

As portas do git se instalam sozinhas: `.githooks/` é versionado e o
`SessionStart` aponta `core.hooksPath` para lá. À mão, uma vez por clone:
`git config core.hooksPath .githooks`.

⚠️ **`git commit` passar não é sinal verde: o push pergunta outra coisa.** O
commit olha o que está staged; o push olha o que está VERSIONADO — e por isso
pega o que entrou por qualquer outro caminho: `--no-verify`, `git add -f`, outra
máquina, outra ferramenta, ou antes de a guarda existir.

⚠️ **A guarda ignora as EXCLUSÕES (`--diff-filter=d`).** Apagar um arquivo
proibido é a correção, não a falta. Até 2026-08-25 ela olhava `--name-only`
puro e barrava justamente o commit que limpava o vazamento — ou seja, tornava
permanente qualquer vazamento que já tivesse acontecido.

⚠️ **E-mail institucional também é dado pessoal.** Três ou mais endereços
`.gov.br` distintos no mesmo diff bloqueiam; um endereço de contato num
documento passa. O vazamento de 2026-08 foram 3.152 endereços institucionais, e
a regra antiga liberava `.gov.br` inteiro.

⚠️ **O `%` fica FORA da parte local do e-mail, e isso não é descuido de
regex.** Com ele, o coringa do SQL (`email like '%@educacao.pmrp.sp.gov.br'`)
casa como se fosse endereço de gente, e uma checagem de domínio vira "dado
pessoal publicado". Foi assim que a auditoria acusou quatro arquivos do `lunar`
que não tinham endereço nenhum de pessoa.

⚠️ **Nada disso apaga o histórico, e o `.gitignore` não destrava arquivo já
rastreado.** A guarda impede o PRÓXIMO vazamento. O que já foi publicado só sai
com reescrita de histórico e força-push.

#### Quando uma guarda te barra

**A resposta certa é tirar o arquivo do commit**, não contornar a guarda.
`git commit --no-verify`, `git add -f` e `SME_PERMITIR_COMMIT=1` existem para
falso positivo em arquivo que comprovadamente não tem dado pessoal — nunca para
publicar um `.sql`. Na dúvida, pergunte antes de commitar; desfazer depois custa
semanas.

⚠️ **E a válvula destranca UMA porta, não a publicação.** O que entrar com
`SME_PERMITIR_COMMIT=1` continua barrado no `push` e no workflow. É de
propósito: um descuido não pode virar publicação por causa de uma variável de
ambiente.

Falso positivo que se repete — um modelo em branco que a própria página oferece
para download, a definição de esquema de um sistema — vai para
**`.guarda-permitidos`**: uma linha por caminho, linha terminada em `/` cobre a
pasta, e a justificativa escrita ao lado ou em bloco acima. **A mesma lista é
lida pela guarda local, pelo workflow e pela auditoria semanal da rede** — se
cada um tivesse a sua, uma liberaria o que a outra barra.

⚠️ **Liberar o caminho NÃO desliga a checagem de conteúdo.** Um arquivo novo
dentro de uma pasta liberada continua barrado se trouxer CPF, chave privada,
`service_role` ou lista de e-mails. Antes de acrescentar uma linha, **abra o
arquivo** e procure nome, e-mail, RA, matrícula, CPF, telefone e endereço; se
achar qualquer um, ele não entra na lista — sai do Git.

#### Como a regra chega a todo aparelho

São dois alcances diferentes, e os dois são necessários: a **memória** faz o
Claude Code saber a regra; a **guarda** impede a publicação mesmo de quem não
leu. O texto canônico da memória está em `.claude/memoria-perfil.md`.

| Onde | Alcance | Como instalar |
| --- | --- | --- |
| Setup script do ambiente de nuvem | Toda sessão de nuvem, **de qualquer aparelho** — navegador, celular, desktop, `claude --cloud`, rotinas | claude.ai/code → Environments → Setup script, colando `.claude/setup-ambiente-nuvem.sh` |
| `~/.sme-guarda` + `core.hooksPath` global | **Todo repositório daquele computador**, inclusive os que ainda não existem, e toda sessão do Claude Code daquele perfil | `curl -fsSL https://smedigital.com.br/guarda/instalar.sh \| bash`, uma vez por máquina |
| `.githooks/` + `.claude/settings.json` do repositório | Quem clonar este repositório, com ou sem instalador | vem versionado; o `SessionStart` liga sozinho |
| `.github/workflows/guarda-dados.yml` | O GitHub, independente de máquina | vem versionado |
| `CLAUDE.md` de cada repositório | Quem trabalha naquele repositório | replicar esta seção |

O setup script é o que resolve "qualquer computador ou celular" para a memória:
roda como root antes de o Claude Code iniciar e grava `~/.claude/CLAUDE.md`
dentro do container. Como o ambiente é do perfil, e não do aparelho, vale
igualmente no celular e no navegador. O instalador por máquina é o que resolve
o mesmo para a guarda, inclusive fora do Claude Code.

⚠️ **O ambiente de nuvem é efêmero.** O que você instalar à mão dentro de uma
sessão morre com o container; o que vale na sessão seguinte é o que está no
setup script do ambiente ou versionado no repositório.

Ao criar um repositório novo nesta rede, copie para ele o `.gitignore`, o hook,
o `.githooks/`, o workflow e esta seção — ou comece pelo `template-sistema-sme`,
que já traz tudo.

