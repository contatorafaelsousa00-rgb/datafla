"""Fonte Highlightly (soccer.highlightly.net): cobre a temporada atual no plano grátis.

Custo por jogo: 2 requisições — /matches/{id} (placar, eventos, estatísticas de time,
finalizações, previsões) e /box-score/{id} (todos os relacionados com minutos, nota, xG e xA).
A escalação (/lineups) só acrescentaria a formação e não é baixada.
Não há busca em lote: o que já foi baixado fica em cache e não é pedido de novo,
e a coleta para sozinha antes de esgotar a cota do dia (100 no plano grátis).

As respostas são guardadas como vieram, em data/<ano>/raw-highlightly/partida_<id>.json
({"match": ..., "boxscore": ..., "_coletado_em": ...}); `normalizar` gera as mesmas tabelas
da API-Football (para o validador) com colunas a mais.\n"""

from __future__ import annotations

import os
import re
import time
from datetime import datetime, timedelta, timezone

import requests

from . import config
from .api import ErroAPI, ler_raw, salvar_raw

BASE_URL = "https://soccer.highlightly.net"
KEY_ENV = "HIGHLIGHTLY_KEY"

STATUS = {
    "Finished": "FT",
    "Finished after extra time": "AET",
    "Finished after penalties": "PEN",
    "Not started": "NS",
    "Abandoned": "ABD",
    "Postponed": "PST",
    "Cancelled": "CANC",
}

# Estatística de time na Highlightly -> nome usado no projeto (mesmos nomes da API-Football
# onde existe equivalente, para o validador e o painel tratarem as duas fontes igual).
ESTATISTICAS_TIME = {
    "Expected Goals": "xg",
    "Expected Assists": "xa",
    "Big Chances Created": "grandes_chances",
    "Shots on target": "finalizacoes_alvo",
    "Shots off target": "finalizacoes_fora",
    "Blocked shots": "finalizacoes_bloqueadas",
    "Shots within penalty area": "finalizacoes_dentro_area",
    "Shots outside penalty area": "finalizacoes_fora_area",
    "Shots accuracy": "finalizacoes_precisao",
    "Possession": "posse",
    "Total passes": "passes",
    "Successful passes": "passes_certos",
    "Failed passes": "passes_errados",
    "Key Passes": "passes_chave",
    "Passes Into Final Third": "passes_ultimo_terco",
    "Passes Own Half": "passes_campo_proprio",
    "Passes Opposition Half": "passes_campo_adversario",
    "Backward Passes": "passes_para_tras",
    "Long Passes": "lancamentos",
    "Successful Long Passes": "lancamentos_certos",
    "Crosses": "cruzamentos",
    "Successful Crosses": "cruzamentos_certos",
    "Tackles": "desarmes",
    "Successful Tackles": "desarmes_certos",
    "Interceptions": "interceptacoes",
    "Clearances": "cortes",
    "Aerial Duels": "duelos_aereos",
    "Successful Aerial Duels": "duelos_aereos_ganhos",
    "Dribbles": "dribles",
    "Successful Dribbles": "dribles_certos",
    "Fouls": "faltas",
    "Free Kicks": "tiros_livres",
    "Corners": "escanteios",
    "Offsides": "impedimentos",
    "Throw-Ins": "laterais",
    "Goal Kicks": "tiros_de_meta",
    "Goalkeeper saves": "defesas",
    "Yellow cards": "amarelos",
    "Red cards": "vermelhos",
}

POSICOES = {"Goalkeeper": "G", "Defender": "D", "Midfielder": "M", "Forward": "F", "Attacker": "F"}


def api_key() -> str:
    key = os.environ.get(KEY_ENV)
    if not key or key == "cole_sua_chave_aqui":
        raise RuntimeError(
            f"Chave da Highlightly não encontrada. Coloque no .env a linha\n  {KEY_ENV}=sua_chave"
        )
    return key


