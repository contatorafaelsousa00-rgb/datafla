# DataFla — contexto para o Claude

Painel de dados do Flamengo em 2026, todas as competições, com minutagem por jogador e xG.
Dono: Rafael. Responda em português, de forma breve e direta (ele pede detalhes quando quer aprender).

## Decisões já tomadas (não reabrir sem motivo)

- **Fonte da temporada atual: Highlightly** (`soccer.highlightly.net`, header `x-rapidapi-key`, plano BASIC grátis,
  100 req/dia). Decidido em 15/10/2026 porque o grátis da API-Football não libera o ano corrente
  ("Free plans do not have access to this season, try from 2022 to 2024") nem `?ids=`. Custo: 2 req/jogo
  (`/matches/{id}` + `/box-score/{id}`); `/lineups` não é baixado (só daria formação). Sem busca em lote.
  ID do Flamengo: 108861. Lista da temporada: `/matches?homeTeamId=` e `?awayTeamId=` (não existe `teamId`).
  API-Football fica para 2022–2024. Nunca misturar fontes numa temporada (pastas `raw/` × `raw-highlightly/`).
- **Painel**: não está preso ao desenho antigo; deve mostrar o melhor que os dados permitem (pedido do Rafael, 15/10/2026).
  Tema escuro (preto) por padrão + claro pelo botão; vermelho como destaque; cores de competição: ver identidade abaixo.
- **Identidade visual: direção B "Analítico"** (escolhida em 15/10/2026): marca "datafla." em minúsculas com ponto vermelho,
  logo de barras crescentes (a última vermelha, também favicon); Space Grotesk (títulos), JetBrains Mono (números),
  Inter (texto); escuro #0E0F11 / cartões #17191C / vermelho #FF3341 (claro: #E01E2D) / cinzas frios #8A9099.
  Logos são desenhos próprios: nunca usar escudo ou marca do Flamengo. Propostas em `site/.propostas/` (fora do deploy).
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
- **Banco de dados: nenhum no ar** (reconfirmado em 15/10/2026). O JSON do site tem 1,3 MB (~75 KB gzip) por temporada;
  SQLite fica só local para análise. Reabrir só se vier consulta livre pelo usuário, login ou várias temporadas pesadas.
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
  - Configuração pelo arquivo `.env` na raiz (modelo `.env.exemplo`, fora do Git; variável do terminal tem prioridade) ou variável de ambiente: `API_FOOTBALL_KEY`, `FLA_TEAM_ID` (127), `FLA_SEASON` (padrão: ano atual), `FLA_DATA_DIR` (pasta base), `FLA_SITE_DADOS`.
- `site/` — HTML/CSS/JS puro, gráficos SVG próprios (`graficos.js`), sem build. Seletor de temporada (`?t=2025`). Abas: visão geral,
  jogadores, minutagem (mapa de calor jogador × jogo), jogos (detalhe com escalação/eventos), qualidade.
  Cores de competição em famílias da identidade (15/10/2026, pedido do Rafael, troca a paleta azul/laranja anterior):
  nacionais em vermelho (Brasileirão --s1, Copa do Brasil --s3), continentais em dourado (Libertadores --s2, Recopa --s6),
  demais em cinzas (Carioca --s4, Supercopa --s5, amistosos --s7). Distinção depende mais de luminosidade que de matiz.
- `scripts/gerar_demo.py` — temporadas FICTÍCIAS 2025 e 2026 em `data-demo/` e `site/dados-demo/` (fora do Git); abrir com `?demo=1`.
- `.github/workflows/atualizar.yml` — disparado a cada 30 min de fora (cron-job.org → workflow_dispatch, horário exato;
  o agendador do GitHub atrasa) + reservas 00:17/07:17 do GitHub. Cada execução roda `coletar planejar` (sem gastar cota):
  coleta se um jogo acabou (início + 2h10) ou 1x por dia (24 h após a última coleta; recoleta jogos das últimas 48 h); senão termina.
  Coletando: testes, `tudo`, commit dos dados, deploy. Push em site/: só testes + deploy.
- Login/Firestore: só se houver dado privado ou recurso por usuário. Lembrar que arquivos do Hosting são públicos mesmo atrás de uma tela de login.

## Disponibilidade dos dados após o jogo

Pesquisa (15/10/2026): a API-Football diz atualizar placar/eventos a cada 15 s ao vivo; o guia oficial
manda buscar estatísticas de jogador após o apito final; não há prazo publicado para correções
(um post antigo fala em atualização a cada 5 min no endpoint de jogadores). Concorrentes: TheStatsAPI
diz estabilizar em 1–2 h. Por isso: recoleta até 48 h e `alteracoes.csv` para medir na prática.

