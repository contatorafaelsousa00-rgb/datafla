"""Dados complementares da Highlightly: escalações, classificação e carreira dos jogadores.

Entram na coleta depois dos jogos e dos próximos jogos (que têm prioridade na cota) e param antes de
esgotá-la; o que faltar vem nas próximas coletas (a carga inicial leva uns 2 dias no plano grátis).

    escalacao_<jogo>   /lineups/{jogo}                 formação e titulares por linha do campo (1 vez por jogo)
    tabela_<liga>      /standings?leagueId=&season=    classificação (1 vez por dia enquanto houver jogo na competição)
    carreira_<jogador> /players/{id}/statistics        jogos, gols etc. por temporada e competição (1 vez por semana)
    perfil_<jogador>   /players/{id}                   nascimento, altura, pé, nacionalidade, posição, contrato, valor de
                                                        mercado, lesões (1 vez por semana, 15 por coleta) — ficha do elenco
    liga_<liga>        /matches?leagueId=&season=      todos os jogos do campeonato de pontos corridos (4 páginas, 1 vez
                                                        por dia): tabela e simulador da aba Classificação
    copa_<liga>        /matches?leagueId=&season=      todos os jogos de Libertadores e Copa do Brasil (2 páginas; renova
                                                        a cada 20 h enquanto houver jogo por acontecer): chaveamento do mata-mata
"""

from __future__ import annotations

import os
import re
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from . import config
from .api import ler_raw, salvar_raw
from .highlightly import ARQ_JOGOS, DURACAO_ESPERADA, ClienteHighlightly, ErroAPI, POSICOES, _data, _reserva, _status, numero

MAX_ESCALACOES = int(os.environ.get("FLA_MAX_ESCALACOES", "25"))  # por coleta (carga inicial em partes)
MAX_CARREIRAS = int(os.environ.get("FLA_MAX_CARREIRAS", "12"))
MAX_PERFIS = int(os.environ.get("FLA_MAX_PERFIS", "15"))
DIAS_PERFIL = 7
HORAS_TABELA = 24
HORAS_LIGA = 20
HORAS_LIGA_RODADA = 3  # com jogo da rodada já terminado e sem resultado no arquivo, renova com 3 h+ de intervalo
# Em dia de jogo do Flamengo, extras não essenciais (perfis, carreiras, escalações antigas) deixam esta folga na cota
# para a coleta depois do apito (jogo, lista, tabela da liga, próximos jogos). Sem isso, as renovações de pré-jogo
# gastavam a cota até o fim e a tabela do Brasileirão ficava sem a rodada (18/10/2026, Bahia × Flamengo).
RESERVA_DIA_DE_JOGO = int(os.environ.get("FLA_HL_RESERVA_JOGO", "25"))
POR_PAGINA = 100
DIAS_CARREIRA = 7


def _agora():
    return datetime.now(timezone.utc)


def _idade(nome: str) -> timedelta | None:
    salvo = ler_raw(nome)
    if not salvo or "_coletado_em" not in salvo:
        return None
    return _agora() - datetime.fromisoformat(salvo["_coletado_em"])


def jogos_sem_resultado(nome: str, agora: datetime | None = None, ignorar: set | None = None) -> int:
    """Jogos do arquivo `nome` que terminaram depois da última vez que ele foi baixado (ainda sem resultado nele)."""
    salvo = ler_raw(nome)
    if not salvo or "_coletado_em" not in salvo:
        return 0
    agora = agora or _agora()
    coletado = datetime.fromisoformat(salvo["_coletado_em"])
    # Só conta jogo que ainda não tinha acabado quando o arquivo foi baixado: um adiamento antigo que a fonte
    # deixou como "Not started" não fica renovando o arquivo para sempre.
    return sum(1 for m in salvo.get("data") or []
               if _status(m) not in config.STATUS_ENCERRADO | {"PST", "CANC", "ABD"}
               and coletado - DURACAO_ESPERADA < _data(m) <= agora - DURACAO_ESPERADA
               and m["id"] not in (ignorar or ()))


