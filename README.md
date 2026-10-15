# DataFla — Flamengo 2026, dados por jogo e por jogador

Painel do Flamengo em 2026 em todas as competições (Brasileirão, Libertadores, Copa do Brasil,
Carioca, Supercopa, Recopa): resultados, xG, minutagem jogo a jogo e estatísticas por jogador,
com validação da qualidade dos dados.

```
API-Football ──► coleta/ (Python) ──► data/csv, data/flamengo.db ──► site/dados/dados.json ──► site/ (Firebase Hosting)
                       └─► data/validacao/ (relatório de qualidade)
```

## Primeiros passos

```bash
python -m pip install -r requirements.txt

# PowerShell: $env:API_FOOTBALL_KEY="sua_chave"
export API_FOOTBALL_KEY="sua_chave"

python -m coleta.coletar status   # confere chave, cota, ID do time e acesso a 2026
python -m coleta.coletar tudo     # baixa tudo, gera banco, CSVs, validação e o JSON do site
```

A chave nunca vai para o código nem para o Git.

### Ver o painel

```bash
python scripts/gerar_demo.py               # opcional: temporada FICTÍCIA para testar
cd site && python -m http.server 8000
```

- Dados reais: http://localhost:8000
- Dados fictícios: http://localhost:8000/?demo=1

## Comandos

| Comando | O que faz | Requisições |
|---|---|---|
| `status` | confere chave, cota, time e cobertura por competição | 3 |
| `jogos` | lista da temporada inteira (inclui jogos futuros) | 1 |
| `elenco` | elenco atual (idade, posição, número) | 1 |
| `detalhes` | escalação, eventos, estatísticas e jogadores, 20 jogos por chamada | ~4 na temporada |
| `processar` | gera banco, CSVs, validação e `site/dados/dados.json` | 0 |
| `tudo` | `jogos` + `elenco` + `detalhes` + `processar` | ~6 |
| `modelo-sumula <id>` | cria `data/sumulas/<id>.csv` para conferir com a súmula oficial | 0 |
| `sumulas` | compara as súmulas preenchidas com a API → `data/validacao/sumulas.md` | 0 |

O plano grátis permite 100 requisições por dia. Jogos já baixados ficam em cache em `data/raw/`
e só são baixados de novo se foram coletados menos de 48 horas após o jogo.

## Saídas

- `data/flamengo.db` (SQLite) e `data/csv/`:
  - `partidas` — placar, intervalo, mando, competição, fase, formação, técnico
  - `calendario` — todos os jogos da temporada, inclusive futuros
  - `elenco` — idade, posição e número
  - `jogadores_partida` — minutos, titular/reserva, nota, gols, assistências, finalizações, passes, desarmes, duelos, dribles, faltas, cartões (os dois times)
  - `eventos` — gols, cartões, substituições e VAR com minuto
  - `estatisticas_time` — posse, finalizações, escanteios, xG (quando a API tiver) etc.
- `data/validacao/relatorio.md` — completude por competição e jogos com inconsistências.
- `site/dados/dados.json` — tudo o que o painel usa.

## Qualidade dos dados

Duas camadas:

1. **Regras automáticas** em todo jogo encerrado (`data/validacao/relatorio.md` e aba "Qualidade dos dados"):

   | Regra | O que verifica |
   |---|---|
   | gols | gols dos jogadores (+ gols contra) somam o placar |
   | titulares | exatamente 11 titulares, todos com minutos |
   | substituicoes | reservas que entraram dentro do limite (5, +1 na prorrogação) e batendo com os eventos |
   | minutos | soma dos minutos ≈ 11 × duração, descontando expulsões (tolerância de 15 min) |
   | finalizacoes | finalizações dos jogadores somam o total do time (tolerância de 2) |

2. **Conferência com a súmula oficial** (CBF para Brasileirão e Copa do Brasil), numa amostra de jogos:
   ```bash
   python -m coleta.coletar modelo-sumula 1234567   # id em data/csv/partidas.csv
   # preencha data/sumulas/1234567.csv (minutos em tempo corrido: 2º tempo aos 15' = 60)
   python -m coleta.coletar sumulas
   ```

## Publicação (Firebase Hosting)

O site é estático (`site/`), sem banco nem servidor.

1. Crie um projeto em https://console.firebase.google.com e ative o Hosting.
2. Publicação manual: `npm install -g firebase-tools`, `firebase login`, `firebase use --add` (escolha o projeto) e `firebase deploy --only hosting`.
3. Publicação automática: o workflow `.github/workflows/atualizar.yml` roda todo dia, coleta, salva os dados no repositório e publica. No GitHub, em *Settings → Secrets and variables → Actions*:
   - segredo `API_FOOTBALL_KEY`
   - segredo `FIREBASE_SERVICE_ACCOUNT` (gerado por `firebase init hosting:github`, ou uma chave JSON de conta de serviço com papel "Firebase Hosting Admin")
   - variável `FIREBASE_PROJECT_ID`

`site/dados-demo/` nunca é publicado.

## Pontos a confirmar na primeira coleta real

- O ID do Flamengo (`127`): o comando `status` confere.
- Se o plano grátis libera a temporada 2026.
- Se o evento de gol contra vem com o time de quem marcou ou de quem se beneficiou (afeta o gráfico de gols por faixa).
- Se, nos eventos de substituição, `player` é quem sai e `assist` é quem entra.
- O significado de `passes.accuracy` (contagem ou %), guardado como `passes_precisao_api`.
- Em quais competições a API devolve `expected_goals` (xG).

## Testes

```bash
python -m pytest
```

Os testes usam uma partida inventada no formato da API, sem acesso à rede.

---

Projeto independente, sem vínculo com o Clube de Regatas do Flamengo.
