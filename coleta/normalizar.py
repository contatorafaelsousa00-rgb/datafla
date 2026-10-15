"""Transforma as respostas brutas de /fixtures?ids= em tabelas planas.

Tabelas geradas:
- partidas: uma linha por jogo do Flamengo
- jogadores_partida: uma linha por jogador relacionado em cada jogo (os dois times)
- eventos: gols, cartões, substituições e VAR, com minuto
- estatisticas_time: formato longo (partida, time, estatística, valor)
"""

from __future__ import annotations

from . import config

# Nomes das estatísticas de time na API -> nome usado no projeto
ESTATISTICAS_TIME = {
    "Shots on Goal": "finalizacoes_alvo",
    "Shots off Goal": "finalizacoes_fora",
    "Total Shots": "finalizacoes",
    "Blocked Shots": "finalizacoes_bloqueadas",
    "Shots insidebox": "finalizacoes_dentro_area",
    "Shots outsidebox": "finalizacoes_fora_area",
    "Fouls": "faltas",
    "Corner Kicks": "escanteios",
    "Offsides": "impedimentos",
    "Ball Possession": "posse",
    "Yellow Cards": "amarelos",
    "Red Cards": "vermelhos",
    "Goalkeeper Saves": "defesas",
    "Total passes": "passes",
    "Passes accurate": "passes_certos",
    "Passes %": "passes_pct",
    "expected_goals": "xg",
    "goals_prevented": "gols_evitados",
}


def numero(valor):
    """Converte valores da API (int, '7.3', '55%', None) em número ou None."""
    if valor is None or valor == "":
        return None
    if isinstance(valor, (int, float)):
        return valor
    texto = str(valor).strip()
    pct = texto.endswith("%")
    texto = texto.rstrip("%")
    try:
        n = float(texto)
    except ValueError:
        return None
    if pct:
        return round(n / 100, 4)
    return int(n) if n.is_integer() else n


def duracao(partida: dict) -> int:
    return 120 if partida["fixture"]["status"]["short"] in {"AET", "PEN"} else 90


def _lado(partida: dict, team_id: int) -> tuple[str, str]:
    """Devolve ('home'|'away' do Flamengo, lado do adversário)."""
    if partida["teams"]["home"]["id"] == team_id:
        return "home", "away"
    if partida["teams"]["away"]["id"] == team_id:
        return "away", "home"
    raise ValueError(f"Partida {partida['fixture']['id']} não tem o time {team_id}")


def _resultado(pro, contra):
    if pro is None or contra is None:
        return None
    return "V" if pro > contra else "D" if pro < contra else "E"


def linha_partida(p: dict, team_id: int = config.TEAM_ID) -> dict:
    nos, eles = _lado(p, team_id)
    fx, score = p["fixture"], p.get("score", {})
    escalacao = next(
        (l for l in p.get("lineups", []) if l["team"]["id"] == team_id), {}
    )
    ht = score.get("halftime") or {}
    pen = score.get("penalty") or {}
    return {
        "id_partida": fx["id"],
        "data_utc": fx["date"],
        "status": fx["status"]["short"],
        "competicao_id": p["league"]["id"],
        "competicao": p["league"]["name"],
        "rodada": p["league"].get("round"),
        "mando": "Casa" if nos == "home" else "Fora",
        "adversario_id": p["teams"][eles]["id"],
        "adversario": p["teams"][eles]["name"],
        "gols_pro": p["goals"][nos],
        "gols_contra": p["goals"][eles],
        "gols_pro_1t": ht.get(nos),
        "gols_contra_1t": ht.get(eles),
        "resultado": _resultado(p["goals"][nos], p["goals"][eles]),
        "duracao": duracao(p),
        "penaltis_pro": pen.get(nos),
        "penaltis_contra": pen.get(eles),
        "estadio": (fx.get("venue") or {}).get("name"),
        "cidade": (fx.get("venue") or {}).get("city"),
        "arbitro": fx.get("referee"),
        "formacao": escalacao.get("formation"),
        "tecnico": (escalacao.get("coach") or {}).get("name"),
    }


