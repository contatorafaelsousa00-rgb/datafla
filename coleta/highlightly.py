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

import json
import os
import re
import time
from collections import Counter
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
    "Attacks": "ataques",
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

    Coleta quando: um jogo já deveria ter terminado (início + 2h10) e ainda não foi baixado; o próximo jogo
    começa em menos de 24 h e a previsão dele tem 6 h ou mais; ou a última coleta tem 24 h (atualização diária,
    que também recoleta os jogos das últimas 48 h).
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
    prox = proximo_jogo(lista["data"], agora)
    if prox and agora < _data(prox) <= agora + timedelta(hours=24) and _vencido(f"proximo_{prox['id']}", HORAS_PROXIMO, agora):
        rival = prox["awayTeam"]["name"] if prox["homeTeam"]["id"] == config.TEAM_ID else prox["homeTeam"]["name"]
        return True, f"jogo contra {rival} em menos de 24 h: renova previsão, árbitro e clima"
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
            f.write(f"motivo={motivo}\n")
    return 0


# ---------- histórico das atualizações (lido pela tela de admin) ----------
ARQ_HISTORICO = "atualizacoes.json"  # em data/<ano>/, versionado junto com as respostas brutas
MAX_HISTORICO = 300
ORIGENS = {"workflow_dispatch": "disparo externo / manual", "schedule": "agenda do GitHub", "push": "publicação"}


def coletas_salvas() -> dict:
    """{id da partida: hora da coleta} das partidas já baixadas."""
    salvas = {}
    for arq in config.RAW_DIR.glob("partida_*.json"):
        dados = ler_raw(arq.stem) or {}
        salvas[arq.stem.removeprefix("partida_")] = dados.get("_coletado_em")
    return salvas


def _descrever(jogo: dict) -> dict:
    rival = jogo["awayTeam"]["name"] if jogo["homeTeam"]["id"] == config.TEAM_ID else jogo["homeTeam"]["name"]
    return {"adversario": rival, "data_utc": jogo.get("date"), "competicao": (jogo.get("league") or {}).get("name")}


def registrar_atualizacao(antes: dict, api: ClienteHighlightly | None, erro: str | None = None) -> dict:
    """Acrescenta ao histórico o que esta coleta mudou: jogos novos, recoletados, pendentes e cota."""
    depois = coletas_salvas()
    jogos = {str(j["id"]): j for j in (ler_raw(ARQ_JOGOS) or {}).get("data", [])}
    descrever = lambda ids: [_descrever(jogos[i]) if i in jogos else {"adversario": f"jogo {i}"} for i in sorted(ids)]
    novos = [i for i in depois if i not in antes]
    recoletados = [i for i in depois if i in antes and depois[i] != antes[i]]
    s = situacao_coleta()
    item = {
        "quando": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "origem": ORIGENS.get(os.environ.get("GITHUB_EVENT_NAME", ""), "local"),
        "motivo": os.environ.get("FLA_MOTIVO") or "coleta manual",
        "novos": descrever(novos),
        "recoletados": descrever(recoletados),
        "encerrados": s["encerrados"],
        "pendentes": s["pendentes"],
        "requisicoes": getattr(api, "chamadas", 0),
        "cota_restante": getattr(api, "restantes_hoje", None),
        "erro": erro,
    }
    caminho = config.PASTA_TEMPORADA / ARQ_HISTORICO
    historico = json.loads(caminho.read_text(encoding="utf-8")) if caminho.exists() else []
    historico = (historico + [item])[-MAX_HISTORICO:]
    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_text(json.dumps(historico, ensure_ascii=False, indent=1), encoding="utf-8")
    return item


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


# ---------- próximos jogos ----------
# Para os próximos jogos a fonte tem: estádio, árbitro, previsão do tempo, chance de vitória/empate/derrota
# (/matches/{id}), os últimos confrontos diretos (/head-2-head) e os 5 últimos jogos do adversário
# (/last-five-games). Prioridade para o mais próximo: ele renova a cada 6 h; os seguintes, 1x por dia.
N_PROXIMOS = 3                 # quantos jogos à frente recebem detalhe
JANELA_PROXIMOS_DIAS = 21      # além do primeiro, só jogos nas próximas 3 semanas
HORAS_PROXIMO = 6              # renovação do detalhe do jogo mais próximo
HORAS_PROXIMOS_DEMAIS = 24     # renovação do detalhe dos seguintes, dos confrontos e da forma do adversário


def proximo_jogo(jogos: list[dict], agora: datetime | None = None) -> dict | None:
    """Primeiro jogo ainda não encerrado; vale até 3 h depois do início (jogo em andamento)."""
    return next(iter(proximos_jogos(jogos, agora, n=1)), None)


