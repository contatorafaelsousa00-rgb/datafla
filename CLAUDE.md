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
  Logos são desenhos próprios: nunca usar escudo ou marca do Flamengo NA IDENTIDADE do datafla (logo, favicon, capa).
  Como símbolo do time nas listas e placares, o escudo do Flamengo aparece igual ao dos adversários (vem da fonte;
  `comum.js`: `logoFla`, `escudoImg`) — pedido do Rafael em 16/10/2026. Propostas em `site/.propostas/` (fora do deploy).
- **API-Football** (api-sports.io, `v3.football.api-sports.io`, header `x-apisports-key`): hoje só para temporadas
  2022–2024 e fotos do elenco (fonte original, antes da Highlightly; plano grátis, 100 req/dia). Escolhida por cobrir as 6 competições com minutagem por jogador.
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
- `site/` — HTML/CSS/JS puro, gráficos SVG próprios (`graficos.js`), sem build. Seletor de temporada (`?t=2025`). Abas: Temporada, Jogos, Jogadores, Números, Elenco, Estilo de jogo, Classificação, Sua opinião (detalhes em "Estado atual").
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

## Estado atual (atualizado em 16/10/2026)

- 2024 coletado pela API-Football (75 jogos) e 2026 pela Highlightly: 41 de 58 jogos encerrados; os 17 restantes
  (mais antigos, incluindo Carioca/Supercopa/Recopa) chegam na próxima coleta, quando a cota diária renovar.
- Respostas da Highlightly ficam versionadas em `data/<ano>/raw-highlightly/` (o workflow faz commit), para a coleta
  não baixar de novo e o site nunca sair parcial. Segredos `HIGHLIGHTLY_KEY` e `FIREBASE_SERVICE_ACCOUNT` cadastrados;
  disparo pelo cron-job.org funcionando desde 15/10/2026 (token fine-grained vence em 15/10/2027).
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
- Testes: `python -m pytest` (coleta) + `python scripts/teste_painel.py` (fumaça) + `tests/front/` (Playwright, ~1,5 min:
  abas nos 2 temas, celular sem rolagem lateral, tela do jogo, tabela Jogadores, pré-jogo, contraste WCAG, seletor de
  competição, lógica do mata-mata com jogos inventados, PNG exportado). Pulam sem Playwright/dados; rodam no workflow antes do deploy.
- **Regra de exibição (16/10/2026)**: todo placar ou xG de UM jogo aparece na ordem **mandante × visitante**, com os nomes
  (`comum.js`: `mandanteVisitante`, `confronto`, `textoConfronto`). Somas da temporada ficam "a favor × contra", rotuladas.
- Jogo clicado (disputado ou próximo) abre numa tela inteira (`#modal-jogo` em tela cheia, conteúdo até 1400 px, botão "Voltar para a lista"), não rola a página;
  links diretos `?aba=jogos&jogo=<id>` e `?aba=jogos&proximo=<id>`.
- Correções da fonte (auditoria de 16/10/2026, `coleta/highlightly.py`): placar com lados trocados (Madureira 22/02 e
  03/03, Lausanne 08/07) → `placar()` usa os lances de gol quando dão exatamente o placar invertido (campanha 31V 14E 14D →
  34V 14E 11D); cobranças da disputa de pênaltis viram tipo `Shootout` (não contam como gol nem entram na linha do tempo);
  mais de 11 titulares (Carioca de janeiro, time alternativo) → `_corrigir_titulares` usa substituições + minutos;
  box-score sem gols/assistências → `_completar_gols_pelos_lances` (ids dos lances). Painel: `preencher()` em comum.js
  evita "null" escrito na tela; lance sem nome mostra "jogador não informado". Restam limitações da fonte nos jogos
  antigos do Carioca (box-score incompleto) e Atlético-MG 26/04 (um gol sem lance).
