"""Testes com uma partida sintética no formato de /fixtures?ids= da API-Football.

Os dados aqui são inventados só para exercitar o código; não representam jogos reais.
"""

import copy

from coleta import armazenar, config, normalizar, validar

FLA, ADV = config.FONTES["api-football"]["team_id"], 999


def jogador(pid, minutos, titular=True, gols=None, chutes=None, passes=20, nota="7.0"):
    return {
        "player": {"id": pid, "name": f"Jogador {pid}"},
        "statistics": [{
            "games": {"minutes": minutos, "number": pid % 100, "position": "M",
                      "rating": nota, "captain": False, "substitute": not titular},
            "offsides": None,
            "shots": {"total": chutes, "on": None},
            "goals": {"total": gols, "conceded": 0, "assists": None, "saves": None},
            "passes": {"total": passes, "key": None, "accuracy": "15"},
            "tackles": {"total": None, "blocks": None, "interceptions": None},
            "duels": {"total": None, "won": None},
            "dribbles": {"attempts": None, "success": None, "past": None},
            "fouls": {"drawn": None, "committed": None},
            "cards": {"yellow": 0, "red": 0},
            "penalty": {"won": None, "commited": None, "scored": 0, "missed": 0, "saved": None},
        }],
    }


def partida_exemplo():
    # Flamengo: 11 titulares, um sai aos 60 e entra um reserva (30 min). Gols: 1 jogador + 1 gol contra.
    fla = [jogador(100 + i, 90, chutes=1) for i in range(10)]
    fla.append(jogador(110, 60, chutes=1))
    fla.append(jogador(111, 30, titular=False, chutes=2))
    fla[0]["statistics"][0]["goals"]["total"] = 1
    fla.append(jogador(112, None, titular=False))  # reserva que não entrou

    # Adversário: um titular expulso aos 80.
    adv = [jogador(200 + i, 90) for i in range(10)]
    adv.append(jogador(210, 80))
    adv[0]["statistics"][0]["goals"]["total"] = 1

    return {
        "fixture": {"id": 1, "date": "2026-05-10T21:30:00+00:00", "referee": "Árbitro X",
                    "status": {"short": "FT"}, "venue": {"name": "Maracanã", "city": "Rio de Janeiro"}},
        "league": {"id": 71, "name": "Serie A", "round": "Regular Season - 7"},
        "teams": {"home": {"id": FLA, "name": "Flamengo"}, "away": {"id": ADV, "name": "Rival"}},
        "goals": {"home": 2, "away": 1},
        "score": {"halftime": {"home": 1, "away": 0}, "penalty": {"home": None, "away": None}},
        "events": [
            {"time": {"elapsed": 30, "extra": None}, "team": {"id": FLA}, "player": {"id": 100, "name": "Jogador 100"},
             "assist": {"id": None, "name": None}, "type": "Goal", "detail": "Normal Goal", "comments": None},
            {"time": {"elapsed": 55, "extra": None}, "team": {"id": ADV}, "player": {"id": 200, "name": "Jogador 200"},
             "assist": {"id": None, "name": None}, "type": "Goal", "detail": "Normal Goal", "comments": None},
            {"time": {"elapsed": 60, "extra": None}, "team": {"id": FLA}, "player": {"id": 110, "name": "Jogador 110"},
             "assist": {"id": 111, "name": "Jogador 111"}, "type": "subst", "detail": "Substitution 1", "comments": None},
            {"time": {"elapsed": 75, "extra": None}, "team": {"id": FLA}, "player": {"id": 205, "name": "Jogador 205"},
             "assist": {"id": None, "name": None}, "type": "Goal", "detail": "Own Goal", "comments": None},
            {"time": {"elapsed": 80, "extra": None}, "team": {"id": ADV}, "player": {"id": 210, "name": "Jogador 210"},
             "assist": {"id": None, "name": None}, "type": "Card", "detail": "Red Card", "comments": None},
        ],
        "lineups": [{"team": {"id": FLA}, "formation": "4-3-3", "coach": {"name": "Técnico"}}],
        "statistics": [
            {"team": {"id": FLA}, "statistics": [
                {"type": "Total Shots", "value": 13}, {"type": "Ball Possession", "value": "58%"},
                {"type": "expected_goals", "value": "1.84"}]},
            {"team": {"id": ADV}, "statistics": [{"type": "Total Shots", "value": None}]},
        ],
        "players": [{"team": {"id": FLA}, "players": fla}, {"team": {"id": ADV}, "players": adv}],
    }


