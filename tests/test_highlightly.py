"""Normalização das respostas da Highlightly (formato conferido com um jogo real de 2026)."""

from coleta import config, highlightly as hl, validar

FLA, ADV = 108861, 106308


def jogador(pid, nome, minutos, reserva=False, gols=0, xg=None, chutes=0):
    return {"id": pid, "name": nome, "position": "Forward", "isCaptain": False, "shirtNumber": pid % 100,
            "isSubstitute": reserva, "minutesPlayed": minutos, "matchRating": "7.10" if minutos else None,
            "offsides": 0, "fullName": nome,
            "statistics": {"goalsScored": gols, "assists": 0, "expectedGoals": xg, "expectedAssists": 0.1,
                           "shotsTotal": chutes, "shotsOnTarget": gols, "passesTotal": 20, "passesSuccessful": 15,
                           "passesAccuracy": "75.00 %", "cardsRed": 0, "cardsSecondYellow": 0, "cardsYellow": 0}}


def partida(placar="2 - 1", fla_em_casa=True, estado="Finished"):
    fla = {"id": FLA, "name": "Flamengo", "logo": None, "shots": [
        {"time": "90+2'", "outcome": "Goal", "goalTarget": "Low Left", "playerName": "Titular 1"}]}
    adv = {"id": ADV, "name": "Fluminense", "logo": "x.png", "shots": []}
    casa, fora = (fla, adv) if fla_em_casa else (adv, fla)
    match = {
        "id": 1, "date": "2026-10-11T20:30:00.000Z", "round": "Regular Season - 30",
        "league": {"id": 61205, "name": "Serie A", "season": 2026},
        "homeTeam": casa, "awayTeam": fora,
        "state": {"clock": 90, "score": {"current": placar, "penalties": None}, "description": estado},
        "venue": {"name": "Maracana Stadium", "city": "Rio de Janeiro", "capacity": "73139"},
        "referee": {"name": "Árbitro"}, "forecast": {"status": "rain", "temperature": "25.74°C"},
        "predictions": {"prematch": [{"probabilities": {"home": "60.00%", "draw": "25.00%", "away": "15.00%"}}]},
        "events": [
            {"team": {"id": FLA}, "time": "90+5", "type": "Goal", "player": "Titular 1", "playerId": 1,
             "assist": "Titular 2", "assistingPlayerId": 2, "substituted": None},
            {"team": {"id": FLA}, "time": "64", "type": "Substitution", "player": "Titular 3", "playerId": 3,
             "substituted": "Reserva 1", "assistingPlayerId": 12, "assist": None},
        ],
        "statistics": [{"team": {"id": FLA}, "statistics": [
            {"displayName": "Expected Goals", "value": 1.68}, {"displayName": "Possession", "value": 0.43},
            {"displayName": "Shots on target", "value": 6}, {"displayName": "Shots off target", "value": 7},
            {"displayName": "Blocked shots", "value": 4}, {"displayName": "Total passes", "value": 425},
            {"displayName": "Successful passes", "value": 378}]}],
    }
    titulares = [jogador(i, f"Titular {i}", 64 if i == 3 else 90, gols=(1 if i == 1 else 0), xg=0.5, chutes=1)
                 for i in range(1, 12)]
    box = [{"team": {"id": FLA}, "players": titulares + [jogador(12, "Reserva 1", 26, reserva=True),
                                                        jogador(13, "Reserva 2", 0, reserva=True)]}]
    return {"match": match, "boxscore": box, "_coletado_em": "2026-10-12T00:00:00+00:00"}


def test_partida_do_ponto_de_vista_do_flamengo():
    config.aplicar_fonte("highlightly")
    p = hl.normalizar([partida("1 - 2", fla_em_casa=False)])["partidas"][0]
    assert (p["mando"], p["gols_pro"], p["gols_contra"], p["resultado"]) == ("Fora", 2, 1, "V")
    assert p["prob_vitoria"] == 0.15 and p["prob_derrota"] == 0.6  # Flamengo é o visitante
    assert p["data_utc"] == "2026-10-11T20:30:00+00:00" and p["temperatura"] == 25.74