def dia_de_jogo(jogos: list[dict], agora: datetime | None = None) -> bool:
    """Jogo do Flamengo nas próximas 30 h, ou já terminado e ainda não baixado."""
    agora = agora or _agora()
    for j in jogos:
        inicio = _data(j)
        if agora <= inicio <= agora + timedelta(hours=30):
            return True
        if inicio <= agora and _status(j) not in {"PST", "CANC", "ABD"} and ler_raw(f"partida_{j['id']}") is None \
                and agora - inicio <= timedelta(hours=config.JANELA_RECOLETA_HORAS):
            return True
    return False


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
    vencido = lambda nome, dias: (_idade(nome) or timedelta(days=999)) >= timedelta(days=dias)
    # Ficha do elenco: quem jogou ou foi relacionado (banco nas escalações), dos mais recentes para os mais antigos
    relacionados = []
    for j in encerrados:
        esc = (ler_raw(f"escalacao_{j['id']}") or {}).get("data") or {}
        for lado in ("homeTeam", "awayTeam"):
            t = esc.get(lado) or {}
            if t.get("id") == config.TEAM_ID:
                relacionados += [p.get("id") for linha in t.get("initialLineup") or [] for p in linha] + [p.get("id") for p in t.get("substitutes") or []]
    candidatos = list(dict.fromkeys([i for i in relacionados if i] + [pid for pid, _ in sorted(minutos.items(), key=lambda x: -x[1])]))
    perfis = [(f"perfil_{pid}", f"players/{pid}", {}) for pid in candidatos if vencido(f"perfil_{pid}", DIAS_PERFIL)][:MAX_PERFIS]
    carreiras = [(f"carreira_{pid}", f"players/{pid}/statistics", {}) for pid, m in sorted(minutos.items(), key=lambda x: -x[1])
                 if m > 0 and ((_idade(f"carreira_{pid}") or timedelta(days=999)) >= timedelta(days=DIAS_CARREIRA))][:MAX_CARREIRAS]
    # Campeonato de pontos corridos (Brasileirão): todos os jogos, para a tabela e o simulador
    ligas_corridas = {(j.get("league") or {}).get("id"): (j.get("league") or {}).get("season") for j in jogos
                      if ((j.get("league") or {}).get("name") or "").lower() == "serie a"}
    liga_rodada, liga = [], []
    for lid, temp in ligas_corridas.items():
        nome, idade = f"liga_{lid}", _idade(f"liga_{lid}") or timedelta(days=999)
        tarefa = (nome, "matches", {"leagueId": lid, "season": temp or config.SEASON})
        if jogos_sem_resultado(nome) and idade >= timedelta(hours=HORAS_LIGA_RODADA):
            liga_rodada.append(tarefa)  # rodada terminou: vem antes de tudo
        elif idade >= timedelta(hours=HORAS_LIGA):
            liga.append(tarefa)
    return liga_rodada + escalacoes[:5] + liga + perfis[:5] + escalacoes[5:] + tabelas + copas(jogos) + perfis[5:] + carreiras


COPAS = ("libertadores", "copa do brasil")


def copas(jogos: list[dict]) -> list[tuple[str, str, dict]]:
    """Copas com mata-mata: baixa se nunca baixou ou, com jogo ainda por acontecer, a cada HORAS_LIGA."""
    ids = {(j.get("league") or {}).get("id"): (j.get("league") or {}).get("season") for j in jogos
           if any(c in ((j.get("league") or {}).get("name") or "").lower() for c in COPAS)}
    saida = []
    for lid, temp in ids.items():
        nome = f"copa_{lid}"
        salvo = ler_raw(nome)
        aberto = salvo is None or salvo.get("_parcial") or any(_status(m) not in config.STATUS_ENCERRADO for m in salvo.get("data") or [])
        if aberto and (_idade(nome) or timedelta(days=999)) >= timedelta(hours=HORAS_LIGA):
            saida.append((nome, "matches", {"leagueId": lid, "season": temp or config.SEASON}))
    return saida


def cmd_extras(api: ClienteHighlightly) -> int:
    lista = ler_raw(ARQ_JOGOS)
    pendentes = tarefas(lista["data"]) if lista else []
    if not pendentes:
        print("Extras (escalações, tabelas, carreiras): nada a renovar.")
        return 0
    feitas = defaultdict(int)  # por tipo: escalacao, tabela, carreira
    folga = RESERVA_DIA_DE_JOGO if dia_de_jogo(lista["data"]) else 0
    adiados = 0
    for nome, caminho, params in pendentes:
        essencial = nome.startswith("liga_") and jogos_sem_resultado(nome)
        reserva = _reserva() + (0 if essencial else folga)
        if api.restantes_hoje is not None and api.restantes_hoje - 1 < reserva:
            if essencial or not folga:
                print("Extras: cota do dia no fim; o resto fica para a próxima coleta.")
                break
            adiados += 1
            continue
        try:
            if nome.startswith(("liga_", "copa_")):
                _salvar(nome, _todas_as_paginas(api, caminho, params))
            else:
                _salvar(nome, api.get(caminho, **params))
        except ErroAPI as e:  # ex.: competição sem tabela (mata-mata) ou jogo sem escalação: guarda vazio para não insistir
            print(f"  {nome}: {e}")
            _salvar(nome, None)
        feitas[nome.split("_")[0]] += 1
    if adiados:
        print(f"Extras: {adiados} adiados para guardar {folga} requisições para depois do jogo do Flamengo.")
    print("Extras: " + (", ".join(f"{n} {t}" for t, n in feitas.items()) or "nenhum") + ".")
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


