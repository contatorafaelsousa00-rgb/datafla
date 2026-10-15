"""Testa o fluxo da linha de comando com uma API falsa (sem rede)."""

from coleta import coletar, config
from tests.test_pipeline import partida_exemplo


class APIFalsa:
    def __init__(self, partidas):
        self.partidas = {p["fixture"]["id"]: p for p in partidas}
        self.chamadas = []

    def get(self, endpoint, **params):
        self.chamadas.append((endpoint, params))
        if "ids" in params:
            ids = [int(i) for i in params["ids"].split("-")]
            return {"response": [self.partidas[i] for i in ids]}
        return {"response": list(self.partidas.values())}


def test_fluxo_completo(tmp_path, monkeypatch):
    for nome in ("RAW_DIR", "CSV_DIR", "RELATORIO_DIR"):
        monkeypatch.setattr(config, nome, tmp_path / nome)
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "f.db")

    partidas = []
    for i in range(25):
        p = partida_exemplo()
        p["fixture"]["id"] = i + 1
        partidas.append(p)
    partidas[-1]["fixture"]["status"]["short"] = "NS"  # jogo futuro, não deve ser baixado

    api = APIFalsa(partidas)
    assert coletar.cmd_jogos(api) == 0
    assert coletar.cmd_detalhes(api) == 0
    lotes = [c for c in api.chamadas if "ids" in c[1]]
    assert len(lotes) == 2  # 24 jogos encerrados em lotes de 20

    assert coletar.cmd_processar() == 0
    assert (config.RELATORIO_DIR / "relatorio.md").exists()
    assert (config.CSV_DIR / "jogadores_partida.csv").exists()