def linhas_jogadores(p: dict, team_id: int = config.TEAM_ID) -> list[dict]:
    linhas = []
    for bloco in p.get("players", []):
        time_id = bloco["team"]["id"]
        for item in bloco.get("players", []):
            st = (item.get("statistics") or [{}])[0]
            g = st.get("games") or {}
            sh, gl = st.get("shots") or {}, st.get("goals") or {}
            pa, tk = st.get("passes") or {}, st.get("tackles") or {}
            du, dr = st.get("duels") or {}, st.get("dribbles") or {}
            fo, ca = st.get("fouls") or {}, st.get("cards") or {}
            pe = st.get("penalty") or {}
            linhas.append({
                "id_partida": p["fixture"]["id"],
                "time_id": time_id,
                "eh_flamengo": time_id == team_id,
                "jogador_id": item["player"]["id"],
                "jogador": item["player"]["name"],
                "numero": g.get("number"),
                "posicao": g.get("position"),
                "titular": g.get("substitute") is False,
                "minutos": numero(g.get("minutes")),
                "nota": numero(g.get("rating")),
                "capitao": bool(g.get("captain")),
                "gols": numero(gl.get("total")),
                "assistencias": numero(gl.get("assists")),
                "gols_sofridos": numero(gl.get("conceded")),
                "defesas": numero(gl.get("saves")),
                "finalizacoes": numero(sh.get("total")),
                "finalizacoes_alvo": numero(sh.get("on")),
                "passes": numero(pa.get("total")),
                "passes_chave": numero(pa.get("key")),
                # A API devolve aqui um valor sem unidade clara (contagem ou %).
                # Conferir na primeira coleta real antes de usar no painel.
                "passes_precisao_api": numero(pa.get("accuracy")),
                "desarmes": numero(tk.get("total")),
                "bloqueios": numero(tk.get("blocks")),
                "interceptacoes": numero(tk.get("interceptions")),
                "duelos": numero(du.get("total")),
                "duelos_ganhos": numero(du.get("won")),
                "dribles_tentados": numero(dr.get("attempts")),
                "dribles_certos": numero(dr.get("success")),
                "faltas_cometidas": numero(fo.get("committed")),
                "faltas_sofridas": numero(fo.get("drawn")),
                "amarelos": numero(ca.get("yellow")),
                "vermelhos": numero(ca.get("red")),
                "impedimentos": numero(st.get("offsides")),
                "penaltis_marcados": numero(pe.get("scored")),
                "penaltis_perdidos": numero(pe.get("missed")),
            })
    return linhas


def linhas_eventos(p: dict, team_id: int = config.TEAM_ID) -> list[dict]:
    linhas = []
    for ordem, ev in enumerate(p.get("events", [])):
        t = ev.get("time") or {}
        linhas.append({
            "id_partida": p["fixture"]["id"],
            "ordem": ordem,
            "minuto": t.get("elapsed"),
            "acrescimo": t.get("extra"),
            "time_id": ev["team"]["id"],
            "eh_flamengo": ev["team"]["id"] == team_id,
            "jogador_id": (ev.get("player") or {}).get("id"),
            "jogador": (ev.get("player") or {}).get("name"),
            "assist_id": (ev.get("assist") or {}).get("id"),
            "assist": (ev.get("assist") or {}).get("name"),
            "tipo": ev.get("type"),
            "detalhe": ev.get("detail"),
            "comentario": ev.get("comments"),
        })
    return linhas


def linhas_estatisticas(p: dict, team_id: int = config.TEAM_ID) -> list[dict]:
    linhas = []
    for bloco in p.get("statistics", []):
        for st in bloco.get("statistics", []):
            linhas.append({
                "id_partida": p["fixture"]["id"],
                "time_id": bloco["team"]["id"],
                "eh_flamengo": bloco["team"]["id"] == team_id,
                "estatistica": ESTATISTICAS_TIME.get(st["type"], st["type"]),
                "valor": numero(st.get("value")),
            })
    return linhas


def normalizar(partidas: list[dict], team_id: int = config.TEAM_ID) -> dict[str, list[dict]]:
    tabelas = {"partidas": [], "jogadores_partida": [], "eventos": [], "estatisticas_time": []}
    for p in partidas:
        tabelas["partidas"].append(linha_partida(p, team_id))
        tabelas["jogadores_partida"] += linhas_jogadores(p, team_id)
        tabelas["eventos"] += linhas_eventos(p, team_id)
        tabelas["estatisticas_time"] += linhas_estatisticas(p, team_id)
    return tabelas
