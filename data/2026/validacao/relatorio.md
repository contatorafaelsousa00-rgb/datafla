# Validação dos dados — Flamengo

## Completude por competição (% dos jogos encerrados)

| Competição | Jogos | escalacao | minutagem | estatisticas_jogador | nota | estatisticas_time | xg |
|---|---:|---:|---:|---:|---:|---:|---:|
| CONMEBOL Libertadores | 9 | 100% | 100% | 100% | 100% | 100% | 100% |
| Copa do Brasil | 2 | 100% | 100% | 100% | 100% | 100% | 100% |
| Friendlies Clubs | 4 | 0% | 0% | 0% | 0% | 75% | 0% |
| Serie A | 26 | 100% | 100% | 100% | 100% | 100% | 100% |

## Regras de coerência

| Regra | ok | alerta | erro |
|---|---:|---:|---:|
| escalacao | 0 | 0 | 4 |
| finalizacoes | 29 | 45 | 0 |
| gols | 74 | 0 | 0 |
| minutos | 68 | 6 | 0 |
| substituicoes | 74 | 0 | 0 |
| substituicoes_vs_eventos | 0 | 4 | 0 |
| titulares | 67 | 0 | 7 |
| titulares_sem_minutos | 0 | 7 | 0 |

## Jogos para conferir na súmula (73 apontamentos)