def proximos_jogos(jogos: list[dict], agora: datetime | None = None, n: int = N_PROXIMOS) -> list[dict]:
    """Os n próximos jogos não encerrados (o primeiro sempre; os demais só dentro da janela de 3 semanas)."""
    agora = agora or datetime.now(timezone.utc)
    futuros = sorted((j for j in jogos if _status(j) not in config.STATUS_ENCERRADO | {"ABD", "PST", "CANC"}
                      and _data(j) > agora - timedelta(hours=3)), key=lambda j: j["date"])
    limite = agora + timedelta(days=JANELA_PROXIMOS_DIAS)
    return [j for k, j in enumerate(futuros[:n]) if k == 0 or _data(j) <= limite]


def _adversario_id(jogo: dict) -> int:
    return jogo["awayTeam"]["id"] if jogo["homeTeam"]["id"] == config.TEAM_ID else jogo["homeTeam"]["id"]


def _vencido(nome: str, horas: float, agora: datetime | None = None) -> bool:
    salvo = ler_raw(nome)
    if not salvo or "_coletado_em" not in salvo:
        return True
    agora = agora or datetime.now(timezone.utc)
    return agora - datetime.fromisoformat(salvo["_coletado_em"]) >= timedelta(hours=horas)


def tarefas_proximos(jogos: list[dict], agora: datetime | None = None) -> list[tuple[str, str, dict]]:
    """(arquivo, endpoint, parâmetros) que estão vencidos, do jogo mais próximo para o mais distante."""
    tarefas = []
    for ordem, jogo in enumerate(proximos_jogos(jogos, agora)):
        adv = _adversario_id(jogo)
        candidatos = [
            (f"proximo_{jogo['id']}", f"matches/{jogo['id']}", {}, HORAS_PROXIMO if ordem == 0 else HORAS_PROXIMOS_DEMAIS),
            (f"h2h_{adv}", "head-2-head", {"teamIdOne": config.TEAM_ID, "teamIdTwo": adv}, HORAS_PROXIMOS_DEMAIS),
            (f"forma_{adv}", "last-five-games", {"teamId": adv}, HORAS_PROXIMOS_DEMAIS),
        ]
        tarefas += [(nome, cam, par) for nome, cam, par, horas in candidatos if _vencido(nome, horas, agora)]
    return tarefas


def cmd_proximo(api: ClienteHighlightly):
    """Detalhe, confrontos e forma do adversário dos próximos jogos (até 3 requisições por jogo, só o vencido)."""
    lista = ler_raw(ARQ_JOGOS)
    tarefas = tarefas_proximos(lista["data"]) if lista else []
    if not tarefas:
        print("Próximos jogos: nada a renovar.")
        return 0
    feitas = 0
    for nome, caminho, params in tarefas:
        if api.restantes_hoje is not None and api.restantes_hoje - 1 < _reserva():
            print(f"Próximos jogos: sem cota; {len(tarefas) - feitas} consultas ficam para a próxima coleta.")
            break
        corpo = api.get(caminho, **params)
        if nome.startswith("proximo_"):
            corpo = corpo[0] if isinstance(corpo, list) else corpo
        salvar_raw(nome, {"data": corpo, "_coletado_em": datetime.now(timezone.utc).isoformat()})
        feitas += 1
    print(f"Próximos jogos: {feitas} consultas (detalhe, confrontos diretos, forma do adversário).")
    return 0


def _resultado(pro, contra):
    if pro is None or contra is None:
        return None
    return "V" if pro > contra else "E" if pro == contra else "D"


def _jogo_resumido(m: dict, ponto_de_vista: int) -> dict | None:
    """Jogo encerrado do ponto de vista de um time (Flamengo nos confrontos, o adversário na forma)."""
    if _status(m) not in config.STATUS_ENCERRADO:
        return None
    casa, fora = _placar(((m.get("state") or {}).get("score") or {}).get("current"))
    em_casa = m["homeTeam"]["id"] == ponto_de_vista
    oponente = m["awayTeam"] if em_casa else m["homeTeam"]
    pro, contra = (casa, fora) if em_casa else (fora, casa)
    return {
        "id_partida": m["id"],
        "data_utc": m["date"].replace(".000Z", "+00:00").replace("Z", "+00:00"),
        "competicao": (m.get("league") or {}).get("name"),
        "mando": "Casa" if em_casa else "Fora",
        "oponente": oponente.get("name"),
        "oponente_logo": oponente.get("logo"),
        "gols_pro": pro,
        "gols_contra": contra,
        "resultado": _resultado(pro, contra),
    }


