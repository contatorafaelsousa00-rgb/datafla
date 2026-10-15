# DataFla — Flamengo 2026, dados por jogo e por jogador

Painel do Flamengo em 2026 em todas as competições (Brasileirão, Libertadores, Copa do Brasil,
Carioca, Supercopa, Recopa): resultados, xG, minutagem jogo a jogo e estatísticas por jogador,
com validação da qualidade dos dados.

```
API-Football ──► coleta/ (Python) ──► data/<ano>/csv, flamengo.db ──► site/dados/<ano>.json ──► site/ (Firebase Hosting)
                       └─► data/<ano>/validacao/ (relatório de qualidade)
```

## Primeiros passos

```bash
python -m pip install -r requirements.txt

# PowerShell: $env:API_FOOTBALL_KEY="sua_chave"
export API_FOOTBALL_KEY="sua_chave"

python -m coleta.coletar status   # confere chave, cota, ID do time e acesso a 2026
python -m coleta.coletar tudo     # baixa tudo, gera banco, CSVs, validação e o JSON do site

python -m coleta.coletar tudo --temporada 2025   # outra temporada (o padrão é o ano atual)
```

Cada temporada fica separada em `data/<ano>/` e `site/dados/<ano>.json`; o painel lista as
temporadas de `site/dados/temporadas.json` e tem um seletor (link direto: `?t=2025`).
O plano grátis da API pode não liberar todas as temporadas antigas; o `status --temporada <ano>` mostra.

A chave nunca vai para o código nem para o Git.

### Ver o painel

```bash
python scripts/gerar_demo.py               # opcional: temporada FICTÍCIA para testar
cd site && python -m http.server 8000
```

- Dados reais: http://localhost:8000
- Dados fictícios (2025 e 2026): http://localhost:8000/?demo=1

## Comandos

| Comando | O que faz | Requisições |
|---|---|---|
| `status` | confere chave, cota, time e cobertura por competição | 3 |
| `jogos` | lista da temporada inteira (inclui jogos futuros) | 1 |
| `elenco` | elenco atual (idade, posição, número); só na temporada atual, a API não tem elencos antigos | 1 |
| `detalhes` | escalação, eventos, estatísticas e jogadores, 20 jogos por chamada | ~4 na temporada |
| `processar` | gera banco, CSVs, validação e `site/dados/<ano>.json` | 0 |
| `tudo` | `jogos` + `elenco` + `detalhes` + `processar` | ~6 |
| `modelo-sumula <id>` | cria `data/<ano>/sumulas/<id>.csv` para conferir com a súmula oficial | 0 |
| `sumulas` | compara as súmulas preenchidas com a API → `data/<ano>/validacao/sumulas.md` | 0 |

Todos aceitam `--temporada <ano>`.

O plano grátis permite 100 requisições por dia. Jogos já baixados ficam em cache em `data/<ano>/raw/`
e só são baixados de novo se foram coletados menos de 48 horas após o jogo.

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
   | minutos | soma dos minutos ≈ 11 × duração, descontando expulsões (tolerância de 15 min) |
   | finalizacoes | finalizações dos jogadores somam o total do time (tolerância de 2) |

2. **Conferência com a súmula oficial** (CBF para Brasileirão e Copa do Brasil), numa amostra de jogos:
   ```bash
   python -m coleta.coletar modelo-sumula 1234567   # id em data/<ano>/csv/partidas.csv
   # preencha data/<ano>/sumulas/1234567.csv (minutos em tempo corrido: 2º tempo aos 15' = 60)
   python -m coleta.coletar sumulas
   ```

## Publicação (Firebase Hosting)

O site é estático (`site/`), sem banco nem servidor.

1. Crie um projeto em https://console.firebase.google.com e ative o Hosting.
2. Publicação manual: `npm install -g firebase-tools`, `firebase login`, `firebase use --add` (escolha o projeto) e `firebase deploy --only hosting`.
3. Publicação automática: o workflow `.github/workflows/atualizar.yml` roda duas vezes por dia, coleta a temporada atual, salva os dados no repositório e publica. No GitHub, em *Settings → Secrets and variables → Actions*:
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