class ClienteHighlightly:
    def __init__(self, key: str | None = None, sessao: requests.Session | None = None):
        self.sessao = sessao or requests.Session()
        self.sessao.headers["x-rapidapi-key"] = key or api_key()
        self.restantes_hoje: int | None = None
        self.chamadas = 0

    def get(self, caminho: str, **params):
        url = f"{BASE_URL}/{caminho.lstrip('/')}"
        for tentativa in range(4):
            resp = self.sessao.get(url, params=params, timeout=30)
            if resp.status_code == 429 or resp.status_code >= 500:
                time.sleep(2 ** (tentativa + 1))
                continue
            break
        self.chamadas += 1
        restantes = resp.headers.get("x-ratelimit-requests-remaining")
        if restantes is not None:
            self.restantes_hoje = int(restantes)
        if resp.status_code >= 400:
            try:
                msg = resp.json().get("message")
            except ValueError:
                msg = resp.text[:200]
            raise ErroAPI(f"{caminho} {params}: HTTP {resp.status_code} {msg}")
        # 100 por minuto no plano grátis; uma pausa curta basta.
        time.sleep(float(os.environ.get("FLA_HL_PAUSA_SEG", "0.7")))
        return resp.json()


# ---------- coleta ----------

ARQ_JOGOS = "jogos"


def _reserva() -> int:
    """Requisições deixadas sem uso no fim da coleta, para consultas manuais."""
    return int(os.environ.get("FLA_HL_RESERVA", "4"))


def cmd_status(api: ClienteHighlightly):
    time_ = api.get(f"teams/{config.TEAM_ID}")
    nome = (time_[0] if isinstance(time_, list) and time_ else time_).get("name") if time_ else None
    print(f"Fonte: Highlightly  |  requisições restantes hoje: {api.restantes_hoje}")
    print(f"Time {config.TEAM_ID}: {nome}")
    if not nome or "flamengo" not in nome.lower():
        print("ATENÇÃO: o ID não corresponde ao Flamengo. Ajuste FLA_HL_TEAM_ID.")
        return 1
    return 0


def cmd_jogos(api: ClienteHighlightly):
    jogos = {}
    for campo in ("homeTeamId", "awayTeamId"):
        corpo = api.get("matches", **{campo: config.TEAM_ID, "season": config.SEASON, "limit": 100})
        for j in corpo.get("data", []):
            jogos[j["id"]] = j
        total = corpo.get("pagination", {}).get("totalCount", 0)
        if total > 100:
            print(f"ATENÇÃO: {total} jogos em {campo}; só os 100 primeiros foram lidos.")
    lista = sorted(jogos.values(), key=lambda j: j["date"])
    salvar_raw(ARQ_JOGOS, {"data": lista, "_coletado_em": datetime.now(timezone.utc).isoformat()})
    encerrados = sum(_status(j) in config.STATUS_ENCERRADO for j in lista)
    print(f"{len(lista)} jogos na temporada, {encerrados} encerrados.")
    return 0


def _status(jogo: dict) -> str:
    desc = (jogo.get("state") or {}).get("description") or ""
    return STATUS.get(desc, desc)


def _data(jogo: dict) -> datetime:
    return datetime.fromisoformat(jogo["date"].replace("Z", "+00:00"))


HORAS_ENTRE_RECOLETAS = 12    # recoleta (dentro de 48 h) só na atualização diária e com 12 h+ desde a última
DURACAO_ESPERADA = timedelta(hours=2, minutes=10)  # início → apito final (com acréscimos e intervalo)
HORAS_LISTA = 24              # atualização diária: lista da temporada, próximo jogo e recoletas


def _precisa_coletar(jogo: dict, agora: datetime | None = None) -> bool:
    salvo = ler_raw(f"partida_{jogo['id']}")
    if salvo is None:
        return True
    agora = agora or datetime.now(timezone.utc)
    coletado = datetime.fromisoformat(salvo["_coletado_em"])
    return (coletado - _data(jogo) < timedelta(hours=config.JANELA_RECOLETA_HORAS)
            and agora - coletado >= timedelta(hours=HORAS_ENTRE_RECOLETAS))