def linhas_escalacoes(ids_partidas=None, team_id: int | None = None) -> tuple[list[dict], dict]:
    """Escalações (titulares por linha do campo + banco) e {jogo: (formação do Flamengo, do adversário)}.
    Sem lista de ids, usa todas as salvas (inclui o último jogo dos próximos adversários: provável escalação)."""
    team_id = team_id or config.TEAM_ID
    linhas, formacoes = [], {}
    if ids_partidas is None:
        ids_partidas = sorted(int(a.stem.removeprefix("escalacao_")) for a in config.RAW_DIR.glob("escalacao_*.json"))
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
    # A lista do Flamengo é renovada a cada coleta e o arquivo da liga não: o resultado do jogo do Flamengo
    # entra na tabela mesmo antes de a liga ser baixada de novo (mesmo id de jogo nas duas listas).
    do_fla = {j["id"]: j for j in jogos_fla if _status(j) in config.STATUS_ENCERRADO}
    for arq in config.RAW_DIR.glob("liga_*.json"):
        lid = int(arq.stem.removeprefix("liga_"))
        for m in (ler_raw(arq.stem) or {}).get("data") or []:
            if _status(m) not in config.STATUS_ENCERRADO and m["id"] in do_fla:
                m = do_fla[m["id"]]
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


def info_liga(jogos_fla: list[dict]) -> dict | None:
    """Quando o arquivo da liga foi baixado e quantos jogos já terminaram sem resultado (mostrado no painel).

    Jogos do Flamengo não contam: o resultado deles vem da lista do Flamengo (ver `linhas_liga`)."""
    arqs = sorted(config.RAW_DIR.glob("liga_*.json"))
    if not arqs:
        return None
    salvo = ler_raw(arqs[0].stem) or {}
    do_fla = {j["id"] for j in jogos_fla if _status(j) in config.STATUS_ENCERRADO}
    return {"coletado_em": salvo.get("_coletado_em"), "sem_resultado": jogos_sem_resultado(arqs[0].stem, ignorar=do_fla)}


ORDEM_FASES = ["Round of 64", "Round of 32", "Round of 16", "Quarter-finals", "Semi-finals", "Final"]


def linhas_mata_mata(jogos_fla: list[dict]) -> list[dict]:
    """Jogos das fases eliminatórias das copas (sem fase de grupos nem preliminares), para o chaveamento."""
    from .highlightly import _placar, rodada
    nomes = {(j.get("league") or {}).get("id"): (j.get("league") or {}).get("name") for j in jogos_fla}
    linhas = []
    for arq in config.RAW_DIR.glob("copa_*.json"):
        lid = int(arq.stem.removeprefix("copa_"))
        for m in (ler_raw(arq.stem) or {}).get("data") or []:
            fase = m.get("round")
            if fase not in ORDEM_FASES:
                continue
            score = (m.get("state") or {}).get("score") or {}
            casa, fora = _placar(score.get("current"))
            pen_casa, pen_fora = _placar(score.get("penalties"))
            status = _status(m)
            fim = status in config.STATUS_ENCERRADO
            linhas.append({
                "competicao_id": lid, "competicao": nomes.get(lid, (m.get("league") or {}).get("name")),
                "id_partida": m["id"], "data_utc": m["date"].replace(".000Z", "+00:00").replace("Z", "+00:00"),
                "fase": rodada(fase), "ordem_fase": ORDEM_FASES.index(fase), "status": status,
                "casa_id": m["homeTeam"]["id"], "casa": m["homeTeam"]["name"], "casa_logo": m["homeTeam"].get("logo"),
                "fora_id": m["awayTeam"]["id"], "fora": m["awayTeam"]["name"], "fora_logo": m["awayTeam"].get("logo"),
                "gols_casa": casa if fim else None, "gols_fora": fora if fim else None,
                "penaltis_casa": pen_casa if fim else None, "penaltis_fora": pen_fora if fim else None,
            })
    return linhas


