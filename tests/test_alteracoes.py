import copy

from coleta import alteracoes
from tests.test_pipeline import partida_exemplo


def test_detecta_mudancas_entre_coletas():
    antiga = partida_exemplo()
    antiga["_coletado_em"] = "2026-05-11T07:00:00+00:00"
    nova = copy.deepcopy(antiga)
    nova["_coletado_em"] = "2026-05-12T07:00:00+00:00"
    nova["players"][0]["players"][0]["statistics"][0]["games"]["rating"] = "7.8"
    nova["statistics"][0]["statistics"][0]["value"] = 14

    m = alteracoes.comparar(antiga, nova)
    assert {(x["tabela"], x["campo"], x["antes"], x["depois"]) for x in m} == {
        ("jogador", "nota", 7.0, 7.8), ("estatistica", "valor", 13, 14)}
    assert m[0]["horas_apos_jogo"] == 33.5


def test_sem_mudancas():
    a = partida_exemplo()
    a["_coletado_em"] = "2026-05-11T07:00:00+00:00"
    b = copy.deepcopy(a)
    b["_coletado_em"] = "2026-05-12T07:00:00+00:00"
    assert alteracoes.comparar(a, b) == []
