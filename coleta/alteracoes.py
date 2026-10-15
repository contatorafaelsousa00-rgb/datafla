"""Registra o que muda num jogo entre duas coletas.

Serve para medir, na prática, quanto tempo depois do jogo os dados da API param de mudar:
cada recoleta (até 48 h depois do jogo) compara com a versão anterior e grava as diferenças
em data/<temporada>/validacao/alteracoes.csv.
"""

from __future__ import annotations

import csv
from datetime import datetime

from . import config, normalizar

CAMPOS = ["id_partida", "data_jogo", "coletado_antes", "coletado_agora", "horas_apos_jogo",
          "tabela", "chave", "campo", "antes", "depois"]


def _indexar(partida: dict) -> dict[tuple, dict]:
    """Achata a partida em {(tabela, chave): linha} para comparar campo a campo."""
    t = normalizar.normalizar([partida])
    idx = {("partida", ""): t["partidas"][0]}
    for j in t["jogadores_partida"]:
        idx[("jogador", f"{j['time_id']}:{j['jogador_id']}")] = j
    for s in t["estatisticas_time"]:
        idx[("estatistica", f"{s['time_id']}:{s['estatistica']}")] = {"valor": s["valor"]}
    idx[("eventos", "")] = {"quantidade": len(t["eventos"]),
                            "assinatura": "|".join(f"{e['minuto']}{e['tipo']}{e['jogador_id']}" for e in t["eventos"])}
    return idx


def comparar(antiga: dict, nova: dict) -> list[dict]:
    a, n = _indexar(antiga), _indexar(nova)
    data_jogo = datetime.fromisoformat(nova["fixture"]["date"])
    agora = datetime.fromisoformat(nova["_coletado_em"])
    base = {
        "id_partida": nova["fixture"]["id"],
        "data_jogo": nova["fixture"]["date"],
        "coletado_antes": antiga.get("_coletado_em"),
        "coletado_agora": nova["_coletado_em"],
        "horas_apos_jogo": round((agora - data_jogo).total_seconds() / 3600, 1),
    }
    mudancas = []
    for chave in sorted(set(a) | set(n), key=str):
        la, ln = a.get(chave, {}), n.get(chave, {})
        for campo in sorted(set(la) | set(ln)):
            if campo == "_coletado_em" or la.get(campo) == ln.get(campo):
                continue
            mudancas.append({**base, "tabela": chave[0], "chave": chave[1], "campo": campo,
                             "antes": la.get(campo), "depois": ln.get(campo)})
    return mudancas


def registrar(mudancas: list[dict]) -> None:
    if not mudancas:
        return
    destino = config.RELATORIO_DIR / "alteracoes.csv"
    destino.parent.mkdir(parents=True, exist_ok=True)
    novo = not destino.exists()
    with open(destino, "a", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=CAMPOS)
        if novo:
            w.writeheader()
        w.writerows(mudancas)