def planejar(agora: datetime | None = None) -> tuple[bool, str]:
    """Decide, sem chamar a API, se vale coletar agora (o workflow é disparado a cada 30 min).

    Coleta só em dois casos: um jogo já deveria ter terminado (início + 2h10) e ainda não foi baixado;
    ou a última coleta tem 24 h (atualização diária, que também recoleta os jogos das últimas 48 h).
    """
    agora = agora or datetime.now(timezone.utc)
    lista = ler_raw(ARQ_JOGOS)
    if lista is None or "_coletado_em" not in lista:
        return True, "não há lista de jogos salva (ou é de uma versão antiga)"
    idade = agora - datetime.fromisoformat(lista["_coletado_em"])
    for jogo in lista["data"]:
        if _status(jogo) in {"ABD", "PST", "CANC"}:
            continue
        inicio = _data(jogo)
        if not (agora - timedelta(hours=config.JANELA_RECOLETA_HORAS) <= inicio <= agora - DURACAO_ESPERADA):
            continue
        if ler_raw(f"partida_{jogo['id']}") is None:
            rival = jogo["awayTeam"]["name"] if jogo["homeTeam"]["id"] == config.TEAM_ID else jogo["homeTeam"]["name"]
            return True, f"jogo contra {rival} já terminou e ainda não foi baixado"
    if idade >= timedelta(hours=HORAS_LISTA):
        return True, f"atualização diária (última coleta há {idade.total_seconds() / 3600:.0f} h)"
    return False, "nada a coletar agora"


def resumo_github(texto: str) -> None:
    """Escreve no resumo da execução do GitHub Actions (aparece na página da execução, sem abrir o log)."""
    caminho = os.environ.get("GITHUB_STEP_SUMMARY")
    if caminho:
        with open(caminho, "a", encoding="utf-8") as f:
            f.write(texto.rstrip() + "\n")


def situacao_coleta() -> dict:
    """Jogos encerrados no calendário × jogos com detalhes baixados (sem usar a API)."""
    lista = ler_raw(ARQ_JOGOS)
    encerrados = [j for j in (lista or {}).get("data", []) if _status(j) in config.STATUS_ENCERRADO]
    baixados = sum(ler_raw(f"partida_{j['id']}") is not None for j in encerrados)
    return {"encerrados": len(encerrados), "baixados": baixados, "pendentes": len(encerrados) - baixados}


def cmd_planejar(forcar: bool = False) -> int:
    coletar, motivo = (True, "coleta forçada") if forcar else planejar()
    print(f"{'Coletar' if coletar else 'Pular'}: {motivo}.")
    resumo_github(f"**{'Coletar' if coletar else 'Pular'}:** {motivo}.\n")
    saida = os.environ.get("GITHUB_OUTPUT")
    if saida:  # no GitHub Actions, os próximos passos leem steps.<id>.outputs.coletar
        with open(saida, "a", encoding="utf-8") as f:
            f.write(f"coletar={'true' if coletar else 'false'}\n")
    return 0


def cmd_detalhes(api: ClienteHighlightly):
    from . import alteracoes

    lista = ler_raw(ARQ_JOGOS)
    if lista is None:
        print("Rode primeiro: python -m coleta.coletar jogos")
        return 1
    # Mais recentes primeiro: com cota curta, o que acabou de acontecer chega antes.
    pendentes = sorted(
        (j for j in lista["data"] if _status(j) in config.STATUS_ENCERRADO and _precisa_coletar(j)),
        key=lambda j: j["date"], reverse=True,
    )
    print(f"{len(pendentes)} jogos para baixar ({2 * len(pendentes)} requisições).")
    feitos = 0
    for jogo in pendentes:
        if api.restantes_hoje is not None and api.restantes_hoje - 2 < _reserva():
            print(f"Cota do dia no fim: {len(pendentes) - feitos} jogos ficam para a próxima coleta.")
            break
        mid = jogo["id"]
        partida = api.get(f"matches/{mid}")
        partida = partida[0] if isinstance(partida, list) else partida
        nova = {"match": partida, "boxscore": api.get(f"box-score/{mid}"),
                "_coletado_em": datetime.now(timezone.utc).isoformat()}
        anterior = ler_raw(f"partida_{mid}")
        if anterior is not None:
            alteracoes.registrar(alteracoes.comparar(anterior, nova, normalizar, _data_jogo_raw))
        salvar_raw(f"partida_{mid}", nova)
        feitos += 1
    print(f"{feitos} jogos baixados.")
    return 0


