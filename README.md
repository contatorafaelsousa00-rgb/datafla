# DataFla — Flamengo 2026, dados por jogo e por jogador

Painel do Flamengo em 2026 em todas as competições (Brasileirão, Libertadores, Copa do Brasil,
Carioca, Supercopa, Recopa): resultados, xG, minutagem jogo a jogo e estatísticas por jogador,
com validação da qualidade dos dados.

```
Highlightly (temporada atual) ─┐
API-Football (2022–2024) ──────┴► coleta/ (Python) ──► data/<ano>/csv, flamengo.db ──► site/dados/<ano>.json ──► site/ (Firebase Hosting)
                                        └─► data/<ano>/validacao/ (relatório de qualidade)
```

## Fontes de dados

| Fonte | Para quê | Plano grátis | Custo por jogo |
|---|---|---|---|
| **Highlightly** (`soccer.highlightly.net`) | temporada atual (padrão) | 100 req/dia, temporada atual liberada | 2 requisições (`/matches/{id}` + `/box-score/{id}`) |
| API-Football (`v3.football.api-sports.io`) | temporadas 2022 a 2024 | 100 req/dia, **sem** a temporada atual e sem `?ids=` | 1 requisição |

Cada fonte tem os próprios IDs, então os dados ficam separados (`data/<ano>/raw-highlightly/` ×
`data/<ano>/raw/`) e uma temporada nunca mistura as duas. A Highlightly traz, além do que a
API-Football dá: xG, xA e xGOT **por jogador**, nota, grandes chances, passes no último terço,
finalizações com zona do gol, previsão pré-jogo (chance de vitória/empate/derrota), árbitro e clima.
Não traz: placar do intervalo, formação e técnico (estes só em `/lineups`, que não é baixado).

## Primeiros passos

```bash
python -m pip install -r requirements.txt

# Crie o arquivo .env a partir do modelo e coloque as chaves nele
copy .env.exemplo .env        # Linux/Mac: cp .env.exemplo .env

python -m coleta.coletar status   # confere chave, cota e ID do time
python -m coleta.coletar tudo     # baixa, gera banco, CSVs, validação e o JSON do site

python -m coleta.coletar tudo --fonte api-football --temporada 2024   # temporada antiga
```

Com `HIGHLIGHTLY_KEY` no `.env`, a fonte padrão é a Highlightly; `--fonte` (ou `FLA_FONTE` no `.env`)
escolhe outra. Cada temporada fica em `data/<ano>/` e `site/dados/<ano>.json`; o painel lista as
temporadas de `site/dados/temporadas.json` e tem um seletor (link direto: `?t=2024`).

As chaves ficam só no `.env`, que o `.gitignore` mantém fora do Git. Uma variável de ambiente com o mesmo nome tem prioridade sobre o arquivo.

### Ver o painel

```bash
python scripts/gerar_demo.py               # opcional: temporada FICTÍCIA para testar
python scripts/servidor_local.py 8000   # sem cache: sempre a versão atual dos arquivos
```

- Dados reais: http://localhost:8000
- Dados fictícios (2025 e 2026): http://localhost:8000/?demo=1

## Comandos

| Comando | O que faz | Requisições (Highlightly / API-Football) |
|---|---|---|
| `status` | confere chave, cota e time | 1 / 3 |
| `jogos` | lista da temporada inteira (inclui jogos futuros) | 2 / 1 |
| `elenco` | elenco atual; só API-Football, só temporada atual | 0 / 1 |
| `detalhes` | eventos, estatísticas e jogadores dos jogos encerrados que faltam | 2 por jogo / 1 por jogo no plano grátis |
| `proximo` | detalhe do próximo jogo: previsão, estádio, árbitro e clima (renovado a cada 6 h) | 1 / — |
| `processar` | gera banco, CSVs, validação e `site/dados/<ano>.json` | 0 |
| `tudo` | `jogos` + `elenco` + `detalhes` + `processar` | — |
| `modelo-sumula <id>` | cria `data/<ano>/sumulas/<id>.csv` para conferir com a súmula oficial | 0 |
| `sumulas` | compara as súmulas preenchidas com a fonte → `data/<ano>/validacao/sumulas.md` | 0 |
| `inspecionar` | responde as dúvidas da documentação da API-Football pelos dados baixados | 0 |

Todos aceitam `--temporada <ano>` e `--fonte highlightly|api-football`.

Jogos já baixados ficam em cache e só são baixados de novo se foram coletados menos de 48 horas
após o jogo. Na Highlightly, a coleta baixa primeiro os jogos mais recentes e **para sozinha** antes
de esgotar a cota do dia (reserva de 4 requisições, `FLA_HL_RESERVA`); o que faltar vem na próxima
execução. A carga inicial de uma temporada inteira (~60 jogos) leva 2 dias no plano grátis.

### Quando os dados ficam prontos