POSICAO_DETALHADA = {
    "Goalkeeper": ("Goleiro", "Goleiros"), "Centre-Back": ("Zagueiro", "Defensores"), "Left-Back": ("Lateral-esquerdo", "Defensores"),
    "Right-Back": ("Lateral-direito", "Defensores"), "Defensive Midfield": ("Volante", "Meio-campo"),
    "Central Midfield": ("Meio-campista", "Meio-campo"), "Attacking Midfield": ("Meia-atacante", "Meio-campo"),
    "Left Midfield": ("Meia-esquerda", "Meio-campo"), "Right Midfield": ("Meia-direita", "Meio-campo"),
    "Left Winger": ("Ponta-esquerda", "Atacantes"), "Right Winger": ("Ponta-direita", "Atacantes"),
    "Centre-Forward": ("Centroavante", "Atacantes"), "Second Striker": ("Segundo atacante", "Atacantes"),
}
PAISES = {"Brazil": "Brasil", "Uruguay": "Uruguai", "Argentina": "Argentina", "Chile": "Chile", "Colombia": "Colômbia",
          "Ecuador": "Equador", "Paraguay": "Paraguai", "Peru": "Peru", "Venezuela": "Venezuela", "Portugal": "Portugal",
          "Spain": "Espanha", "Italy": "Itália", "France": "França", "Germany": "Alemanha", "England": "Inglaterra", "Belgium": "Bélgica", "Netherlands": "Holanda", "Mexico": "México", "Bolivia": "Bolívia", "United States": "Estados Unidos", "Japan": "Japão", "Croatia": "Croácia"}
PES = {"right": "Direito", "left": "Esquerdo", "both": "Ambos"}


def _data_br(texto: str | None) -> str | None:
    """'31/12/2027' ou '12.12.2025' → '2027-12-31'."""
    if not texto:
        return None
    for fmt in ("%d/%m/%Y", "%d.%m.%Y", "%b %d, %Y"):
        try:
            return datetime.strptime(texto.strip(), fmt).date().isoformat()
        except ValueError:
            continue
    return None


def linhas_perfis() -> list[dict]:
    """Ficha de cada jogador (perfil da fonte, com dados do Transfermarkt): contrato, valor de mercado, idade etc."""
    hoje = _agora().date().isoformat()
    linhas = []
    for arq in config.RAW_DIR.glob("perfil_*.json"):
        dados = (ler_raw(arq.stem) or {}).get("data")
        dados = dados[0] if isinstance(dados, list) and dados else dados
        if not dados:
            continue
        perfil = dados.get("profile") or {}
        clube = perfil.get("club") or {}
        valores = sorted(dados.get("marketValue") or [], key=lambda v: _data_br(v.get("recordedDate")) or "", reverse=True)
        lesoes = dados.get("injuries") or []
        atual = next((l for l in lesoes if (_data_br(l.get("toDate")) or "9999") >= hoje and (_data_br(l.get("fromDate")) or "") <= hoje), None)
        pos = (perfil.get("position") or {})
        detalhada, grupo = POSICAO_DETALHADA.get(pos.get("main"), (pos.get("main"), None))
        achou = re.search(r"(\d)[,.](\d{2})", perfil.get("height") or "")  # "1,85 m" (às vezes com espaço especial)
        altura = float(f"{achou.group(1)}.{achou.group(2)}") if achou else None
        linhas.append({
            "jogador_id": dados["id"], "jogador": dados.get("name"), "nome_completo": perfil.get("fullName") or dados.get("fullName"),
            "nascimento": _data_br(perfil.get("birthDate")), "naturalidade": perfil.get("birthPlace"),
            "nacionalidade": ", ".join(PAISES.get(x.strip(), x.strip()) for x in (perfil.get("citizenship") or "").split(",") if x.strip()) or None,
            "altura": altura,
            "pe": PES.get(perfil.get("foot"), perfil.get("foot")),
            "posicao_detalhada": detalhada, "grupo": grupo,
            "posicao_secundaria": ", ".join(POSICAO_DETALHADA.get(x.strip(), (x.strip(), None))[0]
                                            for x in (pos.get("secondary") or "").split(",") if x.strip()) or None,
            "clube_atual": clube.get("current"), "no_clube_desde": _data_br(clube.get("joinedAt")),
            "contrato_ate": _data_br(clube.get("contractExpiry")), "renovado_em": _data_br(clube.get("latestContractExtension")),
            "valor_mercado": valores[0].get("value") if valores else None,
            "valor_data": _data_br(valores[0].get("recordedDate")) if valores else None,
            "valor_anterior": valores[1].get("value") if len(valores) > 1 else None,
            "valor_maximo": max((v.get("value") or 0 for v in valores), default=None),
            "lesao_atual": atual.get("reason") if atual else None,
            "lesao_volta": _data_br(atual.get("toDate")) if atual else None,
            "atualizado_em": (ler_raw(arq.stem) or {}).get("_coletado_em"),
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