ARQ_PROXIMO = "proximo"
HORAS_PROXIMO = 6  # o detalhe do próximo jogo (previsão, árbitro, clima) é renovado a cada 6 h


def proximo_jogo(jogos: list[dict], agora: datetime | None = None) -> dict | None:
    """Primeiro jogo ainda não encerrado; vale até 3 h depois do início (jogo em andamento)."""
    agora = agora or datetime.now(timezone.utc)
    futuros = [j for j in jogos if _status(j) not in config.STATUS_ENCERRADO | {"ABD", "PST", "CANC"}
               and _data(j) > agora - timedelta(hours=3)]
    return min(futuros, key=lambda j: j["date"], default=None)


def cmd_proximo(api: ClienteHighlightly):
    """Baixa o detalhe do próximo jogo (1 requisição): estádio, árbitro, clima e previsão pré-jogo."""
    lista = ler_raw(ARQ_JOGOS)
    jogo = proximo_jogo(lista["data"]) if lista else None
    if jogo is None:
        print("Próximo jogo: nenhum no calendário.")
        return 0
    salvo = ler_raw(ARQ_PROXIMO)
    if salvo and salvo["match"]["id"] == jogo["id"] and \
            datetime.now(timezone.utc) - datetime.fromisoformat(salvo["_coletado_em"]) < timedelta(hours=HORAS_PROXIMO):
        print("Próximo jogo: já atualizado há menos de 6 h.")
        return 0
    if api.restantes_hoje is not None and api.restantes_hoje - 1 < _reserva():
        print("Próximo jogo: sem cota hoje; fica para a próxima coleta.")
        return 0
    m = api.get(f"matches/{jogo['id']}")
    m = m[0] if isinstance(m, list) else m
    salvar_raw(ARQ_PROXIMO, {"match": m, "_coletado_em": datetime.now(timezone.utc).isoformat()})
    print(f"Próximo jogo: {m['homeTeam']['name']} x {m['awayTeam']['name']} ({m['date'][:16]}).")
    return 0


def linhas_proximo(raw: dict | None, jogos: list[dict], team_id: int | None = None) -> list[dict]:
    """Detalhe do próximo jogo, se ainda for o próximo (senão o painel usa o calendário)."""
    team_id = team_id or config.TEAM_ID
    atual = proximo_jogo(jogos)
    if not raw or not atual or raw["match"]["id"] != atual["id"]:
        return []
    m = {**atual, **raw["match"]}  # data e status mais recentes vêm da lista
    linha = linha_partida(m, team_id)
    return [{**linha, "coletado_em": raw["_coletado_em"]}]


def _data_jogo_raw(partida: dict) -> tuple[int, str]:
    return partida["match"]["id"], partida["match"]["date"].replace("Z", "+00:00")


# ---------- normalização ----------

def numero(valor):
    """'73.91 %' -> 0.7391; '6.93' -> 6.93; None -> None."""
    if valor is None or valor == "":
        return None
    if isinstance(valor, (int, float)):
        return valor
    texto = str(valor).strip()
    pct = texto.endswith("%")
    try:
        n = float(texto.rstrip("%").strip())
    except ValueError:
        return None
    if pct:
        return round(n / 100, 4)
    return int(n) if n.is_integer() else n


