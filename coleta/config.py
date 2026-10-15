"""Configurações do projeto.

Valores vêm de variáveis de ambiente ou do arquivo `.env` na raiz do projeto
(veja `.env.exemplo`). Uma variável já definida no terminal tem prioridade sobre o `.env`.
"""

import os
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def carregar_env(caminho: Path) -> None:
    """Lê linhas CHAVE=valor do .env sem sobrescrever o que já está no ambiente."""
    if not caminho.exists():
        return
    for linha in caminho.read_text(encoding="utf-8-sig").splitlines():
        linha = linha.strip()
        if not linha or linha.startswith("#") or "=" not in linha:
            continue
        chave, valor = linha.split("=", 1)
        if not os.environ.get(chave.strip()):  # vazio conta como não definido
            os.environ[chave.strip()] = valor.strip().strip('"').strip("'")


carregar_env(ROOT / ".env")

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
            f"Chave da API não encontrada. Crie o arquivo .env na raiz do projeto com a linha\n"
            f"  {API_KEY_ENV}=sua_chave\n(modelo em .env.exemplo) ou defina a variável de ambiente."
        )
    return key
