"""Dados complementares da Highlightly: escalações, classificação e carreira dos jogadores.

Entram na coleta depois dos jogos e dos próximos jogos (que têm prioridade na cota) e param antes de
esgotá-la; o que faltar vem nas próximas coletas (a carga inicial leva uns 2 dias no plano grátis).

    escalacao_<jogo>   /lineups/{jogo}                 formação e titulares por linha do campo (1 vez por jogo)
    tabela_<liga>      /standings?leagueId=&season=    classificação (1 vez por dia enquanto houver jogo na competição)
    carreira_<jogador> /players/{id}/statistics        jogos, gols etc. por temporada e competição (1 vez por semana)
    liga_<liga>        /matches?leagueId=&season=      todos os jogos do campeonato de pontos corridos (4 páginas, 1 vez
                                                        por dia): tabela e simulador da aba Classificação
"""

from __future__ import annotations

import os
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from . import config
from .api import ler_raw, salvar_raw
from .highlightly import ARQ_JOGOS, ClienteHighlightly, ErroAPI, POSICOES, _reserva, _status, numero

MAX_ESCALACOES = int(os.environ.get("FLA_MAX_ESCALACOES", "25"))  # por coleta (carga inicial em partes)
MAX_CARREIRAS = int(os.environ.get("FLA_MAX_CARREIRAS", "12"))
HORAS_TABELA = 24
HORAS_LIGA = 20
POR_PAGINA = 100
DIAS_CARREIRA = 7


def _agora():
    return datetime.now(timezone.utc)


def _idade(nome: str) -> timedelta | None:
    salvo = ler_raw(nome)
    if not salvo or "_coletado_em" not in salvo:
        return None
    return _agora() - datetime.fromisoformat(salvo["_coletado_em"])


def _salvar(nome: str, dados) -> None:
    salvar_raw(nome, {"data": dados, "_coletado_em": _agora().isoformat()})


# ---------- o que buscar ----------

def tarefas(jogos: list[dict]) -> list[tuple[str, str, dict]]:
    """(arquivo, endpoint, parâmetros) em ordem de prioridade: escalações recentes, tabelas, carreiras."""
    encerrados = sorted((j for j in jogos if _status(j) in config.STATUS_ENCERRADO), key=lambda j: j["date"], reverse=True)
    escalacoes = [(f"escalacao_{j['id']}", f"lineups/{j['id']}", {}) for j in encerrados
                  if ler_raw(f"escalacao_{j['id']}") is None][:MAX_ESCALACOES]

    futuras = {(j.get("league") or {}).get("id") for j in jogos if _status(j) not in config.STATUS_ENCERRADO}
    ligas = {(j.get("league") or {}).get("id"): (j.get("league") or {}).get("season") for j in jogos
             if "friendl" not in ((j.get("league") or {}).get("name") or "").lower()}  # amistoso não tem tabela
    tabelas = []
    for liga, temporada in ligas.items():
        idade = _idade(f"tabela_{liga}")
        if liga and (idade is None or (liga in futuras and idade >= timedelta(hours=HORAS_TABELA))):
            tabelas.append((f"tabela_{liga}", "standings", {"leagueId": liga, "season": temporada or config.SEASON}))

    minutos = defaultdict(int)
    for arq in config.RAW_DIR.glob("partida_*.json"):
        for bloco in (ler_raw(arq.stem) or {}).get("boxscore") or []:
            if bloco["team"]["id"] == config.TEAM_ID:
                for p in bloco.get("players", []):
                    minutos[p["id"]] += numero(p.get("minutesPlayed")) or 0
    carreiras = [(f"carreira_{pid}", f"players/{pid}/statistics", {}) for pid, m in sorted(minutos.items(), key=lambda x: -x[1])
                 if m > 0 and ((_idade(f"carreira_{pid}") or timedelta(days=999)) >= timedelta(days=DIAS_CARREIRA))][:MAX_CARREIRAS]
    # Campeonato de pontos corridos (Brasileirão): todos os jogos, para a tabela e o simulador
    ligas_corridas = {(j.get("league") or {}).get("id"): (j.get("league") or {}).get("season") for j in jogos
                      if ((j.get("league") or {}).get("name") or "").lower() == "serie a"}
    liga = [(f"liga_{lid}", "matches", {"leagueId": lid, "season": temp or config.SEASON}) for lid, temp in ligas_corridas.items()
            if (_idade(f"liga_{lid}") or timedelta(days=999)) >= timedelta(hours=HORAS_LIGA)]
    return escalacoes[:5] + liga + escalacoes[5:] + tabelas + carreiras


def cmd_extras(api: ClienteHighlightly) -> int:
    lista = ler_raw(ARQ_JOGOS)
    pendentes = tarefas(lista["data"]) if lista else []
    if not pendentes:
        print("Extras (escalações, tabelas, carreiras): nada a renovar.")
        return 0
    feitas = defaultdict(int)  # por tipo: escalacao, tabela, carreira
    for nome, caminho, params in pendentes:
        if api.restantes_hoje is not None and api.restantes_hoje - 1 < _reserva():
            print("Extras: cota do dia no fim; o resto fica para a próxima coleta.")
            break
        try:
            if nome.startswith("liga_"):
                _salvar(nome, _todas_as_paginas(api, caminho, params))
            else:
                _salvar(nome, api.get(caminho, **params))
        except ErroAPI as e:  # ex.: competição sem tabela (mata-mata) ou jogo sem escalação: guarda vazio para não insistir
            print(f"  {nome}: {e}")
            _salvar(nome, None)
        feitas[nome.split("_")[0]] += 1
    print("Extras: " + ", ".join(f"{n} {t}" for t, n in feitas.items()) + ".")
    return 0