def test_jogadores_eventos_e_estatisticas():
    config.aplicar_fonte("highlightly")
    t = hl.normalizar([partida()])
    js = {j["jogador"]: j for j in t["jogadores_partida"]}
    assert js["Reserva 1"]["minutos"] == 26 and js["Reserva 1"]["titular"] is False
    assert js["Reserva 2"]["minutos"] is None  # no banco, não "jogou 0 minutos"
    assert js["Titular 1"]["xg"] == 0.5 and js["Titular 1"]["posicao"] == "F"

    gol, sub = t["eventos"]
    assert (gol["tipo"], gol["minuto"], gol["acrescimo"], gol["assist"]) == ("Goal", 90, 5, "Titular 2")
    assert (sub["tipo"], sub["jogador"], sub["assist"], sub["assist_id"]) == ("subst", "Titular 3", "Reserva 1", 12)

    st = {s["estatistica"]: s["valor"] for s in t["estatisticas_time"]}
    assert st["xg"] == 1.68 and st["posse"] == 0.43 and st["finalizacoes"] == 17
    assert st["passes_pct"] == round(378 / 425, 4)
    assert t["finalizacoes"][0]["minuto"] == 90 and t["finalizacoes"][0]["acrescimo"] == 2


def test_validador_aceita_a_fonte():
    config.aplicar_fonte("highlightly")
    r = validar.validar(hl.normalizar([partida()]))
    regras = {(c["regra"], c["status"]) for c in r["checagens"]}
    assert ("titulares", "ok") in regras and ("substituicoes", "ok") in regras
    assert r["completude"][0]["xg"] is True


def test_jogo_nao_encerrado_sem_resultado():
    config.aplicar_fonte("highlightly")
    p = hl.normalizar([partida(None, estado="Not started")])["partidas"][0]
    assert p["status"] == "NS" and p["resultado"] is None and p["gols_pro"] is None


def test_rodada_em_portugues():
    assert hl.rodada("Regular Season - 30") == "Rodada 30"
    assert hl.rodada("Group Stage - 2") == "Fase de grupos · 2"
    assert hl.rodada("Quarter-finals") == "Quartas de final"
    assert hl.rodada("Algo novo") == "Algo novo"


def test_proximo_jogo_ignora_encerrados_e_adiados():
    from datetime import datetime, timezone
    agora = datetime(2026, 10, 15, 12, tzinfo=timezone.utc)
    jogo = lambda i, data, estado: {"id": i, "date": data, "state": {"description": estado}}
    jogos = [jogo(1, "2026-10-12T20:00:00.000Z", "Finished"), jogo(2, "2026-10-15T10:00:00.000Z", "First half"),
             jogo(3, "2026-10-14T20:00:00.000Z", "Postponed"), jogo(4, "2026-10-18T21:30:00.000Z", "Not started")]
    assert hl.proximo_jogo(jogos, agora)["id"] == 2  # começou há 2 h: ainda é o "próximo" (em andamento)
    assert hl.proximo_jogo(jogos[2:], agora)["id"] == 4
    assert hl.proximo_jogo(jogos[:1], agora) is None


def test_linhas_proximo_descarta_detalhe_velho():
    config.aplicar_fonte("highlightly")
    p = partida(None, estado="Not started")
    p["match"]["date"] = "2099-01-01T20:00:00.000Z"
    lista = [p["match"]]
    linha = hl.linhas_proximo(p, lista)[0]
    assert linha["prob_vitoria"] == 0.6 and linha["estadio"] == "Maracana Stadium" and linha["flamengo_logo"] is None
    outro = {**p["match"], "id": 99}
    assert hl.linhas_proximo(p, [outro]) == []  # o salvo não é mais o próximo jogo


def _cenario(tmp_path, monkeypatch, jogos, partidas=(), lista_coletada="2026-10-15T12:00:00+00:00"):
    """Monta lista e partidas salvas numa pasta temporária, como o workflow encontraria."""
    from coleta.api import salvar_raw
    config.aplicar_fonte("highlightly")
    monkeypatch.setattr(config, "RAW_DIR", tmp_path)
    salvar_raw(hl.ARQ_JOGOS, {"data": jogos, "_coletado_em": lista_coletada}, tmp_path)
    for pid, quando in partidas:
        salvar_raw(f"partida_{pid}", {"match": {"id": pid}, "_coletado_em": quando}, tmp_path)


