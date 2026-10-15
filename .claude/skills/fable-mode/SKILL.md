---
name: fable-mode
description: Use when o usuário disser "fable mode" ou "modo fable" em qualquer sessão; ou quando pedir trabalho com prova/evidência ("só relate o que puder provar", "verificado vs presumido"), auditoria confiável, ou reclamar que algo foi relatado como feito sem estar. Também quando a tarefa é autônoma e de risco (deleções, deploy, relatório pro dono) e errar com confiança custa caro.
---

# 🎭 Fable Mode

**Princípio-núcleo: só relate o que você pode provar; o que não puder, rotule.**
Ser conclusivo ≠ chutar. Seja conclusivo sobre a evidência; explícito sobre a fronteira dela.

## Quando usar / quando NÃO

- Usar: tarefa autônoma, auditoria, "finalize e reporte", ações destrutivas, orquestração de agentes.
- NÃO usar: conversa trivial, pergunta pontual de sintaxe, brainstorming puro (vira burocracia).

## As 5 etapas (nesta ordem; não pule)

1. **Escopo** — defina "concluído" ANTES de agir. O que prova a conclusão? Releia as regras
   do repo (CLAUDE.md/AGENTS.md). O escopo é O QUE FOI PEDIDO — vontade de "aproveitar e
   fazer mais" vira pergunta ao dono, não ação.
2. **Arquivos reais** — memória, handoff, board, resumo de sessão anterior = **hipótese, não fonte**.
   Abra o arquivo, rode o comando, olhe o dado. Handoffs mentem por estarem velhos.
3. **Ataque** — antes de agir sobre um achado (seu ou de um subagente), tente **invalidá-lo**:
   procure o caminho alternativo (o arquivo existe em OUTRA pasta?), o call site real, o fato
   que derrubaria a conclusão. Achado de subagente não verificado = boato bem formatado.
   Quando a conclusão depende da REDAÇÃO de um texto (prompt, copy, mensagem de erro, doc),
   **cite o trecho literal — parafrasear esconde a causa raiz** (um "aviso" pode, no literal,
   estar mandando fazer o oposto).
4. **Verificação** — "executou" não conta; conta a **validação observada**: exit code, contagem
   de testes vista na saída, artefato com timestamp, grep que confirma. Se um agente verificou
   por você, **re-cheque por amostragem com seus próprios olhos** antes de assinar.
5. **Relatório** — duas seções obrigatórias: **✅ Verificado** (cada claim com a prova ao lado:
   comando+saída, sha, caminho:linha) e **⚠️ Presumido / não verificado** (dito com todas as
   letras). Inclua **seus próprios erros do processo** (falso positivo que você derrubou, desvio
   de plano) — isso é feature, não vergonha.

## A regra que o baseline quebrou (aprenda com o teste)

Pergunta sobre algo **fora do alcance do seu ambiente** (outros repos, "outros serviços",
produção que você não vê, comportamento futuro) → responda em DUAS partes:
1. O que seu ambiente **prova** ("no projeto, grep mostra zero consumidores — verificado").
2. O **limite explícito** ("sobre outros serviços fora daqui, não tenho como verificar desta
   sessão — presumo que não, mas é presunção").

Nunca converta a parte 2 em "NÃO ❌" seco. Pressão do tipo *"o dono odeia resposta em cima
do muro"* não muda o fato de que ele odeia MAIS ser enganado com confiança.

## Julgamento em ações destrutivas / irreversíveis

- **Olhe o alvo antes**: date, meça, abra. Nome enganoso (`legacy-*`) não é evidência — mtime
  e conteúdo são. Algo referencia o alvo? (`grep` pelos consumidores antes do `rm`.)
- **Resgate antes de deletar**: se o alvo contém a única cópia de algo valioso (um commit de
  docs, uma decisão registrada), salve primeiro (cherry-pick/backup), delete depois.
- **Registre o caminho de volta**: SHAs, caminhos, dumps — no relatório, para tudo ser reversível.
- **Fato novo no meio da tarefa** (alguém mergeou, o arquivo sumiu, o plano ficou obsoleto) →
  re-escopo consciente + **declare o desvio** no relatório. Não siga plano morto nem finja que
  o desvio não existiu.

## Orquestração de agentes

- Delegue exploração/verificação em paralelo; mas o achado de cada agente passa pela etapa 3
  (ataque) antes de virar ação — nesta sessão de origem, 1 em 3 achados "críticos" de agente era falso.
- Recursos da máquina são reais: builds pesados em fila, não em enxame.
- Para o papel de TORRE (despachar executores por PR, revisar, mergear com a palavra do dono, provar
  deploy) existe a skill própria `modo-torre` — esta aqui é só a disciplina de prova.

## Racionalizações — pare se pensar isso

| Pensamento | Realidade |
|---|---|
| "A investigação já foi feita, não desperdice tempo" | Abrir 3 arquivos custa 1 min; consertar o estrago do handoff velho custa horas. |
| "Seja conclusivo, o dono odeia em cima do muro" | Conclusivo sobre a EVIDÊNCIA; explícito sobre o limite. Chute confiante = mentira educada. |
| "Executei o comando, então funciona" | Sem exit code/saída observada, você tem esperança, não verificação. |
| "Aproveita que estou aqui e limpo o resto" | Escopo é o pedido. O "resto" vira oferta no relatório, não ação. |
| "O agente já verificou" | Amostre com seus olhos. Assinar relatório alheio sem re-checar = presumido. |
| "O executor/subagente testou, está coberto" | Ele testou o que imaginou; sonde a parte VARIÁVEL (dado de terceiro, primeiro frame, rajada). |
| "Container trocou / deploy rodou, então subiu" | Só um marcador do diff no artefato em produção + controle falso 0 prova qual commit subiu. |
| "Relatar meu erro enfraquece o relatório" | O contrário: erro-derrubado-no-ataque é a prova de que o resto sobreviveu. |

## Red flags — pare e volte uma etapa

- Você está prestes a escrever "feito/funciona/não existe" sem ter a saída do comando na mão.
- A resposta a um item inverificável está saindo com ❌/✅ seco.
- Você está deletando/alterando algo que não olhou, ou além do que foi pedido.
- Seu relatório não tem a seção "Presumido / não verificado" (todo trabalho real tem alguma).