def _todas_as_paginas(api: ClienteHighlightly, caminho: str, params: dict) -> list:
    jogos, offset = [], 0
    while True:
        corpo = api.get(caminho, **params, offset=offset, limit=POR_PAGINA)
        jogos += corpo.get("data") or []
        total = (corpo.get("pagination") or {}).get("totalCount", 0)
        offset += POR_PAGINA
        if offset >= total or not corpo.get("data"):
            return jogos


# ---------- normalização ----------

def _jogador_escalacao(p: dict, **extra) -> dict:
    return {"jogador_id": p.get("id"), "jogador": p.get("name"), "numero": p.get("number"),
            "posicao": POSICOES.get(p.get("position"), p.get("position")), **extra}


def linhas_escalacoes(ids_partidas, team_id: int | None = None) -> tuple[list[dict], dict]:
    """Escalações (titulares por linha do campo + banco) e {jogo: (formação do Flamengo, do adversário)}."""
    team_id = team_id or config.TEAM_ID
    linhas, formacoes = [], {}
    for pid in ids_partidas:
        dados = (ler_raw(f"escalacao_{pid}") or {}).get("data")
        if not dados:
            continue
        fla = adv = None
        for lado in ("homeTeam", "awayTeam"):
            t = dados.get(lado) or {}
            if not t:
                continue
            eh_fla = t.get("id") == team_id
            if eh_fla:
                fla = t.get("formation")
            else:
                adv = t.get("formation")
            base = {"id_partida": pid, "time_id": t.get("id"), "eh_flamengo": eh_fla, "formacao": t.get("formation")}
            for n_linha, linha in enumerate(t.get("initialLineup") or []):
                for ordem, p in enumerate(linha):
                    linhas.append(_jogador_escalacao(p, **base, titular=True, linha=n_linha, ordem=ordem))
            for ordem, p in enumerate(t.get("substitutes") or []):
                linhas.append(_jogador_escalacao(p, **base, titular=False, linha=None, ordem=ordem))
        formacoes[pid] = (fla, adv)
    return linhas, formacoes


def linhas_classificacao(jogos: list[dict], team_id: int | None = None) -> list[dict]:
    team_id = team_id or config.TEAM_ID
    linhas = []
    nomes = {(j.get("league") or {}).get("id"): (j.get("league") or {}).get("name") for j in jogos}
    for liga, nome in nomes.items():
        salvo = ler_raw(f"tabela_{liga}") or {}
        dados = salvo.get("data") or {}
        for grupo in dados.get("groups") or []:
            for s in grupo.get("standings") or []:
                tot = s.get("total") or {}
                linhas.append({
                    "competicao_id": liga, "competicao": nome, "grupo": grupo.get("name"),
                    "posicao": s.get("position"), "time_id": s["team"]["id"], "time": s["team"]["name"],
                    "time_logo": s["team"].get("logo"), "eh_flamengo": s["team"]["id"] == team_id,
                    "pontos": s.get("points"), "jogos": tot.get("games"), "vitorias": tot.get("wins"),
                    "empates": tot.get("draws"), "derrotas": tot.get("loses"),
                    "gols_pro": tot.get("scoredGoals"), "gols_contra": tot.get("receivedGoals"),
                    "atualizado_em": salvo.get("_coletado_em"),
                })
    return linhas


def linhas_liga(jogos_fla: list[dict]) -> list[dict]:
    """Todos os jogos do campeonato de pontos corridos (encerrados e futuros), para tabela e simulador."""
    from .highlightly import _placar, rodada
    linhas = []
    nomes = {(j.get("league") or {}).get("id"): (j.get("league") or {}).get("name") for j in jogos_fla}
    for arq in config.RAW_DIR.glob("liga_*.json"):
        lid = int(arq.stem.removeprefix("liga_"))
        for m in (ler_raw(arq.stem) or {}).get("data") or []:
            casa, fora = _placar(((m.get("state") or {}).get("score") or {}).get("current"))
            status = _status(m)
            linhas.append({
                "competicao_id": lid, "competicao": nomes.get(lid, (m.get("league") or {}).get("name")),
                "id_partida": m["id"], "data_utc": m["date"].replace(".000Z", "+00:00").replace("Z", "+00:00"),
                "rodada": rodada(m.get("round")), "status": status,
                "casa_id": m["homeTeam"]["id"], "casa": m["homeTeam"]["name"], "casa_logo": m["homeTeam"].get("logo"),
                "fora_id": m["awayTeam"]["id"], "fora": m["awayTeam"]["name"], "fora_logo": m["awayTeam"].get("logo"),
                "gols_casa": casa if status in config.STATUS_ENCERRADO else None,
                "gols_fora": fora if status in config.STATUS_ENCERRADO else None,
            })
    return linhas


def linhas_carreira() -> list[dict]:
    linhas = []
    for arq in config.RAW_DIR.glob("carreira_*.json"):
        for jogador in (ler_raw(arq.stem) or {}).get("data") or []:
            for c in jogador.get("perCompetition") or []:
                linhas.append({
                    "jogador_id": jogador["id"], "temporada": c.get("season"), "competicao": c.get("league"),
                    "clube": c.get("club"), "tipo": c.get("type"), "jogos": c.get("gamesPlayed"),
                    "minutos": c.get("minutesPlayed"), "gols": c.get("goals"), "assistencias": c.get("assists"),
                    "amarelos": c.get("yellowCards"), "vermelhos": (c.get("redCards") or 0) + (c.get("secondYellowCards") or 0),
                    "entrou": c.get("substitutedIn"), "saiu": c.get("substitutedOut"),
                    "sem_sofrer_gol": c.get("cleanSheets"), "gols_sofridos": c.get("goalsConceded"),
                })
    return linhas