def _placar(texto):
    """'2 - 1' -> (2, 1)."""
    if not texto:
        return None, None
    m = re.match(r"\s*(\d+)\s*-\s*(\d+)", texto)
    return (int(m.group(1)), int(m.group(2))) if m else (None, None)


def _minuto(texto):
    """'90+5' -> (90, 5); "17'" -> (17, None)."""
    m = re.match(r"\s*(\d+)(?:\s*\+\s*(\d+))?", str(texto or ""))
    if not m:
        return None, None
    return int(m.group(1)), (int(m.group(2)) if m.group(2) else None)


FASES = {"Final": "Final", "Semi-finals": "Semifinal", "Quarter-finals": "Quartas de final",
         "Round of 16": "Oitavas de final", "Round of 32": "Terceira fase", "Club Friendlies": "Amistoso"}


def rodada(texto):
    """'Regular Season - 30' -> 'Rodada 30'; 'Group Stage - 2' -> 'Fase de grupos · 2'."""
    if not texto:
        return texto
    m = re.match(r"Regular Season - (\d+)", texto)
    if m:
        return f"Rodada {m.group(1)}"
    m = re.match(r"Group Stage - (\d+)", texto)
    if m:
        return f"Fase de grupos · {m.group(1)}"
    return FASES.get(texto, texto)


def _resultado(pro, contra):
    if pro is None or contra is None:
        return None
    return "V" if pro > contra else "D" if pro < contra else "E"


def _lados(m: dict, team_id: int):
    if m["homeTeam"]["id"] == team_id:
        return "homeTeam", "awayTeam"
    if m["awayTeam"]["id"] == team_id:
        return "awayTeam", "homeTeam"
    raise ValueError(f"Partida {m['id']} não tem o time {team_id}")


def _probabilidades(m: dict, nos: str):
    """Previsão pré-jogo da Highlightly do ponto de vista do Flamengo."""
    pre = ((m.get("predictions") or {}).get("prematch") or [])
    if not pre:
        return None, None, None
    pr = pre[-1].get("probabilities") or {}
    casa, fora = numero(pr.get("home")), numero(pr.get("away"))
    vit, der = (casa, fora) if nos == "homeTeam" else (fora, casa)
    return vit, numero(pr.get("draw")), der


def linha_partida(m: dict, team_id: int) -> dict:
    nos, eles = _lados(m, team_id)
    casa, fora = _placar(((m.get("state") or {}).get("score") or {}).get("current"))
    pen_casa, pen_fora = _placar(((m.get("state") or {}).get("score") or {}).get("penalties"))
    pro, contra = (casa, fora) if nos == "homeTeam" else (fora, casa)
    pen_pro, pen_contra = (pen_casa, pen_fora) if nos == "homeTeam" else (pen_fora, pen_casa)
    status = _status(m)
    vit, emp, der = _probabilidades(m, nos)
    clima = m.get("forecast") or {}
    return {
        "id_partida": m["id"],
        "data_utc": m["date"].replace(".000Z", "+00:00").replace("Z", "+00:00"),
        "status": status,
        "competicao_id": m["league"]["id"],
        "competicao": m["league"]["name"],
        "competicao_logo": m["league"].get("logo"),
        "rodada": rodada(m.get("round")),
        "mando": "Casa" if nos == "homeTeam" else "Fora",
        "adversario_id": m[eles]["id"],
        "adversario": m[eles]["name"],
        "adversario_logo": m[eles].get("logo"),
        "flamengo_logo": m[nos].get("logo"),
        "gols_pro": pro,
        "gols_contra": contra,
        "gols_pro_1t": None,
        "gols_contra_1t": None,
        "resultado": _resultado(pro, contra) if status in config.STATUS_ENCERRADO else None,
        "duracao": 120 if status in {"AET", "PEN"} else 90,
        "penaltis_pro": pen_pro,
        "penaltis_contra": pen_contra,
        "estadio": (m.get("venue") or {}).get("name"),
        "cidade": (m.get("venue") or {}).get("city"),
        "publico_capacidade": numero((m.get("venue") or {}).get("capacity")),
        "arbitro": (m.get("referee") or {}).get("name"),
        "formacao": None,
        "tecnico": None,
        "prob_vitoria": vit,
        "prob_empate": emp,
        "prob_derrota": der,
        "clima": clima.get("status"),
        "temperatura": numero(re.sub(r"[^\d.\-]", "", clima.get("temperature") or "")),
    }


