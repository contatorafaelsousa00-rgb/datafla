"""Exporta as tabelas em JSON para o site estático: site/dados/<temporada>.json + temporadas.json."""

from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path

from . import config

SITE_DADOS = Path(os.environ.get("FLA_SITE_DADOS", config.ROOT / "site" / "dados"))

# Nome da API (inglês) -> nome curto em português. A busca é por trecho, em minúsculas.
COMPETICOES = [
    ("libertadores", "Libertadores"),
    ("recopa", "Recopa"),
    ("super", "Supercopa"),  # antes de "copa do brasil": "Supercopa do Brasil" contém os dois
    ("copa do brasil", "Copa do Brasil"),
    ("carioca", "Carioca"),
    ("serie a", "Brasileirão"),
    ("friendlies", "Amistosos"),
]

POSICOES = {"G": "Goleiro", "D": "Defensor", "M": "Meio-campo", "F": "Atacante",
            "Goalkeeper": "Goleiro", "Defender": "Defensor", "Midfielder": "Meio-campo", "Attacker": "Atacante"}


def nome_competicao(nome: str | None) -> str | None:
    if not nome:
        return nome
    baixo = nome.lower()
    return next((curto for trecho, curto in COMPETICOES if trecho in baixo), nome)


# Campos com nome de time. A fonte às vezes manda partícula em maiúsculas ("Vasco DA Gama").
CAMPOS_TIME = ("adversario", "time", "casa", "fora", "oponente")


def nome_time(nome):
    if not isinstance(nome, str):
        return nome
    return re.sub(r"(?<=\s)(DA|DE|DO|DAS|DOS)(?=\s)", lambda m: m.group(1).lower(), nome)


def _traduzir(linhas: list[dict]) -> list[dict]:
    for l in linhas:
        for c in CAMPOS_TIME:
            if c in l:
                l[c] = nome_time(l[c])
        if "competicao" in l:
            l["competicao"] = nome_competicao(l["competicao"])
        if l.get("posicao") in POSICOES:
            l["posicao"] = POSICOES[l["posicao"]]
    return linhas


# Tabelas grandes vão em colunas + linhas (os nomes dos campos não se repetem a cada linha): o JSON
# cai a menos da metade. O site volta a montar os objetos ao carregar (comum.js, expandir).
COMPACTAR = ("jogadores", "adversarios", "eventos", "estatisticas", "finalizacoes", "escalacoes", "carreira", "liga")


def compactar(linhas: list[dict]) -> dict:
    colunas = list(dict.fromkeys(k for l in linhas for k in l))
    return {"colunas": colunas, "linhas": [[l.get(c) for c in colunas] for l in linhas]}


def expandir(tabela):
    """Inverso de `compactar` (para testes e análises do JSON exportado)."""
    if isinstance(tabela, dict) and "colunas" in tabela:
        return [dict(zip(tabela["colunas"], l)) for l in tabela["linhas"]]
    return tabela


def exportar(tabelas: dict[str, list[dict]], validacao: dict, destino: Path | None = None,
             demo: bool = False, coletado_em: str | None = None, liga: dict | None = None) -> Path:
    destino = destino or SITE_DADOS
    destino.mkdir(parents=True, exist_ok=True)
    conteudo = {
        "partidas": tabelas["partidas"],
        "calendario": tabelas.get("calendario", []),
        "elenco": tabelas.get("elenco", []),
        # Só os jogadores do Flamengo vão para o site; o adversário aparece nas estatísticas de time.
        "jogadores": [j for j in tabelas["jogadores_partida"] if j["eh_flamengo"]],
        # Adversários: só para a ficha do jogador na partida (clique no campinho); a temporada é só do Flamengo
        "adversarios": [j for j in tabelas["jogadores_partida"] if not j["eh_flamengo"]],
        "eventos": tabelas["eventos"],
        "estatisticas": tabelas["estatisticas_time"],
        "finalizacoes": tabelas.get("finalizacoes", []),
        "proximo": tabelas.get("proximo", []),
        "confrontos": tabelas.get("confrontos", []),
        "forma_adversario": tabelas.get("forma_adversario", []),
        "escalacoes": tabelas.get("escalacoes", []),
        "classificacao": tabelas.get("classificacao", []),
        "carreira": tabelas.get("carreira", []),
        "liga": tabelas.get("liga", []),
        "mata_mata": tabelas.get("mata_mata", []),
        "perfis": tabelas.get("perfis", []),
        "fotos": tabelas.get("fotos", []),
        # O painel só lista o que precisa de conferência; as checagens "ok" ficam no relatório local.
        "validacao": {**validacao, "checagens": [c for c in validacao.get("checagens", []) if c["status"] != "ok"]},
    }
    for nome, linhas in conteudo.items():
        if isinstance(linhas, list):
            _traduzir(linhas)
    for item in validacao.get("checagens", []) + validacao.get("completude", []):
        item["competicao"] = nome_competicao(item["competicao"])
        if "adversario" in item:
            item["adversario"] = nome_time(item["adversario"])

    agora = datetime.now(timezone.utc).isoformat(timespec="seconds")
    for nome in COMPACTAR:
        conteudo[nome] = compactar(conteudo[nome])
    conteudo["meta"] = {
        "gerado_em": agora,
        "coletado_em": coletado_em or agora,
        "temporada": config.SEASON,
        "demo": demo,
        "fonte": config.FONTE,
        "liga": liga,  # {coletado_em, sem_resultado} do arquivo da liga (aviso no painel)
    }
    arquivo = destino / f"{config.SEASON}.json"
    arquivo.write_text(json.dumps(conteudo, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    atualizar_indice(destino)
    return arquivo


def atualizar_indice(destino: Path) -> Path:
    """Reescreve temporadas.json com as temporadas exportadas, da mais recente para a mais antiga."""
    temporadas = []
    for arq in sorted(destino.glob("[0-9][0-9][0-9][0-9].json"), reverse=True):
        dados = json.loads(arq.read_text(encoding="utf-8"))
        temporadas.append({
            "temporada": dados["meta"]["temporada"],
            "jogos": len(dados["partidas"]),
            "gerado_em": dados["meta"]["gerado_em"],
        })
    indice = destino / "temporadas.json"
    indice.write_text(json.dumps(temporadas, ensure_ascii=False, indent=1), encoding="utf-8")
    return indice
