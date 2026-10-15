from coleta import inspecionar
from tests.test_pipeline import partida_exemplo


def test_respostas_com_partida_sintetica():
    p = partida_exemplo()
    assert inspecionar.substituicao([p]) == {"player_sai": 1}
    assert inspecionar.gol_contra([p]) == {"time_beneficiado": 1}
    pas = inspecionar.precisao_passes([p])
    assert pas["accuracy_maior_que_total"] == 0 and pas["accuracy_ate_total"] > 0
    assert inspecionar.xg_por_competicao([p]) == {"Serie A": (1, 1)}
    texto = inspecionar.relatorio([p])
    assert "player_sai (1 de 1 casos)" in texto and "contagem" in texto


def test_detecta_convencoes_invertidas():
    p = partida_exemplo()
    sub = next(e for e in p["events"] if e["type"] == "subst")
    sub["player"], sub["assist"] = sub["assist"], sub["player"]
    contra = next(e for e in p["events"] if e["detail"] == "Own Goal")
    contra["team"] = {"id": 999}
    for item in p["players"][0]["players"]:
        item["statistics"][0]["passes"]["accuracy"] = "85%"
    assert inspecionar.substituicao([p]) == {"player_entra": 1}
    assert inspecionar.gol_contra([p]) == {"time_de_quem_marcou_contra": 1}
    assert inspecionar.precisao_passes([p])["accuracy_maior_que_total"] > 0