def linhas_jogadores(m: dict, box: list, team_id: int) -> list[dict]:
    linhas = []
    for bloco in box or []:
        time_id = bloco["team"]["id"]
        for p in bloco.get("players", []):
            st = p.get("statistics") or {}
            minutos = numero(p.get("minutesPlayed"))
            reserva = bool(p.get("isSubstitute"))
            linhas.append({
                "id_partida": m["id"],
                "time_id": time_id,
                "eh_flamengo": time_id == team_id,
                "jogador_id": p["id"],
                "jogador": p.get("name"),
                "nome_completo": p.get("fullName"),
                "numero": p.get("shirtNumber"),
                "posicao": POSICOES.get(p.get("position"), p.get("position")),
                "titular": not reserva,
                # Reserva que não entrou vem com 0; None separa "no banco" de "jogou 0 min".
                "minutos": None if reserva and not minutos else minutos,
                "nota": numero(p.get("matchRating")),
                "capitao": bool(p.get("isCaptain")),
                "gols": numero(st.get("goalsScored")),
                "assistencias": numero(st.get("assists")),
                "gols_sofridos": numero(st.get("goalsConceded")),
                "defesas": numero(st.get("goalsSaved")),
                "finalizacoes": numero(st.get("shotsTotal")),
                "finalizacoes_alvo": numero(st.get("shotsOnTarget")),
                "xg": numero(st.get("expectedGoals")),
                "xa": numero(st.get("expectedAssists")),
                "xgot": numero(st.get("expectedGoalsOnTarget")),
                "xg_evitado": numero(st.get("expectedGoalsPrevented")),
                "passes": numero(st.get("passesTotal")),
                "passes_certos": numero(st.get("passesSuccessful")),
                "passes_chave": numero(st.get("passesKey")),
                "desarmes": numero(st.get("tacklesTotal")),
                "interceptacoes": numero(st.get("interceptionsTotal")),
                "duelos": numero(st.get("duelsTotal")),
                "duelos_ganhos": numero(st.get("duelsWon")),
                "dribles_tentados": numero(st.get("dribblesTotal")),
                "dribles_certos": numero(st.get("dribblesSuccessful")),
                "faltas_cometidas": numero(st.get("fouledOthers")),
                "faltas_sofridas": numero(st.get("fouledByOthers")),
                "amarelos": numero(st.get("cardsYellow")),
                "vermelhos": (numero(st.get("cardsRed")) or 0) + (numero(st.get("cardsSecondYellow")) or 0),
                "impedimentos": numero(p.get("offsides")),
                "penaltis_marcados": numero(st.get("penaltiesScored")),
                "penaltis_perdidos": numero(st.get("penaltiesMissed")),
            })
    return linhas


# Tipo do evento na Highlightly -> (tipo, detalhe) no padrão da API-Football,
# que é o que o validador e o painel já entendem.
TIPOS_EVENTO = {
    "Goal": ("Goal", "Normal Goal"),
    "Own Goal": ("Goal", "Own Goal"),
    "Penalty": ("Goal", "Penalty"),
    "Missed Penalty": ("Goal", "Missed Penalty"),
    "Yellow Card": ("Card", "Yellow Card"),
    "Red Card": ("Card", "Red Card"),
    "Second Yellow Card": ("Card", "Second Yellow card"),
    "Substitution": ("subst", "Substitution"),
    "VAR": ("Var", None),
}