| Data | Competição | Jogo | Time | Regra | Status | Detalhe |
|---|---|---|---|---|---|---|
| 2026-03-14 | Serie A | x Botafogo | Flamengo | finalizacoes | alerta | jogadores 13, time 18 |
| 2026-03-19 | Serie A | x Remo | Flamengo | finalizacoes | alerta | jogadores 5, time 11 |
| 2026-03-22 | Serie A | x Corinthians | Flamengo | finalizacoes | alerta | jogadores 7, time 10 |
| 2026-03-22 | Serie A | x Corinthians | Corinthians | finalizacoes | alerta | jogadores 5, time 13 |
| 2026-04-03 | Serie A | x RB Bragantino | Flamengo | finalizacoes | alerta | jogadores 3, time 7 |
| 2026-04-03 | Serie A | x RB Bragantino | RB Bragantino | finalizacoes | alerta | jogadores 13, time 18 |
| 2026-04-03 | Serie A | x RB Bragantino | RB Bragantino | titulares | erro | 12 titulares |
| 2026-04-03 | Serie A | x RB Bragantino | RB Bragantino | titulares_sem_minutos | alerta | Marcelinho Braz |
| 2026-04-05 | Serie A | x Santos | Flamengo | finalizacoes | alerta | jogadores 11, time 19 |
| 2026-04-05 | Serie A | x Santos | Santos | finalizacoes | alerta | jogadores 7, time 17 |
| 2026-04-09 | CONMEBOL Libertadores | x Cusco | Flamengo | finalizacoes | alerta | jogadores 14, time 19 |
| 2026-04-09 | CONMEBOL Libertadores | x Cusco | Cusco | finalizacoes | alerta | jogadores 3, time 8 |
| 2026-04-09 | CONMEBOL Libertadores | x Cusco | Flamengo | minutos | alerta | soma 1017, esperado ~990 (+27) |
| 2026-04-12 | Serie A | x Fluminense | Flamengo | finalizacoes | alerta | jogadores 14, time 17 |
| 2026-04-12 | Serie A | x Fluminense | Fluminense | finalizacoes | alerta | jogadores 12, time 19 |
| 2026-04-17 | CONMEBOL Libertadores | x Independiente Medellin | Flamengo | finalizacoes | alerta | jogadores 18, time 24 |
| 2026-04-17 | CONMEBOL Libertadores | x Independiente Medellin | Flamengo | titulares | erro | 12 titulares |
| 2026-04-17 | CONMEBOL Libertadores | x Independiente Medellin | Independiente Medellin | titulares | erro | 14 titulares |
| 2026-04-17 | CONMEBOL Libertadores | x Independiente Medellin | Flamengo | titulares_sem_minutos | alerta | Everton |
| 2026-04-17 | CONMEBOL Libertadores | x Independiente Medellin | Independiente Medellin | titulares_sem_minutos | alerta | Marlon Balanta, Juan Viveros, J. Mena |
| 2026-04-19 | Serie A | x Bahia | Flamengo | finalizacoes | alerta | jogadores 14, time 20 |
| 2026-04-23 | Copa do Brasil | x Vitoria | Flamengo | finalizacoes | alerta | jogadores 15, time 21 |
| 2026-04-26 | Serie A | x Atletico-MG | Atletico-MG | finalizacoes | alerta | jogadores 11, time 18 |
| 2026-04-26 | Serie A | x Atletico-MG | Flamengo | substituicoes_vs_eventos | alerta | 0 eventos de substituição, 5 reservas com minutos |
| 2026-04-26 | Serie A | x Atletico-MG | Atletico-MG | substituicoes_vs_eventos | alerta | 0 eventos de substituição, 4 reservas com minutos |
| 2026-04-30 | CONMEBOL Libertadores | x Estudiantes de La Plata | Estudiantes de La Plata | finalizacoes | alerta | jogadores 11, time 14 |
| 2026-04-30 | CONMEBOL Libertadores | x Estudiantes de La Plata | Flamengo | minutos | alerta | soma 990, esperado ~962 (+28) |
| 2026-04-30 | CONMEBOL Libertadores | x Estudiantes de La Plata | Estudiantes de La Plata | minutos | alerta | soma 1005, esperado ~962 (+43) |
| 2026-05-03 | Serie A | x Vasco DA Gama | Flamengo | finalizacoes | alerta | jogadores 9, time 12 |
| 2026-05-03 | Serie A | x Vasco DA Gama | Vasco DA Gama | finalizacoes | alerta | jogadores 15, time 20 |
| 2026-05-10 | Serie A | x Gremio | Flamengo | finalizacoes | alerta | jogadores 15, time 20 |
| 2026-05-15 | Copa do Brasil | x Vitoria | Flamengo | finalizacoes | alerta | jogadores 15, time 26 |
| 2026-05-17 | Serie A | x Athletico Paranaense | Flamengo | finalizacoes | alerta | jogadores 8, time 12 |
| 2026-05-17 | Serie A | x Athletico Paranaense | Athletico Paranaense | finalizacoes | alerta | jogadores 12, time 18 |
| 2026-05-17 | Serie A | x Athletico Paranaense | Athletico Paranaense | substituicoes_vs_eventos | alerta | 4 eventos de substituição, 3 reservas com minutos |
| 2026-05-17 | Serie A | x Athletico Paranaense | Athletico Paranaense | titulares | erro | 13 titulares |
| 2026-05-17 | Serie A | x Athletico Paranaense | Athletico Paranaense | titulares_sem_minutos | alerta | Chiqueti |
| 2026-05-21 | CONMEBOL Libertadores | x Estudiantes de La Plata | Estudiantes de La Plata | finalizacoes | alerta | jogadores 5, time 8 |
| 2026-05-24 | Serie A | x Palmeiras | Flamengo | finalizacoes | alerta | jogadores 12, time 22 |
| 2026-05-24 | Serie A | x Palmeiras | Palmeiras | finalizacoes | alerta | jogadores 9, time 12 |
| 2026-05-27 | CONMEBOL Libertadores | x Cusco | Flamengo | finalizacoes | alerta | jogadores 22, time 27 |
| 2026-05-30 | Serie A | x Coritiba | Flamengo | finalizacoes | alerta | jogadores 18, time 21 |
| 2026-05-30 | Serie A | x Coritiba | Flamengo | titulares | erro | 13 titulares |
| 2026-05-30 | Serie A | x Coritiba | Coritiba | titulares | erro | 12 titulares |
| 2026-05-30 | Serie A | x Coritiba | Flamengo | titulares_sem_minutos | alerta | Daniel Silva, Alan da Silva Santos |
| 2026-05-30 | Serie A | x Coritiba | Coritiba | titulares_sem_minutos | alerta | Renato Marques |
| 2026-07-03 | Friendlies Clubs | x River Plate | Flamengo | escalacao | erro | sem jogadores do Flamengo |
| 2026-07-08 | Friendlies Clubs | x Lausanne | Flamengo | escalacao | erro | sem jogadores do Flamengo |
| 2026-07-11 | Friendlies Clubs | x Benfica | Flamengo | escalacao | erro | sem jogadores do Flamengo |
| 2026-07-17 | Friendlies Clubs | x Olimpia | Flamengo | escalacao | erro | sem jogadores do Flamengo |
| 2026-07-26 | Serie A | x São Paulo FC | Flamengo | minutos | alerta | soma 1016, esperado ~990 (+26) |
| 2026-07-26 | Serie A | x São Paulo FC | São Paulo FC | minutos | alerta | soma 1009, esperado ~990 (+19) |
| 2026-07-29 | Serie A | x Internacional | Flamengo | finalizacoes | alerta | jogadores 9, time 14 |
| 2026-07-29 | Serie A | x Internacional | Internacional | finalizacoes | alerta | jogadores 12, time 16 |
| 2026-07-29 | Serie A | x Internacional | Internacional | minutos | alerta | soma 1006, esperado ~990 (+16) |
| 2026-08-09 | Serie A | x Vitoria | Flamengo | finalizacoes | alerta | jogadores 11, time 20 |
| 2026-08-13 | CONMEBOL Libertadores | x Cruzeiro | Flamengo | finalizacoes | alerta | jogadores 11, time 15 |
| 2026-08-13 | CONMEBOL Libertadores | x Cruzeiro | Cruzeiro | finalizacoes | alerta | jogadores 6, time 11 |
| 2026-08-16 | Serie A | x Mirassol | Flamengo | finalizacoes | alerta | jogadores 10, time 15 |
| 2026-08-16 | Serie A | x Mirassol | Mirassol | finalizacoes | alerta | jogadores 13, time 16 |
| 2026-08-20 | CONMEBOL Libertadores | x Cruzeiro | Flamengo | finalizacoes | alerta | jogadores 20, time 24 |
| 2026-08-20 | CONMEBOL Libertadores | x Cruzeiro | Cruzeiro | finalizacoes | alerta | jogadores 9, time 14 |
| 2026-08-22 | Serie A | x Cruzeiro | Flamengo | finalizacoes | alerta | jogadores 9, time 14 |
| 2026-08-22 | Serie A | x Cruzeiro | Cruzeiro | finalizacoes | alerta | jogadores 17, time 24 |
| 2026-08-30 | Serie A | x Botafogo | Flamengo | finalizacoes | alerta | jogadores 12, time 18 |
| 2026-08-30 | Serie A | x Botafogo | Botafogo | finalizacoes | alerta | jogadores 9, time 14 |
| 2026-09-02 | Serie A | x Mirassol | Flamengo | finalizacoes | alerta | jogadores 10, time 14 |
| 2026-09-06 | Serie A | x Remo | Flamengo | finalizacoes | alerta | jogadores 15, time 21 |
| 2026-09-06 | Serie A | x Remo | Remo | finalizacoes | alerta | jogadores 4, time 7 |
| 2026-09-13 | Serie A | x Corinthians | Flamengo | finalizacoes | alerta | jogadores 20, time 32 |
| 2026-09-13 | Serie A | x Corinthians | Corinthians | titulares | erro | 12 titulares |
| 2026-09-13 | Serie A | x Corinthians | Corinthians | titulares_sem_minutos | alerta | Yago Vitor Veloso |
| 2026-09-18 | CONMEBOL Libertadores | x Independiente del Valle | Independiente del Valle | substituicoes_vs_eventos | alerta | 3 eventos de substituição, 2 reservas com minutos |
