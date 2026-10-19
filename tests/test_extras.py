"""Escalações, classificação, carreira e jogos do campeonato (coleta/extras.py)."""

from coleta import config, extras
from coleta.api import salvar_raw

FLA, ADV = 108861, 999


def _ambiente(tmp_path, monkeypatch):
    config.aplicar_fonte("highlightly")
    monkeypatch.setattr(config, "RAW_DIR", tmp_path)


def _jogo(pid, estado, liga=61205, nome="Serie A"):
    return {"id": pid, "date": "2026-10-10T20:00:00.000Z", "state": {"description": estado, "score": {"current": "2 - 1"}},
            "homeTeam": {"id": FLA, "name": "Flamengo"}, "awayTeam": {"id": ADV, "name": "Rival"},
            "league": {"id": liga, "name": nome, "season": 2026}, "round": "Regular Season - 30"}


def test_tarefas_priorizam_escalacoes_recentes_e_pulam_amistoso(tmp_path, monkeypatch):
    _ambiente(tmp_path, monkeypatch)
    jogos = [_jogo(1, "Finished"), _jogo(2, "Finished", 9, "Friendlies Clubs"), _jogo(3, "Not started")]
    jogos[1]["date"] = "2026-07-01T20:00:00.000Z"
    salvar_raw("escalacao_1", {"data": {}, "_coletado_em": "2026-10-11T00:00:00+00:00"}, tmp_path)
    nomes = [t[0] for t in extras.tarefas(jogos)]
    assert "escalacao_1" not in nomes and "escalacao_2" in nomes      # já baixada não volta
    assert "tabela_61205" in nomes and "tabela_9" not in nomes       # amistoso não tem tabela
    assert "liga_61205" in nomes                                     # campeonato de pontos corridos


def test_escalacoes_por_linha_e_formacoes(tmp_path, monkeypatch):
    _ambiente(tmp_path, monkeypatch)
    time = lambda tid, f: {"id": tid, "formation": f, "initialLineup": [[{"id": tid * 10, "name": "Goleiro", "number": 1, "position": "Goalkeeper"}],
                                                                      [{"id": tid * 10 + 1, "name": "Zagueiro", "number": 4, "position": "Defender"}]],
                           "substitutes": [{"id": tid * 10 + 2, "name": "Reserva", "number": 20, "position": "Forward"}]}
    salvar_raw("escalacao_7", {"data": {"homeTeam": time(FLA, "4-3-3"), "awayTeam": time(ADV, "5-4-1")}, "_coletado_em": "x"}, tmp_path)
    linhas, formacoes = extras.linhas_escalacoes([7, 8])
    assert formacoes == {7: ("4-3-3", "5-4-1")}
    fla = [l for l in linhas if l["eh_flamengo"]]
    assert [(l["linha"], l["titular"], l["posicao"]) for l in fla] == [(0, True, "G"), (1, True, "D"), (None, False, "F")]


def test_liga_e_classificacao(tmp_path, monkeypatch):
    _ambiente(tmp_path, monkeypatch)
    salvar_raw("liga_61205", {"data": [_jogo(1, "Finished"), _jogo(2, "Not started")], "_coletado_em": "x"}, tmp_path)
    liga = extras.linhas_liga([_jogo(1, "Finished")])
    assert [(l["gols_casa"], l["gols_fora"], l["rodada"]) for l in sorted(liga, key=lambda l: l["id_partida"])] == [(2, 1, "Rodada 30"), (None, None, "Rodada 30")]
    salvar_raw("tabela_61205", {"data": {"groups": [{"name": "Serie A", "standings": [
        {"position": 1, "points": 64, "team": {"id": FLA, "name": "Flamengo"}, "total": {"games": 30, "wins": 19, "draws": 7, "loses": 4, "scoredGoals": 58, "receivedGoals": 25}}]}]},
        "_coletado_em": "x"}, tmp_path)
    c = extras.linhas_classificacao([_jogo(1, "Finished")])[0]
    assert (c["posicao"], c["pontos"], c["eh_flamengo"], c["gols_pro"]) == (1, 64, True, 58)


def test_perfil_do_jogador_vira_ficha(tmp_path, monkeypatch):
    _ambiente(tmp_path, monkeypatch)
    salvar_raw("perfil_5", {"data": [{"id": 5, "name": "Pedro", "profile": {
        "club": {"current": "CR Flamengo", "joinedAt": "01/01/2021", "contractExpiry": "31/12/2027"},
        "foot": "right", "height": "1,85 m", "position": {"main": "Centre-Forward", "secondary": "Left Midfield, Centre-Back"},
        "birthDate": "20/06/1997", "citizenship": "Brazil"},
        "marketValue": [{"value": 17000000, "recordedDate": "12/03/2026"}, {"value": 20000000, "recordedDate": "26/05/2026"}],
        "injuries": [{"reason": "Fratura", "fromDate": "01.01.2000", "toDate": "01.01.2099"}]}], "_coletado_em": "x"}, tmp_path)
    f = extras.linhas_perfis()[0]
    assert (f["nascimento"], f["contrato_ate"], f["altura"], f["pe"], f["nacionalidade"]) == ("1997-06-20", "2027-12-31", 1.85, "Direito", "Brasil")
    assert (f["posicao_detalhada"], f["grupo"], f["posicao_secundaria"]) == ("Centroavante", "Atacantes", "Meia-esquerda, Zagueiro")
    assert (f["valor_mercado"], f["valor_anterior"]) == (20000000, 17000000)  # o mais recente primeiro
    assert f["lesao_atual"] == "Fratura"


