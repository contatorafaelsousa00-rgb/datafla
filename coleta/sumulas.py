"""Comparação dos dados da API com as súmulas oficiais, preenchidas à mão.

Fluxo:
1. `python -m coleta.coletar modelo-sumula <id_partida>` cria data/sumulas/<id>.csv
   com os jogadores do Flamengo relacionados (nome e camisa) e as colunas a preencher.
2. Você preenche a partir da súmula oficial (CBF: cbf.com.br, página do jogo).
   Minutos em tempo corrido: 2º tempo aos 15' = 60. Prorrogação: 1º tempo aos 5' = 95.
3. `python -m coleta.coletar sumulas` compara todas as súmulas preenchidas com a API.

A comparação usa o número da camisa, que é mais estável que a grafia do nome.
"""

from __future__ import annotations

import csv
from pathlib import Path

from . import config

SUMULAS_DIR = config.DATA_DIR / "sumulas"
CAMPOS = ["camisa", "jogador", "titular", "entrou_min", "saiu_min", "gols", "amarelos", "vermelhos"]
TOLERANCIA_MIN = 1


def criar_modelo(partida: dict, jogadores: list[dict], pasta: Path | None = None) -> Path:
    pasta = pasta or SUMULAS_DIR
    pasta.mkdir(parents=True, exist_ok=True)
    caminho = pasta / f"{partida['id_partida']}.csv"
    if caminho.exists():
        raise FileExistsError(f"{caminho} já existe; apague para gerar de novo.")
    fla = sorted((j for j in jogadores if j["eh_flamengo"]), key=lambda j: (not j["titular"], j["numero"] or 99))
    with open(caminho, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(CAMPOS)
        for j in fla:
            # Só nome e camisa vêm da API; os valores ficam em branco para não induzir a conferência.
            w.writerow([j["numero"], j["jogador"], "", "", "", "", "", ""])
    return caminho


def _int(v):
    v = (v or "").strip()
    return int(v) if v else None


def ler_sumula(caminho: Path) -> list[dict]:
    with open(caminho, encoding="utf-8-sig") as f:
        linhas = list(csv.DictReader(f))
    preenchidas = [l for l in linhas if (l.get("titular") or "").strip()]
    return [{
        "camisa": _int(l["camisa"]),
        "jogador": l["jogador"],
        "titular": l["titular"].strip().upper() in {"S", "SIM", "1", "X"},
        "entrou_min": _int(l["entrou_min"]),
        "saiu_min": _int(l["saiu_min"]),
        "gols": _int(l["gols"]) or 0,
        "amarelos": _int(l["amarelos"]) or 0,
        "vermelhos": _int(l["vermelhos"]) or 0,
    } for l in preenchidas]


def minutos_sumula(linha: dict, duracao: int) -> int:
    """Minutos jogados segundo a súmula. Reserva sem 'entrou_min' não jogou."""
    if linha["titular"]:
        inicio = 0
    elif linha["entrou_min"] is None:
        return 0
    else:
        inicio = linha["entrou_min"]
    fim = linha["saiu_min"] if linha["saiu_min"] is not None else duracao
    return max(0, fim - inicio)


def comparar(partida: dict, jogadores: list[dict], sumula: list[dict]) -> list[dict]:
    api = {j["numero"]: j for j in jogadores if j["eh_flamengo"]}
    resultado = []

    def reg(camisa, nome, campo, v_sumula, v_api, ok):
        resultado.append({
            "id_partida": partida["id_partida"],
            "data_utc": partida["data_utc"],
            "competicao": partida["competicao"],
            "adversario": partida["adversario"],
            "camisa": camisa,
            "jogador": nome,
            "campo": campo,
            "sumula": v_sumula,
            "api": v_api,
            "confere": ok,
        })

    for s in sumula:
        j = api.get(s["camisa"])
        if j is None:
            reg(s["camisa"], s["jogador"], "jogador", "relacionado", "ausente", False)
            continue
        reg(s["camisa"], s["jogador"], "titular", s["titular"], j["titular"], s["titular"] == j["titular"])
        m_s, m_a = minutos_sumula(s, partida["duracao"]), j["minutos"] or 0
        reg(s["camisa"], s["jogador"], "minutos", m_s, m_a, abs(m_s - m_a) <= TOLERANCIA_MIN)
        for campo, chave in (("gols", "gols"), ("amarelos", "amarelos"), ("vermelhos", "vermelhos")):
            v_a = j[chave] or 0
            reg(s["camisa"], s["jogador"], campo, s[campo], v_a, s[campo] == v_a)
    return resultado


def resumo_markdown(comparacoes: list[dict]) -> str:
    if not comparacoes:
        return "# Comparação com súmulas\n\nNenhuma súmula preenchida em data/sumulas/.\n"
    jogos = sorted({(c["data_utc"][:10], c["adversario"], c["competicao"]) for c in comparacoes})
    linhas = ["# Comparação com súmulas", "", f"{len(jogos)} jogo(s) conferido(s).", "",
              "| Campo | Conferem | Total | % |", "|---|---:|---:|---:|"]
    campos = sorted({c["campo"] for c in comparacoes})
    for campo in campos:
        itens = [c for c in comparacoes if c["campo"] == campo]
        ok = sum(c["confere"] for c in itens)
        linhas.append(f"| {campo} | {ok} | {len(itens)} | {100 * ok / len(itens):.0f}% |")
    divergencias = [c for c in comparacoes if not c["confere"]]
    linhas += ["", f"## Divergências ({len(divergencias)})", ""]
    if divergencias:
        linhas += ["| Data | Jogo | Camisa | Jogador | Campo | Súmula | API |", "|---|---|---:|---|---|---|---|"]
        for c in divergencias:
            linhas.append(f"| {c['data_utc'][:10]} | x {c['adversario']} | {c['camisa']} | {c['jogador']} "
                          f"| {c['campo']} | {c['sumula']} | {c['api']} |")
    else:
        linhas.append("Nenhuma.")
    return "\n".join(linhas) + "\n"
