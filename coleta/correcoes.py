"""Correções manuais de resultado, para o que a fonte não registra (ex.: vitória por W.O.).

Ficam em data/<ano>/correcoes.json (versionado), aplicadas a cada `processar` sobre o calendário e as partidas:

    {"partidas": {"<id_partida>": {"status": "WO", "gols_pro": 3, "gols_contra": 0, "nota": "..."}},
     "jogadores": {"<id duplicado>": <id que fica>}}

status "WO" = jogo não disputado com resultado decidido fora de campo; o painel conta como encerrado e marca "W.O.".
"jogadores": a fonte às vezes dá dois ids ao mesmo atleta (Lucas Vieira dos Santos, 99664789 e 81838869, no Carioca);
sem juntar, ele aparece duas vezes na tabela Jogadores com os minutos divididos.
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


def carregar_jogadores() -> dict[int, int]:
    caminho = config.PASTA_TEMPORADA / ARQUIVO
    if not caminho.exists():
        return {}
    return {int(k): int(v) for k, v in json.loads(caminho.read_text(encoding="utf-8")).get("jogadores", {}).items()}


def juntar_jogadores(tabelas: dict[str, list[dict]], apelidos: dict[int, int] | None = None) -> int:
    """Troca o id duplicado pelo que fica em todas as tabelas; nas tabelas por jogador (perfil, carreira, fotos), a linha
    do duplicado sai. Devolve quantas linhas mudaram."""
    apelidos = carregar_jogadores() if apelidos is None else apelidos
    if not apelidos:
        return 0
    mudou = 0
    for nome, linhas in tabelas.items():
        if not isinstance(linhas, list):
            continue
        if nome in ("perfis", "carreira", "fotos"):
            antes = len(linhas)
            linhas[:] = [l for l in linhas if not (isinstance(l, dict) and l.get("jogador_id") in apelidos)]
            mudou += antes - len(linhas)
            continue
        for l in linhas:
            if not isinstance(l, dict):
                continue
            for campo in ("jogador_id", "assist_id"):
                if l.get(campo) in apelidos:
                    l[campo] = apelidos[l[campo]]
                    mudou += 1
    return mudou


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
