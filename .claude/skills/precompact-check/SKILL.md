---
name: precompact-check
description: Rotina pré e pós /compact — garante que nada se perde na compactação e gera o prompt de retomada padrão. Use SEMPRE que o dono disser "vou compactar", "garanta que tudo esteja registrado, vou fazer um compact", "me dê o prompt de início pós-compact", ou quando a janela estiver perto do limite e uma compactação for iminente (ofereça você). Se em vez de compactar a sessão vai MORRER (fechar o terminal), use a skill fechar-sessao.
---

# 📦 Precompact Check

A compactação resume a conversa e descarta detalhes; o que não estiver nos arquivos certos
**some**. Esta skill padroniza os dois lados: validar ANTES e recontextualizar DEPOIS — em vez
de o dono digitar, a cada vez, uma variação de "compacta mas preserva tudo".

Pré-requisito: um **cérebro do projeto** (pasta apontada no `CLAUDE.md`) com três coisas —
roteiro de entrada, **estado atual** (uma seção reescrita a cada marco) e **board de tarefas**.

## Protocolo PRÉ-compactação

Execute em ordem. Se algo falhar, **corrija antes** — não compacte com pendência.

### 1. Git do repositório (se a sessão tocou código)
`git status --short` + branch atual. Modificação solta → commitar na branch de trabalho;
branch não enviada → push. (Branch sempre a partir da principal.)

### 2. Cérebro: a seção de estado atual
A seção de **estado atual** precisa refletir o estado REAL de agora: o que subiu nesta sessão,
próximo passo, bloqueadores. Desatualizada → reescrever já (é sobrescrita total, não acumula).

### 3. Board fiel
O que a sessão concluiu está marcado? Tarefa nova descoberta virou nota?

### 3b. Plano com estado em arquivo (se o projeto tiver um)
Se o projeto guarda o andamento de um plano em arquivos (ex.: um `execplan.md` com tabela de
fases e um bloco `## 🔄 ESTADO` por fase): reescrever o ESTADO da fase em andamento (branch,
commits, o que está PROVADO, próximo passo em 1 linha), marcar os checkboxes fechados na
conversa e atualizar a tabela. A retomada depende SÓ desses arquivos — checkbox não marcado =
trabalho que será refeito.

### 4. Cérebro: commit + push
```bash
cd <pasta do cérebro> && git add -A && git commit -m "<checkpoint pré-compact>" && git push
```
Commit sem push não sobrevive a desastre local — o backup é o push.

### 5. Gerar o PROMPT DE RETOMADA (entregar sempre, sem o dono pedir)
Bloco pronto para colar depois do `/compact`. Estrutura fixa, preenchida com o estado real:

```
Retomando <projeto> depois de um compact.
ONDE ESTAMOS — Repo: <caminho + branch> · Cérebro: <pasta>
  (ler <roteiro de entrada> → <estado atual> → <board>)
ESTADO — <o que já está feito/no ar nesta sessão: PRs, migrations, deploys>
O QUE FALTA — 1) … 2) … 3) …
COMO VALIDAR — <strings/checagens em produção que provam cada item>
ARMADILHAS — <as que a sessão já descobriu; não redescobrir>
```

### 6. Instrução de compact padrão
Sugerir ao dono usar exatamente:
`/compact compacte apenas explicações; preserve alterações realizadas, decisões, migrations/banco e planos pendentes de execução`

Se o projeto tiver um hook pós-compact que reinjeta a ordem de leitura do cérebro, melhor ainda;
a instrução acima cobre o lado do resumo.

### 7. Resumo final
```
📦 PRÉ-COMPACT:
  git repo.....: ✅ <branch> limpa/enviada | — não tocado
  estado atual.: ✅ atualizado
  board........: ✅ fiel
  plano........: ✅ ESTADO da fase + tabela | — sem fase ativa
  git cérebro..: ✅ commit + push
  prompt retomada: ✅ entregue acima
  → Pronto para /compact
```

## Protocolo PÓS-compactação (após retomar)

1. Ler roteiro de entrada → estado atual → board (nessa ordem) antes de agir. Se houver plano
   com estado em arquivo: ler SÓ a fase em andamento — o bloco ESTADO é a verdade do ponto de
   retomada; conferir contra o git; NÃO ler as outras fases (controle de contexto).
2. `git log --oneline -3` no cérebro e `git branch --show-current` no repositório — batem com o
   que o estado atual afirma?
3. **Não recontestar decisão já tomada antes do compact.** Decisão registrada = decidida.
4. Sumiu algo → reconstruir dos arquivos, não perguntar "onde paramos?" ao dono.
