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


def test_proximos_jogos_prioriza_o_mais_proximo_e_respeita_a_janela(tmp_path, monkeypatch):
    from datetime import datetime, timezone
    agora = datetime(2026, 10, 16, 12, tzinfo=timezone.utc)
    jogos = [_jogo(3, "2026-10-26T23:00:00.000Z"), _jogo(1, "2026-10-18T21:30:00.000Z"),
             _jogo(2, "2026-10-23T00:30:00.000Z"), _jogo(4, "2026-12-20T20:00:00.000Z"), _jogo(9, "2026-10-12T20:00:00.000Z", "Finished")]
    assert [j["id"] for j in hl.proximos_jogos(jogos, agora)] == [1, 2, 3]
    assert [j["id"] for j in hl.proximos_jogos(jogos[3:], agora)] == [4]  # o primeiro entra mesmo fora da janela
    _cenario(tmp_path, monkeypatch, jogos)
    tarefas = hl.tarefas_proximos(jogos, agora)
    assert tarefas[0] == ("proximo_1", "matches/1", {})  # mais próximo primeiro
    assert ("h2h_%d" % ADV, "head-2-head", {"teamIdOne": FLA, "teamIdTwo": ADV}) in tarefas


def test_linhas_proximos_monta_confrontos_e_forma(tmp_path, monkeypatch):
    from coleta.api import salvar_raw
    jogos = [_jogo(1, "2099-10-18T21:30:00.000Z")]
    _cenario(tmp_path, monkeypatch, jogos)
    fim = lambda pid, casa, fora, placar: {"id": pid, "date": "2026-04-19T22:30:00.000Z", "state": {"description": "Finished", "score": {"current": placar}},
                                           "homeTeam": {"id": casa, "name": "A"}, "awayTeam": {"id": fora, "name": "B"}, "league": {"name": "Serie A"}}
    salvar_raw(f"h2h_{ADV}", {"data": [fim(10, ADV, FLA, "2 - 1")], "_coletado_em": "2099-01-01T00:00:00+00:00"}, tmp_path)
    salvar_raw(f"forma_{ADV}", {"data": [fim(11, ADV, 77, "0 - 0")], "_coletado_em": "2099-01-01T00:00:00+00:00"}, tmp_path)
    t = hl.linhas_proximos(jogos)
    assert t["proximo"] == []  # sem detalhe salvo
    assert t["confrontos"][0]["resultado"] == "D" and t["confrontos"][0]["mando"] == "Fora"
    assert t["forma_adversario"][0]["resultado"] == "E" and t["forma_adversario"][0]["adversario_id"] == ADV


def test_planejar_renova_previsao_nas_24h_antes_do_jogo(tmp_path, monkeypatch):
    from datetime import datetime, timezone
    from coleta.api import salvar_raw
    jogos = [_jogo(1, "2026-10-18T21:30:00.000Z")]
    _cenario(tmp_path, monkeypatch, jogos, lista_coletada="2026-10-18T08:00:00+00:00")
    salvar_raw("proximo_1", {"data": {}, "_coletado_em": "2026-10-18T08:00:00+00:00"}, tmp_path)
    assert hl.planejar(datetime(2026, 10, 18, 12, tzinfo=timezone.utc))[0] is False   # previsão com 4 h
    coletar, motivo = hl.planejar(datetime(2026, 10, 18, 14, 30, tzinfo=timezone.utc))  # 6h30, jogo em 7 h
    assert coletar and "24 h" in motivo


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
    assert saida.read_text(encoding="utf-8") == "coletar=true\nmotivo=coleta forçada\n"


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


def test_chutes_bloqueados_entram_nas_finalizacoes_do_jogador():
    m = {"homeTeam": {"id": FLA, "shots": [{"outcome": "Blocked", "playerName": "Leo Pereira"},
                                            {"outcome": "Blocked", "playerName": "Leo Pereira"},
                                            {"outcome": "Saved", "playerName": "Leo Pereira"},
                                            {"outcome": "Blocked", "playerName": "Ninguém"}]},
         "awayTeam": {"id": ADV, "shots": []}}
    jogadores = [{"id": 1, "name": "L. Pereira", "fullName": "Leonardo Pereira"}, {"id": 2, "name": "Pedro", "fullName": "Pedro Guilherme"}]
    assert hl._bloqueadas_por_jogador(m, FLA, jogadores) == {1: 2}  # sem dono conhecido: não é atribuído


def test_titulares_a_mais_sem_minutos_voltam_para_o_banco():
    linhas = [{"jogador_id": k, "titular": True, "minutos": 90} for k in range(11)] + [{"jogador_id": 99, "titular": True, "minutos": 0}]
    hl._corrigir_titulares(linhas)
    assert sum(l["titular"] for l in linhas) == 11 and linhas[-1]["minutos"] is None
    normais = [{"jogador_id": 0, "titular": True, "minutos": 0}] + [{"jogador_id": k, "titular": True, "minutos": 90} for k in range(1, 11)]
    hl._corrigir_titulares(normais)
    assert normais[0]["titular"]  # com 11 titulares nada muda (expulso no início, por exemplo)