def test_correcao_manual_de_wo(tmp_path, monkeypatch):
    from coleta import correcoes
    tabelas = {"calendario": [{"id_partida": 5, "status": "ABD", "gols_pro": 0, "gols_contra": 0}], "partidas": []}
    assert correcoes.aplicar(tabelas, {5: {"status": "WO", "gols_pro": 3, "gols_contra": 0, "nota": "W.O."}}) == 1
    assert tabelas["calendario"][0] == {"id_partida": 5, "status": "WO", "gols_pro": 3, "gols_contra": 0, "nota": "W.O."}


# ---------- rodada do Brasileirão (bug de 18/10/2026: tabela parada sem a rodada) ----------
from datetime import datetime, timedelta, timezone


def _iso(dt):
    return dt.isoformat()


def _rodada(tmp_path, agora, coletado_ha_h):
    """Liga baixada há `coletado_ha_h` horas; um jogo de outros times terminou depois disso."""
    jogo = _jogo(50, "Not started")
    jogo["homeTeam"], jogo["awayTeam"] = {"id": 1, "name": "Bahia"}, {"id": 2, "name": "Santos"}
    jogo["date"] = _iso(agora - timedelta(hours=4))
    antigo = _jogo(51, "Not started")  # adiado que a fonte deixou como "Not started": não deve contar
    antigo["date"] = _iso(agora - timedelta(days=20))
    salvar_raw("liga_61205", {"data": [jogo, antigo], "_coletado_em": _iso(agora - timedelta(hours=coletado_ha_h))}, tmp_path)


def test_rodada_terminada_poe_a_liga_na_frente(tmp_path, monkeypatch):
    _ambiente(tmp_path, monkeypatch)
    agora = datetime.now(timezone.utc)
    _rodada(tmp_path, agora, coletado_ha_h=5)
    assert extras.jogos_sem_resultado("liga_61205") == 1
    assert extras.tarefas([_jogo(1, "Finished")])[0][0] == "liga_61205"   # antes das escalações
    _rodada(tmp_path, agora, coletado_ha_h=1)                                # renovada há pouco: espera 3 h
    assert "liga_61205" not in [t[0] for t in extras.tarefas([_jogo(1, "Finished")])]


def test_resultado_do_flamengo_entra_na_liga_antes_da_renovacao(tmp_path, monkeypatch):
    _ambiente(tmp_path, monkeypatch)
    salvar_raw("liga_61205", {"data": [_jogo(1, "Not started")], "_coletado_em": "2026-10-10T19:00:00+00:00"}, tmp_path)
    liga = extras.linhas_liga([_jogo(1, "Finished")])
    assert (liga[0]["gols_casa"], liga[0]["gols_fora"]) == (2, 1)


class _APIContada:
    def __init__(self, restantes):
        self.restantes_hoje, self.chamadas = restantes, []

    def get(self, caminho, **params):
        self.chamadas.append(caminho)
        self.restantes_hoje -= 1
        return {"data": [], "pagination": {"totalCount": 0}}


def test_dia_de_jogo_guarda_cota_mas_renova_a_rodada(tmp_path, monkeypatch):
    _ambiente(tmp_path, monkeypatch)
    agora = datetime.now(timezone.utc)
    _rodada(tmp_path, agora, coletado_ha_h=5)
    proximo = _jogo(9, "Not started")
    proximo["date"] = _iso(agora + timedelta(hours=10))                   # Flamengo joga hoje
    salvar_raw("jogos", {"data": [_jogo(1, "Finished"), proximo], "_coletado_em": _iso(agora)}, tmp_path)
    monkeypatch.setattr(extras, "ARQ_JOGOS", "jogos")
    api = _APIContada(restantes=20)                                        # abaixo da folga de dia de jogo
    extras.cmd_extras(api)
    assert api.chamadas == ["matches"]                                     # só a rodada; escalação/tabelas ficam


def test_planejar_coleta_quando_a_rodada_termina(tmp_path, monkeypatch):
    from coleta import highlightly
    _ambiente(tmp_path, monkeypatch)
    agora = datetime.now(timezone.utc)
    salvar_raw(highlightly.ARQ_JOGOS, {"data": [_jogo(1, "Finished")], "_coletado_em": _iso(agora - timedelta(hours=2))}, tmp_path)
    salvar_raw("partida_1", {"_coletado_em": _iso(agora)}, tmp_path)
    _rodada(tmp_path, agora, coletado_ha_h=5)
    coletar, motivo = highlightly.planejar(agora)
    assert coletar and "Brasileirão" in motivo