- Dados complementares (16/10/2026, `coleta/extras.py`, `coletar extras`, roda no `tudo` depois dos próximos jogos):
  `/lineups` (escalação por linha + formação; 1 vez por jogo, até 25 por coleta), `/standings` (tabelas; diária se a
  competição ainda tem jogo), `/players/{id}/statistics` (carreira; semanal, 12 por coleta, por minutos), e
  `/matches?leagueId=61205` (380 jogos do Brasileirão em 4 páginas, a cada 20 h). A API NÃO tem mapa de calor, coordenadas
  nem posição média; vídeos vêm vazios no plano grátis; odds fora do plano. Painel: campinho (`graficos.campinho`,
  mandante à esquerda/em cima), aba **Classificação** (`classificacao.js`: tabela calculada dos jogos = igual à oficial;
  simulador de palpites salvo no navegador; chances por 4.000 simulações Poisson com força casa/fora encolhida para a
  média, semente fixa), Formações (Estilo de jogo), Carreira (perfil), xGOT enfrentado (goleiros), Ataques (comparativo),
  posição na tabela no próximo jogo. Regras do Firestore ganharam `aba_classificacao` (publicar regras junto com o site).
- Ficha do elenco (16/10/2026): `/players/{id}` (perfil com dados do Transfermarkt: nascimento, altura, pé, nacionalidade,
  posição detalhada, contrato, chegada, valor de mercado com histórico, lesões, rumores) → raw `perfil_<id>`, tabela `perfis`
  (`extras.linhas_perfis`), semanal, 15 por coleta (relacionados nas escalações primeiro). Aba Elenco tem subabas
  Desempenho | Ficha do elenco (`?sub=ficha`), agrupada por posição; só quem tem clube atual Flamengo (base marcada).
- Transmissão (TV/streaming): nenhuma das fontes atuais tem. Pagas com canais por jogo: Sportmonks (TV stations por fixture),
  SoccersAPI (broadcast). Alternativa grátis: cadastro manual pelo admin (não feito; aguardando decisão).
- CSS: regra global `[hidden] { display: none !important; }` — regras com `display: grid` anulavam o atributo hidden
  (causa do bug "clico no Bahia e aparece o Estudiantes": o relatório anterior ficava visível no modal).
