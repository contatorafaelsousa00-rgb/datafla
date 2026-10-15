"""Configurações do projeto. Tudo pode ser sobrescrito por variável de ambiente."""

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get("FLA_DATA_DIR", ROOT / "data"))
RAW_DIR = DATA_DIR / "raw"
DB_PATH = DATA_DIR / "flamengo.db"
CSV_DIR = DATA_DIR / "csv"
RELATORIO_DIR = DATA_DIR / "validacao"

BASE_URL = "https://v3.football.api-sports.io"
API_KEY_ENV = "API_FOOTBALL_KEY"

# ID do Flamengo na API-Football. O comando `python -m coleta.coletar status`
# confere se o ID corresponde mesmo ao Flamengo antes de coletar.
TEAM_ID = int(os.environ.get("FLA_TEAM_ID", "127"))
SEASON = int(os.environ.get("FLA_SEASON", "2026"))

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
