# DataFla — Flamengo 2026, dados por jogo e por jogador

Coleta todos os jogos do Flamengo em 2026 (todas as competições) na
[API-Football](https://www.api-football.com/), organiza em tabelas e valida a qualidade dos dados.

## Como rodar

```bash
python -m pip install -r requirements.txt
export API_FOOTBALL_KEY="sua_chave"      # PowerShell: $env:API_FOOTBALL_KEY="sua_chave"

python -m coleta.coletar status          # 1º passo: confere chave, cota, ID do time e acesso a 2026
python -m coleta.coletar tudo            # baixa jogos e detalhes, gera banco, CSVs e validação
```

A chave nunca vai para o código nem para o Git.

## Consumo de requisições

| Etapa | Requisições |
|---|---|
| `status` | 3 |
| `jogos` (lista da temporada inteira) | 1 |
| `detalhes` (20 jogos por chamada, com escalação, eventos, estatísticas e jogadores) | ~4 para a temporada |

A temporada inteira usa menos de 10 requisições; o plano grátis permite 100 por dia.
Jogos já baixados ficam em cache em `data/raw/` e só são baixados de novo se foram coletados
menos de 48 horas após o jogo (a API corrige dados nesse período).

## Saídas

- `data/flamengo.db` (SQLite) e `data/csv/`:
  - `partidas` — placar, intervalo, mando, competição, fase, formação, técnico
  - `jogadores_partida` — minutos, titular/reserva, nota, gols, assistências, finalizações, passes, desarmes, duelos, dribles, faltas, cartões (os dois times)
  - `eventos` — gols, cartões, substituições e VAR com minuto
  - `estatisticas_time` — posse, finalizações, escanteios, xG (quando a API tiver) etc.
- `data/validacao/relatorio.md` — completude por competição e jogos com inconsistências.

## Validação

Regras checadas em cada jogo encerrado, para os dois times:

| Regra | O que verifica |
|---|---|
| gols | gols dos jogadores (+ gols contra) somam o placar |
| titulares | exatamente 11 titulares, todos com minutos |
| substituicoes | reservas que entraram dentro do limite (5, +1 na prorrogação) e batendo com os eventos |
| minutos | soma dos minutos ≈ 11 × duração, descontando expulsões (tolerância de 15 min) |
| finalizacoes | finalizações dos jogadores somam o total do time (tolerância de 2) |

Os jogos apontados no relatório devem ser conferidos na súmula oficial (CBF para Brasileirão e Copa do Brasil).

## Pontos a confirmar na primeira coleta real

- O ID do Flamengo (`127`) — o comando `status` confere.
- Se o plano grátis libera a temporada 2026.
- O significado de `passes.accuracy` (contagem ou %) — guardado como `passes_precisao_api`.
- Em quais competições a API devolve `expected_goals` (xG).

## Testes

```bash
python -m pytest
```

Os testes usam uma partida inventada no formato da API, sem acesso à rede.