- Pré-jogo e comparador (16/10/2026): banner "Próximo jogo" (Temporada) abre a tela do jogo. Tela do próximo jogo
  (`preview.js`): desfalques do Flamengo (suspensos/pendurados ESTIMADOS pela regra de 3 amarelos na competição, sem
  quem já saiu; lesionados do perfil), prováveis escalações no campinho (Flamengo = formação/vagas do último jogo; em cada posição
  detalhada do perfil entra o mais usado NA COMPETIÇÃO do jogo, fora desfalques (substituto de desfalque tracejado); quem volta de suspensão retoma a vaga; adversário = escalação do último jogo dele, `/lineups` do id em `forma_<adv>`, 1 req),
  momento (últimos 5), campanha na competição com o mesmo mando, histórico do árbitro. A fonte NÃO traz lesões recentes (ex.: Arrascaeta
  fora desde 20/09; perfil só tem lesões até jun/2026; /injuries da API-Football é só 2022–2024): seção única "Lesionados ou fora dos últimos jogos" (lesão do perfil + titulares
  frequentes (900+ min) fora dos relacionados (box-score inclui o banco) em 2+ jogos seguidos, motivo não informado.
  Ausências explicadas por suspensão (vermelho ou 3º/6º… amarelo no jogo anterior da MESMA competição) não contam;
  quem as cumpriu aparece em "Voltam de suspensão" (ex.: Jorginho, expulso vs Del Valle e vs Santos).
  Pendurados aparecem no campinho com dois cartões amarelos. Aba Jogos → "Comparar calendário"
  (`calendario.js`): jogos restantes do Brasileirão de 2 times com chance por jogo pelo modelo exato
  (`classificacao.probabilidades`), pontos esperados e projeção; padrão Flamengo × vizinho na tabela.
  Exportar imagem (`imagem.js`, canvas 1080 px ×2, PNG; celular abre o compartilhar): Simplificada (jogos, CASA/FORA,
  posição do rival) e Detalhada (+ data, chances, pontos esperados, projeção, resumo). Sempre com marca e datafla.web.app.
- Relatório do jogo disputado com abas Resumo | Jogadores (`tabela-partida.js`, 16/10/2026): box-score dos dois times
  (só colunas que a fonte trouxe), ordenável, filtro por time, clique abre a ficha. Escanteios/cruzamentos por jogador não existem na fonte.
- Classificação de outras competições (16/10/2026): seletor Brasileirão | Libertadores | Copa do Brasil | Carioca (`?tabela=`).
  Grupos vêm de `/standings` (tabela `classificacao`); mata-mata de `copa_<liga>` = `/matches?leagueId=` das copas (2 páginas,
  a cada 20 h enquanto houver jogo aberto) → tabela `mata_mata` (só fases eliminatórias, com pênaltis). `copas.js`:
  confrontos ida+volta somados, ordem do chaveamento de trás para frente, coluna da Final "a definir" até a fonte criar o jogo.
- Tabela do Brasileirão parada sem a rodada (bug de 18/10/2026, Bahia × Flamengo; corrigido em 19/10/2026): as renovações de
  pré-jogo gastavam a cota em extras e `liga_61205` (último da fila, a cada 20 h) ficou de 17/10 18:30. Agora: `liga_*` com jogo
  terminado depois do download (`extras.jogos_sem_resultado`) vai para o início dos extras (3 h+ entre renovações) e o `planejar`
  dispara a coleta por isso; em dia de jogo do Flamengo os extras não essenciais deixam `FLA_HL_RESERVA_JOGO` (25) de folga;
  o resultado do Flamengo entra na liga pela lista dele (mesmo id); `meta.liga` = {coletado_em, sem_resultado} e o aviso
  `avisoLiga()` aparece na Classificação e no Comparar calendário.
- Deploy parado de 22 a 27/10/2026 (site ficou em Bahia × Flamengo; a coleta seguia normal): o passo "Publicar no Firebase"
  falhava porque a 15.34.1 do firebase-tools (21/10) passou a checar se a API do Hosting está ativa e a conta de serviço do
  deploy não tinha permissão. Solução definitiva (28/10): papel "Service Usage Consumer" para a conta de serviço no IAM; a
  action voltou a usar o firebase-tools mais novo (ficou `ubuntu-24.04` e Node 22 por previsibilidade). Push no próprio workflow agora dispara deploy. Se o site parar de
  atualizar: ver se as execuções "coletou" falham no último passo (admin → Coleta mostra falhas).
- Virada de temporada e aviso de falha (28/10/2026): o deploy roda `processar --todas` (todas as temporadas com dados em
  `data/<ano>/raw-highlightly/`; antes só o ano do relógio, e em 1º/jan a temporada anterior sumiria do site) e o site abre na
  temporada mais recente com jogos (`temporadas.json` → `jogos > 0`). Falha no workflow abre a issue "Atualização do datafla
  falhou" (label `falha-automatica`; uma só enquanto aberta) e ela fecha sozinha na próxima publicação que der certo.
- Melhorias da análise de 28/10/2026:
  - Carga: `adversarios` e `carreira` vão para `<ano>-extra.json` (exportar.EXTRAS), baixado depois da 1ª tela
    (`D.extrasPromessa`; tabela do jogo, ficha do adversário e carreira esperam por ele); fetch com `cache: "no-cache"`
    (revalida). 1ª carga 198 → 134 KB gzip.
  - Páginas por jogo `site/jogo/<id>.html` (`coleta/paginas.py`, geradas no processar, fora do Git): título/descrição
    próprios (mandante × visitante, gols, xG, pênaltis; futuro: data e chances) para a prévia no WhatsApp/X e Google;
    redirecionam para `?aba=jogos&jogo|proximo=<id>`. + `sitemap.xml`/`robots.txt`. Botão "Compartilhar" na tela do jogo
    (celular: compartilhar do sistema; computador: copia o link). `servidor_local.py` imita o cleanUrls do Firebase.
  - Disputa de pênaltis logo após os 90 (sem prorrogação; Estudiantes 22/10, cobranças nos minutos 91–99) era contada como
    gol: `_cobrancas_da_disputa` = sequência final de pênaltis conferida pelo placar da disputa.
  - Instalável: `manifest.webmanifest` + `site/icones/` (marca; Android e apple-touch-icon).
  - Cadastros manuais (admin → Cadastros): lesões (jogador, motivo, volta prevista) e onde passa cada próximo jogo, no
    Firestore `manual/cadastros` (leitura pública, escrita só admin; `site/manual.js` lê por REST com limite de 2,5 s).
    Lesão entra nos desfalques e tira da provável escalação até a volta; transmissão no banner, na lista e na tela do jogo.
    EXIGE publicar as regras do Firestore (`firebase deploy --only firestore:rules`).
  - Testes de regra de negócio com temporada inventada (`tests/front/test_regras.py`): suspensão, pendurado, amarelo de
    outra competição, ausente × volta de suspensão, artilharia, pênaltis, expulsão fora da relação, disputa, sequências.
- Previsão pré-jogo: a fonte gera previsões "pré-jogo" até depois do apito; usar a última com generatedAt <= início.
- Aba **Números** (16/10/2026, `numeros.js`; conferida com a planilha do Rafael "Dados Flamengo temporada 2026.xlsx"):
  artilharia (pênaltis entre parênteses), assistências, G+A, mais utilizados, sem sofrer gol (por goleiro), saiu na
  frente/atrás, viradas (e sofridas), pênaltis a favor/contra, expulsões, amarelos, 2+ gols num jogo, maiores vitórias,
  sequências. Decisões do Rafael: amistosos FORA por padrão (chave "Incluir amistosos"); prorrogação conta pelo resultado
  final; W.O. = vitória 3 × 0 (correção manual em `data/<ano>/correcoes.json`, `coleta/correcoes.py`, status "WO",
  fora de "sem sofrer gol"). Gol contra a favor = placar − gols dos jogadores (Santos 05/04: lance diz gol contra, box-score
  dá ao Pedro, planilha também). Jogo sem box-score (volta da Recopa 27/02) usa gols/assistências dos lances. Expulsão só
  conta se o jogador estava na relação do jogo. Divergências que restam com a planilha (a fonte registra assim): assistências
  Pedro 10 (planilha 9), Varela 3 (2), Plata 3 (2); "Wallace" (Carioca) × "Wallace Yan". Regra `aba_numeros` no Firestore.
- **Publicação**: só depois do Rafael validar no servidor local (`python scripts/servidor_local.py`, porta 8765) — pedido de 16/10/2026.
- Próximos jogos (16/10/2026): aba Jogos com chave "Próximos jogos | Jogos disputados" (`?lista=`; `?jogo=<id>` abre o
  relatório). `coletar proximo` busca para os 3 próximos jogos (o 1º sempre; os demais só nas próximas 3 semanas), do mais
  próximo para o mais distante: `/matches/{id}` (estádio, árbitro, clima, previsão; 6 h para o 1º, 24 h os demais),
  `/head-2-head` (últimos 10 confrontos) e `/last-five-games` do adversário (24 h) → raw `proximo_<id>`, `h2h_<adv>`,
  `forma_<adv>` → tabelas `proximo`, `confrontos`, `forma_adversario`. `planejar` também coleta quando o próximo jogo
  começa em menos de 24 h e a previsão tem 6 h+. Custo: até 9 req por renovação.
- Melhorias de 15/10/2026 (análise geral, itens 1–6): no Git só respostas brutas, fotos e logos; JSON do site,
  CSVs e validação são gerados por `processar` (workflow gera no deploy; `meta.coletado_em` = hora da última coleta,
  mostrada em "atualizado em"). Logos (escudos e competições) copiados para `site/logos/<teams|leagues>/`
  (`coleta/imagens.py`). Resumo no GitHub (`$GITHUB_STEP_SUMMARY`). Tags `og:` + `site/capa.png`
  (de `scripts/capa.html`). Gráficos SVG com `aria-label` = título do cartão + resumo gerado dos dados.
- Itens 7–13 e admin (15/10/2026): `app.js` dividido em módulos por aba (`comum.js` base com `D` via `definirDados`,
  `temporada/jogos/jogadores/elenco/estilo/opiniao.js`; `app.js` = filtros, abas, carregamento). Tabelas grandes do JSON
  em `{colunas, linhas}` (`exportar.compactar`; o site expande em `preparar`): 1,29 MB → 0,5 MB. Teste de fumaça
  `scripts/teste_painel.py` (Chrome/Edge sem janela, todas as abas) roda no workflow antes do deploy.
  Divergências da fonte: `shotsTotal` do jogador em geral não conta chutes bloqueados → somados da lista de chutes (casados por nome,
  `finalizacoes_bloqueadas`), MAS só quando cabem (soma dos jogadores + bloqueados <= chutes da lista): em alguns jogos
  (vários desde set/2026, ex.: Estudiantes 16/10) a fonte já os conta e somar dobrava (27 × 21) — corrigido em 16/10/2026; mais de 11 titulares → os de 0 min viram reservas. Validação: 73 → 21 apontamentos (restam
  amistosos sem jogadores, acréscimos acima da tolerância, lista de chutes × total do time em ~6 times).
- **Admin** (15/10/2026): entrada quase invisível no canto superior direito do topo (ou `#admin`); `admin.js` carregado sob
  demanda com o SDK do Firebase (gstatic 10.14.1). Login Google (Firebase Authentication; o provedor Google precisa estar
  ativado no console). Regras: `admin()` = e-mail do dono verificado; lê/apaga `opinioes`, lê `acessos`.
  Tela própria (16/10/2026, antes era modal): rota `#admin/<seção>` (voltar do navegador sai), menu lateral (abas no celular):
  Visão geral (cartões de situação + pendências: coleta atrasada, falha no workflow, jogos pendentes, cota baixa, opiniões novas),
  Acessos (30 dias + comparação com a semana anterior), Opiniões (filtro por tipo/novas, busca, marcar como lida por mensagem
  ou todas — guardado em localStorage `datafla-admin-lidas`, apagar), Coleta (situação, histórico, execuções, atalhos) e
  Qualidade dos dados (apontamentos da validação por regra, com link para o jogo). Testada com Firebase falso (tests/front/test_admin.py).
  Seção Atualizações: histórico de cada coleta (`data/<ano>/atualizacoes.json`, gravado por `coletar tudo` com motivo,
  origem, jogos novos/recoletados, pendentes e cota; versionado e publicado em `dados/atualizacoes-<ano>.json`) e as
  últimas execuções do workflow pela API pública do GitHub ("nada a coletar" / "coletou e publicou" / falhou).
  Contagem (`acessos.js`): `acessos/<dia>` só com contadores (+1 por regra), sem cookies/dado pessoal; não conta localhost,
  demo nem o navegador onde o admin entrou. Doc de teste `acessos/2000-01-01` ficou no banco (ignorado; apagar pelo console).
  Não feito por decisão: e-mail a cada opinião (exige plano Blaze + Cloud Functions; o selo "nova" cobre) e App Check
  (exige registrar reCAPTCHA no console e carregar o SDK em toda visita; ligar só se aparecer spam).

## Como trabalhar neste repositório (16/10/2026)

- Publicação: só depois do Rafael validar no servidor local (ou quando ele pede "push"/"commit e push"). Mudança em
  `firestore.rules` precisa de `firebase deploy --only firestore:rules --project datafla` além do push (o workflow só publica o Hosting).
- O Rafael às vezes roda outra sessão do Claude em paralelo na mesma pasta: antes de commitar, conferir `git status`/`git diff`
  e commitar só os próprios trechos (montar o índice a partir do HEAD se um arquivo tiver mudanças das duas sessões); cuidado
  com nomes de classe CSS repetidos entre sessões (ex.: `.chave` × `.chaveamento`).
- Cota da Highlightly: 100 req/dia, dividida com a coleta automática. Conferir `restantes_hoje` antes de chamar a API à mão.
- Antes do push: `python -m coleta.coletar processar`, `python scripts/teste_painel.py` e `python -m pytest -q` (inclui tests/front).
