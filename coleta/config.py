"""Configurações do projeto. Tudo pode ser sobrescrito por variável de ambiente."""

import os
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
# Pasta base; cada temporada fica numa subpasta (data/2026/, data/2025/...).
DATA_DIR = Path(os.environ.get("FLA_DATA_DIR", ROOT / "data"))
TEMPORADA_ATUAL = datetime.now(timezone.utc).year

BASE_URL = "https://v3.football.api-sports.io"
API_KEY_ENV = "API_FOOTBALL_KEY"

# ID do Flamengo na API-Football. O comando `python -m coleta.coletar status`
# confere se o ID corresponde mesmo ao Flamengo antes de coletar.
TEAM_ID = int(os.environ.get("FLA_TEAM_ID", "127"))


def aplicar_temporada(ano: int) -> None:
    """Aponta todos os caminhos para a pasta da temporada `ano`."""
    global SEASON, PASTA_TEMPORADA, RAW_DIR, DB_PATH, CSV_DIR, RELATORIO_DIR, SUMULAS_DIR
    SEASON = int(ano)
    PASTA_TEMPORADA = DATA_DIR / str(SEASON)
    RAW_DIR = PASTA_TEMPORADA / "raw"
    DB_PATH = PASTA_TEMPORADA / "flamengo.db"
    CSV_DIR = PASTA_TEMPORADA / "csv"
    RELATORIO_DIR = PASTA_TEMPORADA / "validacao"
    SUMULAS_DIR = PASTA_TEMPORADA / "sumulas"


aplicar_temporada(os.environ.get("FLA_SEASON", TEMPORADA_ATUAL))

# A API aceita até 20 IDs por chamada em /fixtures?ids=
LOTE_DETALHES = 20

# Jogos encerrados há menos que isso são coletados de novo, porque a API
# costuma corrigir estatísticas nas horas seguintes ao jogo.
JANELA_RECOLETA_HORAS = 48

STATUS_ENCERRADO = {"FT", "AET", "PEN"}


def api_key() -> str:
    key = os.environ.get(API_KEY_ENV)
    if not key:
        raise RuntimeError(
            f"Defina a variável de ambiente {API_KEY_ENV} com a sua chave da API-Football."
        )
    return key
