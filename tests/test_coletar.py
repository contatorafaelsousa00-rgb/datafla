"""Testa o fluxo da linha de comando com uma API falsa (sem rede)."""

import json

from coleta import coletar, config
from tests.test_pipeline import partida_exemplo


class APIFalsa:
    def __init__(self, partidas):
        self.partidas = {p["fixture"]["id"]: p for p in partidas}
        self.chamadas = []

    def get(self, endpoint, **params):
        self.chamadas.append((endpoint, params))
        if endpoint == "players/squads":
            return {"response": [{"team": {"id": config.TEAM_ID}, "players": [
                {"id": 100, "name": "Jogador 100", "age": 25, "number": 10, "position": "Midfielder", "photo": None}]}]}
        if "ids" in params:
            ids = [int(i) for i in params["ids"].split("-")]
            return {"response": [self.partidas[i] for i in ids]}
        if "id" in params:
            return {"response": [self.partidas[params["id"]]]}
        return {"response": list(self.partidas.values())}


def test_fluxo_completo(tmp_path, monkeypatch):
    for nome in ("RAW_DIR", "CSV_DIR", "RELATORIO_DIR"):
        monkeypatch.setattr(config, nome, tmp_path / nome)
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "f.db")
    monkeypatch.setattr(config, "LOTE_DETALHES", 20)  # independe do .env local
    from coleta import exportar
    monkeypatch.setattr(exportar, "SITE_DADOS", tmp_path / "site")

    partidas = []
    for i in range(25):
        p = partida_exemplo()
        p["fixture"]["id"] = i + 1
        partidas.append(p)
    partidas[-1]["fixture"]["status"]["short"] = "NS"  # jogo futuro, não deve ser baixado

    api = APIFalsa(partidas)
    assert coletar.cmd_jogos(api) == 0
    assert coletar.cmd_elenco(api) == 0
    assert coletar.cmd_detalhes(api) == 0
    lotes = [c for c in api.chamadas if "ids" in c[1]]
    assert len(lotes) == 2  # 24 jogos encerrados em lotes de 20

    assert coletar.cmd_processar() == 0
    assert (config.RELATORIO_DIR / "relatorio.md").exists()
    assert (config.CSV_DIR / "jogadores_partida.csv").exists()

    import csv
    with open(config.CSV_DIR / "calendario.csv", encoding="utf-8-sig") as f:
        assert len(list(csv.DictReader(f))) == 25  # inclui o jogo futuro
    with open(config.CSV_DIR / "elenco.csv", encoding="utf-8-sig") as f:
        assert list(csv.DictReader(f))[0]["idade"] == "25"

    import json
    dados = json.loads((tmp_path / "site" / f"{config.SEASON}.json").read_text(encoding="utf-8"))
    indice = json.loads((tmp_path / "site" / "temporadas.json").read_text(encoding="utf-8"))
    assert indice[0]["temporada"] == config.SEASON and indice[0]["jogos"] == 24
    assert dados["partidas"][0]["competicao"] == "Brasileirão"
    jogadores = exportar.expandir(dados["jogadores"])
    assert jogadores and all(j["eh_flamengo"] for j in jogadores)


def test_detalhes_um_por_vez_no_plano_gratis(tmp_path, monkeypatch):
    # O plano grátis recusa /fixtures?ids=; com lote 1 cada jogo vai por /fixtures?id=.
    monkeypatch.setattr(config, "RAW_DIR", tmp_path / "raw")
    monkeypatch.setattr(config, "LOTE_DETALHES", 1)
    partidas = []
    for i in range(3):
        p = partida_exemplo()
        p["fixture"]["id"] = i + 1
        partidas.append(p)
    api = APIFalsa(partidas)
    assert coletar.cmd_jogos(api) == 0
    assert coletar.cmd_detalhes(api) == 0
    detalhes = [c[1] for c in api.chamadas if c[1] != {"team": config.TEAM_ID, "season": config.SEASON}]
    assert detalhes == [{"id": 1}, {"id": 2}, {"id": 3}]
    assert len(list((tmp_path / "raw").glob("partida_*.json"))) == 3


def test_temporadas_separadas(tmp_path, monkeypatch):
    from coleta import exportar, normalizar, validar
    monkeypatch.setattr(config, "DATA_DIR", tmp_path)
    monkeypatch.setattr(exportar, "SITE_DADOS", tmp_path / "site")
    for ano in (2025, 2026):
        config.aplicar_temporada(ano)
        assert config.RAW_DIR == tmp_path / str(ano) / "raw"
        t = normalizar.normalizar([partida_exemplo()])
        exportar.exportar(t, validar.validar(t))
    config.aplicar_temporada(config.TEMPORADA_ATUAL)
    indice = json.loads((tmp_path / "site" / "temporadas.json").read_text(encoding="utf-8"))
    assert [i["temporada"] for i in indice] == [2026, 2025]


def test_processar_todas_gera_cada_temporada_com_dados(tmp_path, monkeypatch):
    """Virada de ano: o deploy gera o JSON de todas as temporadas com dados, não só a do relógio."""
    raw = config.FONTES[config.FONTE]["raw"]
    for ano in (2026, 2027):
        (tmp_path / str(ano) / raw).mkdir(parents=True)
    (tmp_path / "2026" / raw / "partida_1.json").write_text("{}")  # 2027 ainda sem jogo: fica de fora
    (tmp_path / "2024").mkdir()  # pasta sem dados da fonte: fica de fora
    monkeypatch.setattr(config, "DATA_DIR", tmp_path)
    assert coletar.temporadas_com_dados() == [2026]
    (tmp_path / "2027" / raw / "partida_9.json").write_text("{}")
    processadas = []
    monkeypatch.setattr(coletar, "cmd_processar", lambda: processadas.append(config.SEASON) or 0)
    assert coletar.cmd_processar_todas() == 0
    assert processadas == [2026, 2027]
    monkeypatch.undo()  # DATA_DIR de volta antes de reapontar os caminhos
    config.aplicar_temporada(config.TEMPORADA_ATUAL)