def test_titulares_a_mais_usa_substituicoes_e_minutos():
    # time alternativo: a fonte marca todos como titulares (caso real do Carioca de janeiro)
    linhas = [{"jogador_id": k, "titular": True, "minutos": 90} for k in range(9)]
    linhas += [{"jogador_id": 20, "titular": True, "minutos": 61},   # saiu (começou jogando)
               {"jogador_id": 21, "titular": True, "minutos": 82},
               {"jogador_id": 30, "titular": True, "minutos": 47},   # entrou numa substituição
               {"jogador_id": 31, "titular": True, "minutos": 17},   # entrou (sem lance de substituição)
               {"jogador_id": 32, "titular": True, "minutos": 0}]    # não jogou
    hl._corrigir_titulares(linhas, entraram={30}, sairam={20})
    titulares = {l["jogador_id"] for l in linhas if l["titular"]}
    assert titulares == set(range(9)) | {20, 21}


def test_placar_trocado_pela_fonte_e_corrigido_pelos_lances():
    gol = lambda tid, tipo="Goal", t="10'": {"type": tipo, "team": {"id": tid}, "time": t}
    m = {"homeTeam": {"id": ADV}, "awayTeam": {"id": FLA},
         "state": {"score": {"current": "3 - 0", "penalties": None}}, "events": [gol(FLA), gol(FLA), gol(FLA, "Penalty")]}
    assert hl.placar(m) == (0, 3)
    m["events"] = [gol(ADV), gol(ADV), gol(FLA, "Own Goal")]  # gol contra conta para quem se beneficiou
    assert hl.placar(m) == (3, 0)
    final = {"homeTeam": {"id": FLA}, "awayTeam": {"id": ADV}, "state": {"score": {"current": "0 - 0", "penalties": "5 - 4"}},
             "events": [gol(FLA, "Penalty", "120+1'"), gol(ADV, "Missed Penalty", "120+2'")]}
    assert hl.placar(final) == (0, 0)
    assert [e["tipo"] for e in hl.linhas_eventos({**final, "id": 1, "events": [{**e, "team": {"id": FLA, "name": "x"}} for e in final["events"]]}, FLA)] == ["Shootout", "Shootout"]

def test_historico_registra_jogos_novos_e_recoletados(tmp_path, monkeypatch):
    import json
    jogos = [_jogo(1, "2026-10-10T20:00:00.000Z", "Finished"), _jogo(2, "2026-10-12T20:00:00.000Z", "Finished")]
    _cenario(tmp_path, monkeypatch, jogos, partidas=[(1, "2026-10-11T00:00:00+00:00"), (2, "2026-10-13T00:00:00+00:00")])
    monkeypatch.setattr(config, "PASTA_TEMPORADA", tmp_path)
    monkeypatch.setenv("GITHUB_EVENT_NAME", "workflow_dispatch")
    monkeypatch.setenv("FLA_MOTIVO", "jogo contra Fluminense já terminou")
    antes = {"1": "2026-10-10T23:00:00+00:00"}  # 1 foi recoletado; 2 é novo
    item = hl.registrar_atualizacao(antes, None)
    assert [j["adversario"] for j in item["novos"]] == ["Fluminense"]
    assert len(item["recoletados"]) == 1 and item["pendentes"] == 0
    assert item["origem"] == "disparo externo / manual" and item["motivo"].startswith("jogo contra")
    salvo = json.loads((tmp_path / hl.ARQ_HISTORICO).read_text(encoding="utf-8"))
    assert salvo == [item]


def test_gols_e_assistencias_vem_dos_lances_quando_o_box_score_falha():
    m = {"state": {"score": {"penalties": None}}, "events": [
        {"type": "Goal", "team": {"id": FLA}, "playerId": 1, "assistingPlayerId": 2, "time": "10'"},
        {"type": "Penalty", "team": {"id": FLA}, "playerId": 1, "time": "50'"},
        {"type": "Goal", "team": {"id": ADV}, "playerId": 9, "time": "60'"}]}
    linhas = [{"jogador_id": 1, "gols": 0, "assistencias": 0}, {"jogador_id": 2, "gols": 0, "assistencias": 0}]
    hl._completar_gols_pelos_lances(m, FLA, linhas)
    assert [(l["gols"], l["assistencias"]) for l in linhas] == [(2, 0), (0, 1)]
    certo = [{"jogador_id": 1, "gols": 2, "assistencias": 0}, {"jogador_id": 2, "gols": 0, "assistencias": 1}]
    hl._completar_gols_pelos_lances(m, FLA, certo)  # box-score completo: nada muda
    assert [(l["gols"], l["assistencias"]) for l in certo] == [(2, 0), (0, 1)]


def test_nome_do_arbitro_sem_virgula():
    assert hl.nome_arbitro("Benitez, Juan Gabriel") == "Juan Gabriel Benitez"
    assert hl.nome_arbitro("Pereira Sampaio, Wilton") == "Wilton Pereira Sampaio"
    assert hl.nome_arbitro("Anderson Daronco") == "Anderson Daronco" and hl.nome_arbitro(None) is None
