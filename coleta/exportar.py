"""Exporta as tabelas em JSON para o site estático: site/dados/<temporada>.json + temporadas.json."""

from __future__ import annotations

import json
import os
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


def _traduzir(linhas: list[dict]) -> list[dict]:
    for l in linhas:
        if "competicao" in l:
            l["competicao"] = nome_competicao(l["competicao"])
        if l.get("posicao") in POSICOES:
            l["posicao"] = POSICOES[l["posicao"]]
    return linhas


def exportar(tabelas: dict[str, list[dict]], validacao: dict, destino: Path | None = None,
             demo: bool = False) -> Path:
    destino = destino or SITE_DADOS
    destino.mkdir(parents=True, exist_ok=True)
    conteudo = {
        "partidas": tabelas["partidas"],
        "calendario": tabelas.get("calendario", []),
        "elenco": tabelas.get("elenco", []),
        # Só os jogadores do Flamengo vão para o site; o adversário aparece nas estatísticas de time.
        "jogadores": [j for j in tabelas["jogadores_partida"] if j["eh_flamengo"]],
        "eventos": tabelas["eventos"],
        "estatisticas": tabelas["estatisticas_time"],
        "finalizacoes": tabelas.get("finalizacoes", []),
        "proximo": tabelas.get("proximo", []),
        "fotos": tabelas.get("fotos", []),
        # O painel só lista o que precisa de conferência; as checagens "ok" ficam no relatório local.
        "validacao": {**validacao, "checagens": [c for c in validacao.get("checagens", []) if c["status"] != "ok"]},
    }
    for nome, linhas in conteudo.items():
        if isinstance(linhas, list):
            _traduzir(linhas)
    for item in validacao.get("checagens", []) + validacao.get("completude", []):
        item["competicao"] = nome_competicao(item["competicao"])

    conteudo["meta"] = {
        "gerado_em": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "temporada": config.SEASON,
        "demo": demo,
        "fonte": config.FONTE,
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
