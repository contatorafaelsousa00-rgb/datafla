"""Correções manuais de resultado, para o que a fonte não registra (ex.: vitória por W.O.).

Ficam em data/<ano>/correcoes.json (versionado), aplicadas a cada `processar` sobre o calendário e as partidas:

    {"partidas": {"<id_partida>": {"status": "WO", "gols_pro": 3, "gols_contra": 0, "nota": "..."}}}

status "WO" = jogo não disputado com resultado decidido fora de campo; o painel conta como encerrado e marca "W.O.".
"""

from __future__ import annotations

import json

from . import config

ARQUIVO = "correcoes.json"
CAMPOS = ("status", "gols_pro", "gols_contra", "nota")


def carregar() -> dict:
    caminho = config.PASTA_TEMPORADA / ARQUIVO
    if not caminho.exists():
        return {}
    return {int(k): v for k, v in json.loads(caminho.read_text(encoding="utf-8")).get("partidas", {}).items()}


def aplicar(tabelas: dict[str, list[dict]], correcoes: dict | None = None) -> int:
    """Sobrepõe os campos corrigidos nas linhas de calendário e partidas. Devolve quantas linhas mudaram."""
    correcoes = carregar() if correcoes is None else correcoes
    mudou = 0
    for nome in ("calendario", "partidas"):
        for linha in tabelas.get(nome, []):
            c = correcoes.get(linha.get("id_partida"))
            if c:
                linha.update({k: c[k] for k in CAMPOS if k in c})
                mudou += 1
    return mudou