def linhas_proximos(jogos: list[dict], team_id: int | None = None) -> dict[str, list[dict]]:
    """Tabelas dos próximos jogos: proximo (detalhe), confrontos (Flamengo × adversário) e forma_adversario."""
    team_id = team_id or config.TEAM_ID
    proximo, confrontos, forma = [], [], []
    vistos = set()
    for jogo in proximos_jogos(jogos):
        salvo = ler_raw(f"proximo_{jogo['id']}")
        if salvo:
            m = {**salvo["data"], **jogo}  # data e status mais recentes vêm da lista
            m.update({k: v for k, v in salvo["data"].items() if k in ("venue", "referee", "forecast", "predictions")})
            proximo.append({**linha_partida(m, team_id), "coletado_em": salvo["_coletado_em"]})
        adv = _adversario_id(jogo)
        if adv in vistos:
            continue
        vistos.add(adv)
        for m in (ler_raw(f"h2h_{adv}") or {}).get("data") or []:
            linha = _jogo_resumido(m, team_id)
            if linha:
                confrontos.append({**linha, "adversario_id": adv})
        for m in (ler_raw(f"forma_{adv}") or {}).get("data") or []:
            linha = _jogo_resumido(m, adv)
            if linha:
                forma.append({**linha, "adversario_id": adv})
    return {"proximo": proximo, "confrontos": confrontos, "forma_adversario": forma}


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


def _eh_disputa(m: dict, ev: dict) -> bool:
    """Cobrança da disputa de pênaltis (não é gol do jogo): a fonte manda como "Penalty" no minuto 120+."""
    tem_disputa = ((m.get("state") or {}).get("score") or {}).get("penalties")
    return bool(tem_disputa) and ev.get("type") in ("Penalty", "Missed Penalty") and (_minuto(ev.get("time"))[0] or 0) >= 120


def _gols_pelos_lances(m: dict) -> tuple[int, int] | None:
    """(casa, fora) contando os lances de gol (gol contra vem no time que se beneficiou); None sem lances de gol."""
    gols = {m["homeTeam"]["id"]: 0, m["awayTeam"]["id"]: 0}
    achou = False
    for ev in m.get("events") or []:
        if ev.get("type") in ("Goal", "Own Goal", "Penalty") and not _eh_disputa(m, ev):
            tid = (ev.get("team") or {}).get("id")
            if tid in gols:
                gols[tid] += 1
                achou = True
    return (gols[m["homeTeam"]["id"]], gols[m["awayTeam"]["id"]]) if achou else None


def placar(m: dict) -> tuple[int | None, int | None]:
    """Placar (casa, fora). A fonte às vezes manda o placar com os lados trocados (ex.: "Madureira 3 - 0 Flamengo"
    com os 3 gols do Flamengo nos lances): quando os lances dão exatamente o placar invertido, vale o dos lances."""
    casa, fora = _placar(((m.get("state") or {}).get("score") or {}).get("current"))
    pelos_lances = _gols_pelos_lances(m)
    if casa is not None and casa != fora and pelos_lances == (fora, casa):
        return fora, casa
    return casa, fora


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
    casa, fora = placar(m)
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


def _dono_do_chute(nome: str | None, jogadores: list[dict]) -> dict | None:
    """Jogador do box-score que deu o chute (a lista de chutes usa outro formato de nome, ex.: "Leo Pereira")."""
    from .fotos import _norm, _sobrenome
    n = _norm(nome)
    if not n:
        return None
    for criterio in (
        lambda p: n in (_norm(p.get("name")), _norm(p.get("fullName"))),
        lambda p: _sobrenome(nome) in (_sobrenome(p.get("name")), _sobrenome(p.get("fullName"))),
        lambda p: all(x in _norm(p.get("fullName")).split() for x in n.split()),
    ):
        achados = [p for p in jogadores if criterio(p)]
        if len(achados) == 1:
            return achados[0]
    return None


def _bloqueadas_por_jogador(m: dict, time_id: int, jogadores: list[dict]) -> Counter:
    """O shotsTotal do jogador na fonte não conta chutes bloqueados (o total do time conta).
    Eles vêm da lista de chutes da partida, casados pelo nome."""
    lado = "homeTeam" if m["homeTeam"]["id"] == time_id else "awayTeam"
    contagem = Counter()
    for chute in m[lado].get("shots") or []:
        if chute.get("outcome") == "Blocked":
            dono = _dono_do_chute(chute.get("playerName"), jogadores)
            if dono:
                contagem[dono["id"]] += 1
    return contagem