def regras(resultado, time="Flamengo"):
    return {c["regra"]: c for c in resultado["checagens"] if c["time"] == time}


def test_numero():
    assert normalizar.numero("58%") == 0.58
    assert normalizar.numero("7.3") == 7.3
    assert normalizar.numero("12") == 12
    assert normalizar.numero(None) is None
    assert normalizar.numero("N/A") is None


def test_normalizacao():
    t = normalizar.normalizar([partida_exemplo()])
    p = t["partidas"][0]
    assert (p["mando"], p["gols_pro"], p["gols_contra"], p["resultado"]) == ("Casa", 2, 1, "V")
    assert p["formacao"] == "4-3-3"
    fla = [j for j in t["jogadores_partida"] if j["eh_flamengo"]]
    assert len(fla) == 13 and sum(j["titular"] for j in fla) == 11
    est = {(s["eh_flamengo"], s["estatistica"]): s["valor"] for s in t["estatisticas_time"]}
    assert est[(True, "posse")] == 0.58 and est[(True, "xg")] == 1.84


def test_partida_coerente_passa():
    r = validar.validar(normalizar.normalizar([partida_exemplo()]))
    for time in ("Flamengo", "Rival"):
        problemas = {k: v["detalhe"] for k, v in regras(r, time).items() if v["status"] != validar.OK}
        assert problemas == {}, (time, problemas)
    assert regras(r)["gols"]["detalhe"].endswith("gol(s) contra = placar")
    assert regras(r, "Rival")["minutos"]["detalhe"].startswith("soma 980, esperado ~980")
    c = r["completude"][0]
    assert all(c[k] for k in validar.CAMPOS_COMPLETUDE)


def test_detecta_erros():
    p = partida_exemplo()
    p["goals"]["home"] = 4                                                  # placar não bate
    p["players"][0]["players"][1]["statistics"][0]["games"]["substitute"] = True  # só 10 titulares
    p["players"][0]["players"][2]["statistics"][0]["games"]["minutes"] = 10       # minutos faltando
    r = regras(validar.validar(normalizar.normalizar([p])))
    assert r["gols"]["status"] == validar.ERRO
    assert r["titulares"]["status"] == validar.ERRO
    assert r["minutos"]["status"] == validar.ERRO


def test_completude_sem_xg_e_sem_stats():
    p = partida_exemplo()
    p["statistics"] = []
    for j in p["players"][0]["players"]:
        j["statistics"][0]["passes"]["total"] = None
    c = validar.validar(normalizar.normalizar([p]))["completude"][0]
    assert not c["xg"] and not c["estatisticas_time"] and not c["estatisticas_jogador"]
    assert c["minutagem"]


def test_ignora_jogo_nao_encerrado():
    p = copy.deepcopy(partida_exemplo())
    p["fixture"]["status"]["short"] = "NS"
    r = validar.validar(normalizar.normalizar([p]))
    assert r == {"checagens": [], "completude": []}


def test_armazenamento(tmp_path):
    t = normalizar.normalizar([partida_exemplo()])
    db = armazenar.salvar_sqlite(t, tmp_path / "x.db")
    import sqlite3
    with sqlite3.connect(db) as con:
        assert con.execute("select count(*) from jogadores_partida").fetchone()[0] == 24
    armazenar.salvar_csv(t, tmp_path / "csv")
    assert (tmp_path / "csv" / "partidas.csv").exists()
    print(validar.relatorio_markdown(validar.validar(t)))


def test_nome_time_minusculas_nas_particulas():
    from coleta.exportar import nome_time
    assert nome_time("Vasco DA Gama") == "Vasco da Gama"
    assert nome_time("Estudiantes de La Plata") == "Estudiantes de La Plata"
    assert nome_time("DE Graafschap") == "DE Graafschap"  # só entre palavras
    assert nome_time(None) is None
