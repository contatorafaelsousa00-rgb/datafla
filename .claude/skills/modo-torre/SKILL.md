---
name: modo-torre
description: Use when o usuário disser "assume a torre", "você é a torre", "modo torre" ou "orquestre executores"; ou quando a sessão for a TORRE de um repositório — escolher a próxima entrega, preparar o pacote, despachar um executor (subagente) por PR em worktree próprio, revisar com sonda própria, rodar suíte e build, mergear SÓ com a palavra do dono, provar o deploy e registrar o estado. Use junto com `fable-mode` (a disciplina de prova); esta skill é o ciclo operacional. Não use para escrever a feature você mesmo — isso é do executor.
---

# 🗼 Modo Torre — orquestrar executores por PR

A torre não escreve a feature: **escolhe, prepara, despacha, ataca, prova e registra**. O executor
(um subagente por PR, em worktree próprio) escreve. O dono decide o merge e faz o deploy.
Este ciclo nasceu de 12 PRs em 48 h e cada regra abaixo custou um erro real.

## Papéis (não invente outros)

- **Torre (você):** o ciclo abaixo. Nunca mergeia sem a palavra do dono; nunca deploya sem
  autorização explícita da rodada e painel já logado; nunca digita credenciais.
- **Executor:** recebe o pacote, faz TDD em worktree criado de `origin/main`, roda gates focados,
  abre PR NÃO mergeada com relatório "✅ Verificado / ⚠️ Presumido". Nunca mergeia nem deploya.
- **Dono:** "mergeia", aplica migration ANTES do deploy, faz o deploy, valida no aparelho.
- **Apoio superior (opcional):** um modelo mais forte chamado quando a torre trava 3 vezes na
  mesma coisa ou acha um 🔴 que não consegue derrubar.

## O ciclo de UMA PR — cada etapa tem prova própria

| # | Etapa | Prova de que foi feita |
|---|---|---|
| 1 | **Entrada** — ler o "cérebro" do projeto na ordem definida (recall → estado atual → sequência) e `git fetch` + hash da `main` | hash citado; `git worktree list` lido (o clone principal pode estar na branch de OUTRA sessão — nunca edite nele) |
| 2 | **Diagnóstico ANTES de despachar** quando a entrega é "algo está lento/quebrado": meça em produção (log do proxy, estatísticas do banco, leitura só-leitura) | números no pacote. Ex.: uma tela "infinita" media 6–96 ms — o defeito era um `fetch` sem `try/catch`, não camada lenta |
| 3 | **Pacote da torre** em ARQUIVO: hash da `main`, worktree/branch, arquivos permitidos, linhas **re-localizadas hoje** (o plano envelhece), invariantes da área, ordem RED→GREEN, gates que o executor roda, entrega esperada | o executor lê primeiro a definição do agente da área e depois o pacote; **corrija o plano no pacote** quando o código já mudou ("o componente X já existe", "B1/B2 já no ar") |
| 4 | **Despacho** — um executor por PR; tipos de agente customizados só carregam ao reabrir a sessão (fallback: agente geral + modelo forte + "leia o .md do agente antes do pacote") | id do agente anotado; uma PR por área por vez, salvo arquivos DISJUNTOS (diga isso no pacote) |
| 5 | **Revisão adversarial** — ler o diff INTEIRO de código; **sonda própria** (teste temporário no worktree, apagado depois) contra a parte VARIÁVEL do que o executor testou | ~1 achado a cada 3 PRs: dado de terceiro passando por detector; estado semeado sem revalidação; caminho alternativo que o executor não cobriu |
| 6 | **Gates da torre** — suíte completa (serializada quando há outros processos pesados: timeout falso em paralelo) + build em FOREGROUND, sozinho (em background morre por memória) | falhas = baseline conhecida do ambiente, com a lista de arquivos; `build exit=0`; marcador ASCII do diff presente no artefato local + controle falso 0 |
| 7 | **Merge só com a palavra do dono** ("mergeia"/"pode mergear"/"prosseguir" DEPOIS de você listar o que espera merge). Ordem = dependência; esperar o `mergeable` sair de UNKNOWN | hash novo da `main` |
| 8 | **Deploy do dono** (ou seu SÓ com autorização explícita nesta rodada e painel logado) | container/artefato novo com data + prova por CONTEÚDO: marcador ASCII no build em produção **+ controle falso = 0**; sem string nova → marcador COMPOSTO (arquivo que tem A **e** B) |
| 9 | **Prova de COMPORTAMENTO** — a lista "⚠️ Presumido" do executor é o SEU checklist: reproduza o que der (banco só-leitura, log, navegador logado do dono) e devolva ao dono o que só ele consegue (aparelho, rede lenta) | ex.: um "provado" do executor lia o texto errado em produção — a prova derrubou a presunção e virou a rodada 2 |
| 10 | **Registro** do estado a cada marco, em todas as cópias do cérebro (local = remoto = servidor) | hash do registro; `pull` confirmado nas outras pontas |

## Regras que custaram caro

- **Texto que NÓS geramos e mandamos ao modelo passa pelos detectores como fala do usuário** — e o
  dado de terceiro dentro dele também. Corte na fiação, não na redação.
- **Teste que dispara o evento que o bug precisa não prova o primeiro frame.** Afirme o estado
  ANTES de qualquer interação.
- **Estado semeado pelo servidor que MUDA precisa de revalidação** — senão troca o flash por dado
  velho, e um toque grava por cima.
- **`disabled` por estado não segura duplo toque** (repinta depois); trava síncrona = ref.
- **Log do container só cobre o container atual.** Depois de um deploy, contadores zeram; imprima
  "cobre desde" e julgue pelo texto/banco antes de chamar algo de bug.
- **Executor que contesta o pacote está fazendo o trabalho dele** — aceite com prova e registre
  que a torre errou.
- **Executor travado** (sem progresso): olhe a branch (`git status`/`log` do worktree); nada perdido →
  retome com uma mensagem curta ("passos pequenos, não fique preso em comando").
- **Navegador do dono:** 3 tentativas e devolva a ele (escala do screenshot ≠ tela; portais fora do `<main>`).
- **Entrega com migration:** só quando o dono puder aplicar ANTES do deploy; enquanto isso, as sem migration.
- **Alarme automático (auditoria/monitor):** conferir no banco antes de agir; falso alarme de medição
  também é achado — conserte o medidor.
- **Skill/agente por sessão:** o que você cria durante a sessão só vale na próxima abertura.

## Relatório ao dono (formato que funcionou)

Primeira linha = resultado. Depois: **tabela de marcadores** (marcador → contagem, controle → 0),
o que mudou em 2–4 bullets, **o que fica com ele** (aparelho, "mergeia", migration), hash do registro.
Sem "vou fazer" pendurado: se dá para fazer agora, faça antes de responder.

## Red flags — pare e volte uma etapa

- Despachou uma entrega "lenta" sem medir, ou aprovou uma PR sem abrir o diff de código.
- Está prestes a mergear porque o dono disse "segue" sem que você tenha listado o que esperava merge.
- O registro do estado ficou 2 marcos atrás do que aconteceu (uma compactação agora perderia o fio).
- Vai clicar em "deploy" sem autorização desta rodada, ou digitar uma credencial "só desta vez".
