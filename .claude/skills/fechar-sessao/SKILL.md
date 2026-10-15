---
name: fechar-sessao
description: Ritual completo de encerramento de sessão com "segundo cérebro" (pasta de notas/estado do projeto). Use SEMPRE que o dono disser "registre a sessão", "vou encerrar", "vou fechar o terminal", "garanta que tudo esteja na memória", "atualize o cérebro", "reorganize as tasks", ou qualquer sinal de fim de expediente — mesmo que ele peça só uma parte (ele espera o ritual inteiro). Se a sessão vai continuar depois de um /compact (não morrer), use a skill precompact-check em vez desta.
---

# 🌙 Fechar sessão (ritual do cérebro)

O cérebro do projeto (a pasta de notas e estado que o `CLAUDE.md` aponta) só funciona se TODA
sessão fechar com ele íntegro. O que não for registrado aqui **deixa de existir** quando o
terminal morre — a única verdade compartilhada entre máquinas e sessões é o que está no git.
Este ritual costuma falhar por esquecimento humano (sessão sem nota, tabela de sessões parada,
board com "acordar em <data velha>" por uma semana). Sua função é executar TODOS os passos, sem
depender de o dono lembrar de pedir cada um.

Antes de começar: `date` (ou `Get-Date`) para ter a data/hora REAL — nunca deduza a data de
memória.

## Os 7 passos (a ordem importa)

### 1. Fatos duráveis → notas
Aprendizado que sobrevive à sessão (armadilha nova, decisão, lição) vira nota própria no cérebro
+ ponteiro no índice. Não duplique o que já existe — atualize a nota existente.

### 2. Tarefas → board
Tarefa nova ou concluída: criar/atualizar a nota (com `status` no frontmatter) e refletir no
board. Atualizar as seções vivas com a data de HOJE:
- `## ☀️ PRIMEIRA COISA AO ACORDAR (DD/MM)` — o próximo passo concreto
- `## 🌙 FILA DO PRÓXIMO OVERNIGHT` — ordem por **dinheiro/risco primeiro**
- `⚠️ Regras que a sessão de hoje deixou`

### 3. Nota de sessão (âncora)
Criar/atualizar `sessao-AAAA-MM-DD-<slug>.md` no padrão das outras:
- O que foi feito (com nº de PRs/migrations quando houver)
- `✅ Verificado (com prova)` e `⚠️ Presumido / NÃO verificado` (formato da skill `fable-mode`)
- `🪤` para armadilhas descobertas · `🔴` para bloqueadores
- `🧠 Correções de rota que fiz em mim mesmo` (se houver)
- Fechar com `⏭️ PRÓXIMA SESSÃO` / `🚦 Continua esperando o dono` — checklist do que depende dele

### 4. Tabela de sessões do índice
Adicionar a linha da sessão de hoje na tabela de sessões/marcos. Se houver buraco (sessões
anteriores sem linha), preencher o que der para reconstruir das notas existentes.

### 5. ⭐ Reescrever o estado atual (o passo que mantém o cold-start inteligente)
A seção de **estado atual** no topo do índice é **sobrescrita total** (não envelhece), ~15 linhas:
`📅 CHECKPOINT DD/MM` · foco atual · 🚦 deploy (no ar × pendente) · ▶️ próximo passo ·
🔴 bloqueadores · 💰 gargalo · 🔗 nota de sessão + fatos quentes.

### 6. Git — todas as pontas
```bash
cd <pasta do cérebro> && git add -A && git commit -m "<resumo do dia>" && git push
```
- **Local = remoto**: conferir `git status` limpo e push aceito.
- **Outras cópias** (um servidor, outra máquina): atualizam por `git pull` lá. Se houver acesso
  na sessão, rode o pull; senão, **reporte como pendente** — nunca afirme "todas as pontas ok"
  sem prova (é exatamente o que a `fable-mode` proíbe).
- Se a sessão também mexeu no **repositório de código**: branch enviada + link da PR. Nada de
  trabalho só local.

### 7. Processos fantasmas
Verificar sessões antigas do Claude ainda abertas (cada uma segura memória e MCPs):
```powershell
Get-Process claude -ErrorAction SilentlyContinue | Select-Object Id, StartTime
```
⚠️ Encerrar um processo mata os MCPs filhos dele junto — só encerrar sessões de DIAS ANTERIORES,
nunca a atual nem outra janela ativa de hoje sem confirmar com o dono.

## Checagem de incoerência (o antídoto do ritual falho)
Antes de reportar, conferir os sintomas clássicos de ritual pulado e corrigir se achar:
- Tabela de sessões com última linha mais velha que a última nota `sessao-*.md`
- `☀️ PRIMEIRA COISA AO ACORDAR` com data antiga
- Estado atual apontando para nota que não é a mais recente
- Nota de sessão do dia anterior faltando (trabalho existe no estado atual mas não virou nota)

## Relatório final (formato fixo)
```
🌙 SESSÃO FECHADA:
  nota.........: sessao-<data>-<slug>.md ✅
  tabela.......: linha <data> adicionada ✅
  estado atual.: reescrito (checkpoint <data>) ✅
  board........: ☀️ acordar + 🌙 fila atualizadas ✅
  git cérebro..: commit <hash> + push ✅ | outras pontas: ⚠️ pendente de pull
  repositório..: <branch/PR ou "não tocado">
  fantasmas....: <nenhum | encerrados N antigos>
  ⏭️ Esperando o dono: <lista curta>
```
Só marque ✅ no que você PROVOU (arquivo escrito, push aceito). O resto é ⚠️ com o motivo.
