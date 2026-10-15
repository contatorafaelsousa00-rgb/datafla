import pytest

from coleta import config


@pytest.fixture(autouse=True)
def fonte_api_football():
    """Os testes usam respostas no formato da API-Football; independe do .env local."""
    anterior = config.FONTE
    config.aplicar_fonte("api-football")
    yield
    config.aplicar_fonte(anterior)