def linhas_eventos(m: dict, team_id: int) -> list[dict]:
    linhas = []
    for ordem, ev in enumerate(m.get("events") or []):
        tipo, detalhe = TIPOS_EVENTO.get(ev.get("type"), (ev.get("type"), None))
        minuto, extra = _minuto(ev.get("time"))
        sub = tipo == "subst"
        linhas.append({
            "id_partida": m["id"],
            "ordem": ordem,
            "minuto": minuto,
            "acrescimo": extra,
            "time_id": ev["team"]["id"],
            "eh_flamengo": ev["team"]["id"] == team_id,
            # Substituição: `player` é quem sai e `substituted` quem entra (o id de quem
            # entra vem em `assistingPlayerId`), igual ao padrão player/assist da API-Football.
            "jogador_id": ev.get("playerId"),
            "jogador": ev.get("player"),
            "assist_id": ev.get("assistingPlayerId"),
            "assist": ev.get("substituted") if sub else ev.get("assist"),
            "tipo": tipo,
            "detalhe": detalhe,
            "comentario": None,
        })
    return linhas


def linhas_estatisticas(m: dict, team_id: int) -> list[dict]:
    linhas = []
    for bloco in m.get("statistics") or []:
        tid = bloco["team"]["id"]
        valores = {}
        for st in bloco.get("statistics", []):
            nome = ESTATISTICAS_TIME.get(st["displayName"], st["displayName"])
            valores[nome] = numero(st.get("value"))
        partes = [valores.get(k) for k in ("finalizacoes_alvo", "finalizacoes_fora", "finalizacoes_bloqueadas")]
        if all(v is not None for v in partes):
            valores["finalizacoes"] = sum(partes)
        if valores.get("passes") and valores.get("passes_certos") is not None:
            valores["passes_pct"] = round(valores["passes_certos"] / valores["passes"], 4)
        for nome, valor in valores.items():
            linhas.append({"id_partida": m["id"], "time_id": tid, "eh_flamengo": tid == team_id,
                           "estatistica": nome, "valor": valor})
    return linhas


def linhas_finalizacoes(m: dict, team_id: int) -> list[dict]:
    linhas = []
    for lado in ("homeTeam", "awayTeam"):
        tid = m[lado]["id"]
        for ordem, s in enumerate(m[lado].get("shots") or []):
            minuto, extra = _minuto(s.get("time"))
            linhas.append({
                "id_partida": m["id"],
                "time_id": tid,
                "eh_flamengo": tid == team_id,
                "ordem": ordem,
                "minuto": minuto,
                "acrescimo": extra,
                "jogador": s.get("playerName"),
                "resultado": s.get("outcome"),
                "alvo": s.get("goalTarget"),
            })
    return linhas


def normalizar(partidas: list[dict], team_id: int | None = None) -> dict[str, list[dict]]:
    team_id = team_id or config.TEAM_ID
    t = {"partidas": [], "jogadores_partida": [], "eventos": [], "estatisticas_time": [], "finalizacoes": []}
    for raw in partidas:
        m = raw["match"]
        t["partidas"].append(linha_partida(m, team_id))
        t["jogadores_partida"] += linhas_jogadores(m, raw.get("boxscore"), team_id)
        t["eventos"] += linhas_eventos(m, team_id)
        t["estatisticas_time"] += linhas_estatisticas(m, team_id)
        t["finalizacoes"] += linhas_finalizacoes(m, team_id)
    return t


def linhas_calendario(jogos: list[dict], team_id: int | None = None) -> list[dict]:
    team_id = team_id or config.TEAM_ID
    linhas = []
    for j in jogos:
        p = linha_partida(j, team_id)
        linhas.append({k: p[k] for k in ("id_partida", "data_utc", "status", "competicao_id", "competicao", "competicao_logo",
                                          "rodada", "mando", "adversario_id", "adversario", "adversario_logo",
                                          "gols_pro", "gols_contra", "estadio")})
    return linhas