def _completar_gols_pelos_lances(m: dict, time_id: int, linhas: list[dict]) -> None:
    """Alguns box-scores vêm sem gols/assistências (ex.: Madureira 3 x 0 em 22/02). Se os lances têm mais gols do
    que o box-score e todos os autores estão no box-score (mesmo id), os números dos jogadores vêm dos lances."""
    lances = [ev for ev in m.get("events") or [] if ev.get("type") in ("Goal", "Penalty")
              and (ev.get("team") or {}).get("id") == time_id and not _eh_disputa(m, ev)]
    por_id = {l["jogador_id"]: l for l in linhas}
    for campo, chave in (("gols", "playerId"), ("assistencias", "assistingPlayerId")):
        autores = [ev.get(chave) for ev in lances if ev.get(chave)]
        if sum(l[campo] or 0 for l in linhas) >= len(autores) or not all(a in por_id for a in autores):
            continue
        for l in linhas:
            l[campo] = max(l[campo] or 0, autores.count(l["jogador_id"]))


def _corrigir_titulares(linhas: list[dict], entraram: set | None = None, sairam: set | None = None) -> None:
    """A fonte às vezes marca mais de 11 titulares (em jogos do time alternativo, todos os relacionados).
    Volta para o banco, nesta ordem: quem entrou numa substituição; quem não jogou; e, se ainda sobrar,
    quem jogou menos entre os que não saíram numa substituição (quem saiu começou jogando)."""
    entraram, sairam = entraram or set(), sairam or set()
    titulares = lambda: [l for l in linhas if l["titular"]]
    if len(titulares()) <= 11:
        return
    for l in titulares():
        if l["jogador_id"] in entraram:
            l["titular"] = False
    for l in titulares():
        if len(titulares()) > 11 and not l["minutos"]:
            l["titular"], l["minutos"] = False, None
    sobra = len(titulares()) - 11
    if sobra > 0:
        candidatos = sorted((l for l in titulares() if l["jogador_id"] not in sairam), key=lambda l: l["minutos"] or 0)
        for l in candidatos[:sobra]:
            l["titular"] = False


def linhas_jogadores(m: dict, box: list, team_id: int) -> list[dict]:
    linhas = []
    for bloco in box or []:
        time_id = bloco["team"]["id"]
        do_time = []
        bloqueadas = _bloqueadas_por_jogador(m, time_id, bloco.get("players", []))
        subs = [ev for ev in m.get("events") or [] if ev.get("type") == "Substitution" and (ev.get("team") or {}).get("id") == time_id]
        for p in bloco.get("players", []):
            st = p.get("statistics") or {}
            minutos = numero(p.get("minutesPlayed"))
            reserva = bool(p.get("isSubstitute"))
            do_time.append({
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
                "finalizacoes": (None if numero(st.get("shotsTotal")) is None
                                 else numero(st.get("shotsTotal")) + bloqueadas[p["id"]]),
                "finalizacoes_bloqueadas": bloqueadas[p["id"]],
                "finalizacoes_alvo": numero(st.get("shotsOnTarget")),
                "xg": numero(st.get("expectedGoals")),
                "xa": numero(st.get("expectedAssists")),
                "xgot": numero(st.get("expectedGoalsOnTarget")),
                "xg_evitado": numero(st.get("expectedGoalsPrevented")),
                "xgot_enfrentado": numero(st.get("expectedGoalsOnTargetConceded")),  # goleiro: qualidade dos chutes no alvo que enfrentou
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
                # Só cardsRed: na fonte, cardsSecondYellow vem 1 para quem levou UM amarelo (215 casos sem expulsão nos
                # lances); a expulsão por dois amarelos já vem como cardsRed = 1 e como lance "Red Card".
                "vermelhos": numero(st.get("cardsRed")) or 0,
                "impedimentos": numero(p.get("offsides")),
                "penaltis_marcados": numero(st.get("penaltiesScored")),
                "penaltis_perdidos": numero(st.get("penaltiesMissed")),
            })
        _corrigir_titulares(do_time, {ev.get("assistingPlayerId") for ev in subs}, {ev.get("playerId") for ev in subs})
        _completar_gols_pelos_lances(m, time_id, do_time)
        linhas += do_time
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
        if _eh_disputa(m, ev):  # cobrança da disputa: fica nos lances, mas não conta como gol nem entra na linha do tempo
            tipo, detalhe = "Shootout", "Scored" if ev.get("type") == "Penalty" else "Missed"
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
        baixado = (ler_raw(f"partida_{j['id']}") or {}).get("match") or {}
        p = linha_partida({**j, "events": baixado.get("events") or j.get("events")}, team_id)  # lances corrigem placar trocado
        linhas.append({k: p[k] for k in ("id_partida", "data_utc", "status", "competicao_id", "competicao", "competicao_logo",
                                          "rodada", "mando", "adversario_id", "adversario", "adversario_logo",
                                          "gols_pro", "gols_contra", "estadio")})
    return linhas