Segundo a API-Football, placar e eventos atualizam a cada 15 segundos durante o jogo, e o guia
oficial recomenda buscar as estatísticas dos jogadores depois do apito final. Não há prazo publicado
para as correções. Por isso o workflow coleta às 00:17 e às 07:17 (Brasília) e recoleta cada jogo
até 48 h depois; cada recoleta grava o que mudou em `data/<ano>/validacao/alteracoes.csv`
(coluna `horas_apos_jogo`). Depois de algumas rodadas, esse arquivo mostra quanto tempo a API leva
para estabilizar e permite ajustar `JANELA_RECOLETA_HORAS` em `coleta/config.py`.

## Saídas

- `data/<ano>/flamengo.db` (SQLite) e `data/<ano>/csv/`:
  - `partidas` — placar, intervalo, mando, competição, fase, formação, técnico
  - `calendario` — todos os jogos da temporada, inclusive futuros
  - `elenco` — idade, posição e número
  - `jogadores_partida` — minutos, titular/reserva, nota, gols, assistências, finalizações, passes, desarmes, duelos, dribles, faltas, cartões (os dois times)
  - `eventos` — gols, cartões, substituições e VAR com minuto
  - `estatisticas_time` — posse, finalizações, escanteios, xG (quando a API tiver) etc.
- `data/<ano>/validacao/relatorio.md` — completude por competição e jogos com inconsistências.
- `data/<ano>/validacao/alteracoes.csv` — o que mudou entre coletas do mesmo jogo.
- `site/dados/<ano>.json` e `site/dados/temporadas.json` — o que o painel usa.

## Qualidade dos dados

Duas camadas:

1. **Regras automáticas** em todo jogo encerrado (`data/<ano>/validacao/relatorio.md` e aba "Qualidade dos dados"):

   | Regra | O que verifica |
   |---|---|
   | gols | gols dos jogadores (+ gols contra) somam o placar |
   | titulares | exatamente 11 titulares, todos com minutos |
   | substituicoes | reservas que entraram dentro do limite (5, +1 na prorrogação) e batendo com os eventos |
   | minutos | soma dos minutos ≈ 11 × duração real (com acréscimos, quando a fonte conta), descontando expulsões (tolerância de 15 min) |
   | finalizacoes | finalizações dos jogadores somam o total do time (tolerância de 2) |

2. **Conferência com a súmula oficial** (CBF para Brasileirão e Copa do Brasil), numa amostra de jogos:
   ```bash
   python -m coleta.coletar modelo-sumula 1234567   # id em data/<ano>/csv/partidas.csv
   # preencha data/<ano>/sumulas/1234567.csv (minutos em tempo corrido: 2º tempo aos 15' = 60)
   python -m coleta.coletar sumulas
   ```

## Publicação (Firebase Hosting)

O site é estático (`site/`), sem servidor nem banco: o painel lê `site/dados/<ano>.json`
(1,3 MB, ~75 KB comprimido). O SQLite (`data/<ano>/flamengo.db`) é só para análise local.

1. Crie um projeto em https://console.firebase.google.com (o Hosting é ativado no primeiro deploy).
2. Publicação manual, na raiz do repositório:
   ```bash
   firebase login                      # conta Google dona do projeto
   firebase use --add                  # escolha o projeto; grava .firebaserc
   firebase deploy --only hosting
   ```
3. Publicação automática (`.github/workflows/atualizar.yml`):
   - 00:17 e 07:17 (Brasília): coleta a temporada atual, faz commit dos dados e publica;
   - push em `site/**` ou `firebase.json` na `main`: só publica (não gasta cota da API);
   - em *Settings → Secrets and variables → Actions* do GitHub:
     - segredo `HIGHLIGHTLY_KEY`
     - segredo `FIREBASE_SERVICE_ACCOUNT` (gerado por `firebase init hosting:github`, ou uma chave JSON de conta de serviço com papel "Firebase Hosting Admin")
     - variável `FIREBASE_PROJECT_ID`

Cache: dados, JS, CSS e HTML saem com `no-cache` (o navegador revalida e só baixa o que mudou), então uma publicação aparece na hora.
`site/dados-demo/` nunca é publicado. Tudo no Hosting é público.

## O que já foi confirmado nos dados reais (15/10/2026)

- **API-Football, plano grátis:** só libera 2022 a 2024 e recusa `/fixtures?ids=`; em 2024 o Carioca
  vem sem escalação/estatísticas e a Copa do Brasil sem xG. Substituição: `player` é quem sai; gol
  contra vem no time beneficiado; `passes.accuracy` é contagem de passes certos.
- **Highlightly, plano grátis:** libera 2026 com xG em Brasileirão, Libertadores e Copa do Brasil;
  amistosos vêm sem jogadores. ID do Flamengo: `108861`. Minutos dos jogadores incluem os acréscimos.
  Substituição: `player` é quem sai e `substituted` quem entra. Alguns jogos listam um 12º "titular"
  com 0 minuto (aparece no relatório de validação).

## Testes

```bash
python -m pytest
```

Os testes usam partidas inventadas no formato de cada fonte, sem acesso à rede.

---

Projeto independente, sem vínculo com o Clube de Regatas do Flamengo.
