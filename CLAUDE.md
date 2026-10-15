# DataFla — contexto para o Claude

Painel de dados do Flamengo em 2026, todas as competições, com minutagem por jogador e xG.
Dono: Rafael. Responda em português, de forma breve e direta (ele pede detalhes quando quer aprender).

## Decisões já tomadas (não reabrir sem motivo)

- **Fonte de dados: API-Football** (api-sports.io, `v3.football.api-sports.io`, header `x-apisports-key`),
  começando no plano grátis (100 req/dia). Escolhida por cobrir as 6 competições com minutagem por jogador.
  Ponto fraco: xG não é documentado; o código captura `expected_goals` de `/fixtures` quando existir.
- **xG**: se a API-Football não trouxer xG suficiente, plano B é uma segunda API só para xG:
  Sportmonks (Starter, 5 ligas, + add-on xG; ~€48/mês, a confirmar) cobre Brasileirão (liga 648)
  e Libertadores (liga 1122) segundo a documentação; Copa do Brasil não aparece com xG em nenhuma
  API oficial. TheStatsAPI (US$50/mês) é a segunda opção. Nunca misturar xG de fornecedores diferentes.
  Ligar as duas APIs: jogos por data + mandante + visitante; jogadores por uma tabela de correspondência manual.
- **Descartados**: Sofascore/FotMob/ESPN (APIs internas, sem autorização), FBref (perdeu a Opta em jan/2026),
  football-data.org (sem escalações no grátis).
- **Hospedagem: Firebase Hosting, site estático** lendo `site/dados/<ano>.json`. Sem banco por enquanto;
  Supabase só se vier multi-temporada, consultas livres ou login.
- **Editor**: VS Code/Cursor com Claude Code (sem pagar a IA do Cursor).
- Relatório de decisão da API (Claude Docs): https://claude.ai/code/artifact/bf22ba93-bc03-469e-9fd1-08558ca87e16

## Estrutura

- `coleta/` — Python, só `requests` (+ `pytest`). CLI: `python -m coleta.coletar {status,jogos,elenco,detalhes,processar,tudo,modelo-sumula,sumulas}`.
  - `api.py` cliente com retry, pausa de 6,5 s entre chamadas (`FLA_PAUSA_SEG`), cache em `data/<ano>/raw/`.
  - `normalizar.py` JSON da API → tabelas planas. `validar.py` regras de coerência + completude.
  - `sumulas.py` comparação com súmulas preenchidas à mão (casamento por número da camisa).
  - `exportar.py` traduz nomes de competição/posição e gera `site/dados/<ano>.json`.
  - `inspecionar.py` (`coletar inspecionar`) decide pelos dados reais: `player`/`assist` na substituição,
    time do evento de gol contra, `passes.accuracy` contagem ou %, cobertura de xG por competição.
  - `alteracoes.py` registra o que muda entre coletas do mesmo jogo (mede quando a API estabiliza).
  - **Multi-temporada**: tudo é separado por ano em `data/<ano>/` e `site/dados/<ano>.json` + `temporadas.json`.
    `config.aplicar_temporada(ano)` troca todos os caminhos; CLI aceita `--temporada`. Padrão = ano atual.
    Elenco (`/players/squads`) só existe para a temporada atual.
  - Configuração por variável de ambiente: `API_FOOTBALL_KEY`, `FLA_TEAM_ID` (127), `FLA_SEASON` (padrão: ano atual), `FLA_DATA_DIR` (pasta base), `FLA_SITE_DADOS`.
- `site/` — HTML/CSS/JS puro, gráficos SVG próprios (`graficos.js`), sem build. Seletor de temporada (`?t=2025`). Abas: visão geral,
  jogadores, minutagem (mapa de calor jogador × jogo), jogos (detalhe com escalação/eventos), qualidade.
  Cores de competição fixas (paleta validada para daltonismo): Brasileirão s1, Libertadores s2,
  Copa do Brasil s3, Carioca s4, Supercopa s5, Recopa s6. Claro e escuro.
- `scripts/gerar_demo.py` — temporadas FICTÍCIAS 2025 e 2026 em `data-demo/` e `site/dados-demo/` (fora do Git); abrir com `?demo=1`.
- `.github/workflows/atualizar.yml` — coleta da temporada atual 00:17 e 07:17 (Brasília) + commit dos dados + deploy no Firebase.
- Login/Firestore: só se houver dado privado ou recurso por usuário. Lembrar que arquivos do Hosting são públicos mesmo atrás de uma tela de login.

## Disponibilidade dos dados após o jogo

Pesquisa (15/10/2026): a API-Football diz atualizar placar/eventos a cada 15 s ao vivo; o guia oficial
manda buscar estatísticas de jogador após o apito final; não há prazo publicado para correções
(um post antigo fala em atualização a cada 5 min no endpoint de jogadores). Concorrentes: TheStatsAPI
diz estabilizar em 1–2 h. Por isso: recoleta até 48 h e `alteracoes.csv` para medir na prática.

## Estado atual (15/10/2026)

- Código pronto e testado só com dados sintéticos (`python -m pytest`, 16 testes).
- Documentação oficial (api-football.com/documentation-v3) não acessível pela sessão na nuvem; confirmado por
  buscas: máx. 20 ids em `/fixtures?ids=`, resposta por id traz events/lineups/statistics/players, live a cada 15 s. **Ainda não rodou contra a API real.**
- Próximo passo: Rafael cria a chave grátis, roda `python -m coleta.coletar status` e depois `tudo`.
  Ao ver a primeira resposta real, rodar `coletar inspecionar` e ajustar conforme os pontos da seção "Pontos a confirmar" do README
  (ID 127, acesso a 2026 no grátis, time do evento de gol contra, `player`/`assist` na substituição,
  `passes.accuracy`, cobertura de `expected_goals`) e ajustar `normalizar.py`/`validar.py`.
- Depois: rodar a conferência com súmulas em ~10 jogos (4 Brasileirão, 3 Libertadores, 2 Copa do Brasil, 1 Carioca);
  meta 100% em escalação/eventos e ±1 min nas substituições.
- Depois: configurar Firebase (projeto, segredos do workflow) e publicar.

## Convenções

- Código e mensagens em português, comentários só onde explicam o porquê.
- Nunca colocar chaves no código, em commits ou no chat.
- Não inventar dados: o demo é sempre marcado como fictício e nunca vai para `site/dados/`.
- Ao mexer no site, conferir no navegador (claro, escuro e 390 px de largura) antes de dar por pronto.