## Estado atual (15/10/2026)

- 2024 coletado pela API-Football (75 jogos) e 2026 pela Highlightly: 41 de 58 jogos encerrados; os 17 restantes
  (mais antigos, incluindo Carioca/Supercopa/Recopa) chegam na próxima coleta, quando a cota diária renovar.
- Respostas da Highlightly ficam versionadas em `data/<ano>/raw-highlightly/` (o workflow faz commit), para a coleta
  não baixar de novo e o site nunca sair parcial. Workflow usa o segredo `HIGHLIGHTLY_KEY` (falta cadastrar no GitHub).
- `coleta/highlightly.py`: cliente, coleta com parada antes de esgotar a cota (`FLA_HL_RESERVA`), normalização nativa
  (mesmas tabelas da API-Football + xg/xa/xgot por jogador, previsão pré-jogo, clima, tabela `finalizacoes`).
- Validador usa a duração real do jogo (minutos incluem acréscimos). Restam alertas de fonte: 12º titular com 0 min
  em alguns jogos; finalizações dos jogadores ≠ total do time em vários jogos (a investigar).
- Painel redesenhado (15/10/2026), só 2026 (2024 saiu do site a pedido do Rafael; `data/2024/` segue local, fora do Git):
  6 abas — Temporada (KPIs, saldo de xG jogo a jogo, pontos × esperado, tendência, casa × fora, contra a previsão),
  Jogos (relatório: previsão, linha do tempo, comparativo, escalação com xG/nota, mapa do gol), Jogadores (grupos
  Geral/Ataque/Criação/Defesa/Goleiros, totais ou por 90, perfil com percentis vs mesma posição, nota por jogo, dispersões),
  Elenco (em alta/baixa, carga 30 dias, rotação, minutagem), Estilo de jogo (médias × adversários, finalizações e gols por
  momento, gols × xG, posse e último terço), Dados (cobertura, completude, apontamentos). Resultados vêm do calendário
  (todos os encerrados); visões de detalhe usam só jogos já baixados. Símbolos das competições = logos da Highlightly.
  Filtros (15/10/2026): barra fixa abaixo do topo — competição de seleção única (símbolos; nome na selecionada),
  período (temporada, últimos 10/5, mês; aplicado depois de competição e mando), mando, resumo com "Limpar filtros";
  no celular vira botão "Filtros (n)". Ficam na URL: `?comp=brasileirao&periodo=10&mando=casa` (mês: `periodo=2026-09`).
- No ar: https://datafla.web.app (projeto Firebase `datafla` na conta contatorafaelsousa00@gmail.com; nesta pasta o
  Firebase CLI usa essa conta via `firebase login:use`; a conta padrão da máquina é outra, de trabalho).
- Cartão "Próximo jogo" no topo da Temporada: `coletar proximo` (1 req, renovado a cada 6 h, roda depois dos detalhes
  no `tudo`) → `proximo` no JSON; sem detalhe (ex.: filtro de competição), o cartão usa o calendário.
- Fotos dos jogadores (15/10/2026): Highlightly não tem (logo null no box-score e em /players/{id}); vêm do elenco atual
  da API-Football (`coletar fotos`, 1 req, renovado a cada 7 dias, segredo opcional API_FOOTBALL_KEY no workflow),
  casadas por nome/número (`coleta/fotos.py`): 30 de 31 que jogaram em 2026 (Everton, Lorran, Wallace fora do elenco atual).
  Copiadas para `site/fotos/` e servidas pelo próprio site (a rede do Rafael não resolve media.api-sports.io);
  sem cópia local, o JSON leva a URL original. O workflow faz commit de `site/fotos`.
- Jogadores: cada grupo abre ordenado pela estatística principal (gols, assistências, desarmes, gols evitados);
  perfil em seções Ataque/Criação/Defesa, cada uma da melhor para a pior posição no elenco.
- Aba "Dados" saiu (relatório de qualidade segue em data/<ano>/validacao/). Entrou "Sua opinião" (15/10/2026):
  formulário de elogios/críticas/sugestões grava em Firestore (`opinioes`, banco (default) em nam5) via REST com a
  chave pública do app web; `firestore.rules` só permite criar com campos validados; leitura só pelo console:
  https://console.firebase.google.com/project/datafla/firestore/databases/-default-/data/~2Fopinioes
- 29 testes (`python -m pytest`).