def _jogo(pid, data, estado="Not started"):
    return {"id": pid, "date": data, "state": {"description": estado},
            "homeTeam": {"id": FLA, "name": "Flamengo"}, "awayTeam": {"id": ADV, "name": "Fluminense"}}


def test_planejar_pula_sem_novidade_e_coleta_quando_jogo_termina(tmp_path, monkeypatch):
    from datetime import datetime, timezone
    jogos = [_jogo(1, "2026-10-16T00:30:00.000Z")]  # 21:30 de Brasília
    _cenario(tmp_path, monkeypatch, jogos, lista_coletada="2026-10-15T20:00:00+00:00")  # lista ainda nova
    durante = datetime(2026, 10, 16, 1, 30, tzinfo=timezone.utc)  # 1 h de jogo
    assert hl.planejar(durante)[0] is False
    depois = datetime(2026, 10, 16, 2, 45, tzinfo=timezone.utc)   # 2h15 depois do início
    coletar, motivo = hl.planejar(depois)
    assert coletar and "Fluminense" in motivo


def test_planejar_recoleta_so_na_atualizacao_diaria(tmp_path, monkeypatch):
    from datetime import datetime, timezone
    jogos = [_jogo(1, "2026-10-16T00:30:00.000Z", "Finished")]
    _cenario(tmp_path, monkeypatch, jogos, partidas=[(1, "2026-10-16T03:00:00+00:00")],
             lista_coletada="2026-10-16T03:00:00+00:00")
    assert hl.planejar(datetime(2026, 10, 16, 15, 0, tzinfo=timezone.utc))[0] is False  # 12 h depois: espera o dia
    assert hl.planejar(datetime(2026, 10, 17, 3, 5, tzinfo=timezone.utc))[0] is True    # 24 h: atualização diária
    assert hl._precisa_coletar(jogos[0], datetime(2026, 10, 17, 3, 5, tzinfo=timezone.utc))  # e recoleta o jogo
    # coleta feita 50 h depois do jogo: fora da janela, não recoleta mais
    _cenario(tmp_path, monkeypatch, jogos, partidas=[(1, "2026-10-18T03:00:00+00:00")],
             lista_coletada="2026-10-18T03:00:00+00:00")
    assert not hl._precisa_coletar(jogos[0], datetime(2026, 10, 19, 3, 5, tzinfo=timezone.utc))


def test_planejar_renova_lista_velha_ou_ausente(tmp_path, monkeypatch):
    from datetime import datetime, timezone
    _cenario(tmp_path, monkeypatch, [], lista_coletada="2026-10-15T00:00:00+00:00")
    assert hl.planejar(datetime(2026, 10, 15, 23, 0, tzinfo=timezone.utc))[0] is False
    assert hl.planejar(datetime(2026, 10, 16, 0, 5, tzinfo=timezone.utc))[0] is True
    monkeypatch.setattr(config, "RAW_DIR", tmp_path / "vazio")
    assert hl.planejar(datetime(2026, 10, 15, 13, 0, tzinfo=timezone.utc))[0] is True


def test_planejar_escreve_saida_do_github(tmp_path, monkeypatch):
    saida = tmp_path / "saida.txt"
    monkeypatch.setenv("GITHUB_OUTPUT", str(saida))
    assert hl.cmd_planejar(forcar=True) == 0
    assert saida.read_text(encoding="utf-8") == "coletar=true\n"


def test_planejar_e_situacao_escrevem_resumo_do_github(tmp_path, monkeypatch):
    from datetime import datetime, timezone
    jogos = [_jogo(1, "2026-10-10T20:00:00.000Z", "Finished"), _jogo(2, "2026-10-12T20:00:00.000Z", "Finished")]
    _cenario(tmp_path, monkeypatch, jogos, partidas=[(1, "2026-10-11T00:00:00+00:00")])
    assert hl.situacao_coleta() == {"encerrados": 2, "baixados": 1, "pendentes": 1}
    resumo = tmp_path / "resumo.md"
    monkeypatch.setenv("GITHUB_STEP_SUMMARY", str(resumo))
    monkeypatch.setattr(hl, "planejar", lambda: (False, "nada a coletar agora"))
    hl.cmd_planejar()
    assert resumo.read_text(encoding="utf-8") == "**Pular:** nada a coletar agora.\n"
