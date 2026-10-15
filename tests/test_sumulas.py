"""Testa a comparação com súmulas usando a partida sintética dos outros testes."""

import csv

from coleta import normalizar, sumulas
from tests.test_pipeline import partida_exemplo


def _preencher(caminho, ajustes):
    with open(caminho, encoding="utf-8-sig") as f:
        linhas = list(csv.DictReader(f))
    for l in linhas:
        cam = int(l["camisa"])
        titular = cam in range(0, 11)  # camisas 0-10 = jogadores 100-110 (titulares)
        l.update({"titular": "S" if titular else "N", "gols": "1" if cam == 0 else "0",
                  "amarelos": "0", "vermelhos": "0"})
        if cam == 10:
            l["saiu_min"] = "60"
        if cam == 11:
            l["entrou_min"] = "60"
        l.update(ajustes.get(cam, {}))
    with open(caminho, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=sumulas.CAMPOS)
        w.writeheader()
        w.writerows(linhas)


def _rodar(tmp_path, ajustes):
    t = normalizar.normalizar([partida_exemplo()])
    partida = t["partidas"][0]
    caminho = sumulas.criar_modelo(partida, t["jogadores_partida"], tmp_path)
    _preencher(caminho, ajustes)
    return sumulas.comparar(partida, t["jogadores_partida"], sumulas.ler_sumula(caminho))


def test_sumula_igual_a_api(tmp_path):
    r = _rodar(tmp_path, {})
    assert r and all(c["confere"] for c in r), [c for c in r if not c["confere"]]


def test_sumula_detecta_divergencias(tmp_path):
    r = _rodar(tmp_path, {11: {"entrou_min": "55"}, 3: {"amarelos": "1"}})
    div = {(c["camisa"], c["campo"]) for c in r if not c["confere"]}
    assert div == {(11, "minutos"), (3, "amarelos")}
    assert "Divergências (2)" in sumulas.resumo_markdown(r)


def test_minutos_sumula():
    assert sumulas.minutos_sumula({"titular": True, "entrou_min": None, "saiu_min": None}, 90) == 90
    assert sumulas.minutos_sumula({"titular": False, "entrou_min": None, "saiu_min": None}, 90) == 0
    assert sumulas.minutos_sumula({"titular": False, "entrou_min": 70, "saiu_min": None}, 120) == 50
