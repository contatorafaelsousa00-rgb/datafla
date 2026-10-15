"""Gera uma temporada FICTÍCIA no formato da API-Football, só para testar o painel.

    python scripts/gerar_demo.py

Gera duas temporadas (2025 encerrada e 2026 em andamento) em data-demo/ e site/dados-demo/,
ambos fora do Git. Abra o site com ?demo=1.
Nada aqui representa jogos ou jogadores reais.
"""

from __future__ import annotations

import json
import os
import random
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FLA = 127
HOJE = datetime(2026, 10, 15, tzinfo=timezone.utc)
rnd = random.Random(2026)

POS = ["G"] * 3 + ["D"] * 9 + ["M"] * 9 + ["F"] * 7
ELENCO = [{"id": 9000 + i, "name": f"Atleta {i + 1:02d}", "number": i + 1, "pos": p,
           "age": rnd.randint(19, 35), "peso": rnd.random()} for i, p in enumerate(POS)]

# (nome na API, id, nº de jogos, (mês, dia) de início, intervalo em dias, tem estatística de jogador, tem xG)
COMPETICOES = {
    2026: [
        ("Carioca - 1", 624, 10, (1, 14), 5, False, False),
        ("Super Cup", 732, 1, (2, 1), 1, True, True),
        ("Recopa Sudamericana", 541, 2, (2, 19), 7, True, True),
        ("Serie A", 71, 38, (4, 1), 6, True, True),
        ("CONMEBOL Libertadores", 13, 10, (4, 8), 14, True, True),
        ("Copa Do Brasil", 73, 4, (5, 6), 21, True, False),
    ],
    2025: [
        ("Carioca - 1", 624, 12, (1, 12), 5, False, False),
        ("Super Cup", 732, 1, (2, 2), 1, True, True),
        ("Serie A", 71, 38, (3, 29), 6, True, True),
        ("CONMEBOL Libertadores", 13, 13, (4, 2), 14, True, True),
        ("Copa Do Brasil", 73, 6, (4, 30), 21, True, False),
    ],
}
RIVAIS = [f"Rival {c}" for c in "ABCDEFGHIJKLMNOPQRST"]


def escolher_titulares():
    def top(pos, n):
        cands = [j for j in ELENCO if j["pos"] == pos]
        return sorted(cands, key=lambda j: j["peso"] + rnd.random() * 0.6, reverse=True)[:n]
    return top("G", 1) + top("D", 4) + top("M", 3) + top("F", 3)


def stats_jogador(j, minutos, titular, completo):
    nulo = None if not completo else 0
    escala = minutos / 90
    return {
        "games": {"minutes": minutos or None, "number": j["number"], "position": j["pos"],
                  "rating": f"{rnd.uniform(6.0, 8.3):.1f}" if completo and minutos else None,
                  "captain": False, "substitute": not titular},
        "offsides": None,
        "shots": {"total": 0, "on": 0},
        "goals": {"total": 0, "conceded": 0, "assists": 0, "saves": rnd.randint(0, 5) if j["pos"] == "G" and completo else None},
        "passes": {"total": int(rnd.uniform(15, 70) * escala) if completo and minutos else None,
                   "key": int(rnd.uniform(0, 3) * escala) if completo else None, "accuracy": None},
        "tackles": {"total": int(rnd.uniform(0, 4) * escala) if completo else None, "blocks": nulo, "interceptions": nulo},
        "duels": {"total": int(rnd.uniform(2, 14) * escala) if completo else None, "won": None},
        "dribbles": {"attempts": nulo, "success": nulo, "past": None},
        "fouls": {"drawn": nulo, "committed": nulo},
        "cards": {"yellow": 0, "red": 0},
        "penalty": {"won": None, "commited": None, "scored": 0, "missed": 0, "saved": None},
    }


def jogo(fid, comp, data, encerrado):
    nome, lid, _, _, _, completo, tem_xg = comp
    casa = rnd.random() < 0.5
    rival = {"id": 5000 + RIVAIS.index(r := rnd.choice(RIVAIS)), "name": r}
    fla = {"id": FLA, "name": "Flamengo"}
    base = {
        "fixture": {"id": fid, "date": data.isoformat(), "referee": "Árbitro Fictício",
                    "status": {"short": "FT" if encerrado else "NS"},
                    "venue": {"name": "Estádio Casa" if casa else "Estádio Fora", "city": "Cidade"}},
        "league": {"id": lid, "name": nome, "round": "Rodada"},
        "teams": {"home": fla if casa else rival, "away": rival if casa else fla},
        "goals": {"home": None, "away": None},
        "score": {"halftime": {"home": None, "away": None}, "penalty": {"home": None, "away": None}},
    }
    if not encerrado:
        return base, None

    titulares = escolher_titulares()
    reservas = [j for j in ELENCO if j not in titulares]
    n_subs = rnd.randint(3, 5)
    saem = rnd.sample([t for t in titulares if t["pos"] != "G"], n_subs)
    entram = rnd.sample([r for r in reservas if r["pos"] != "G"], n_subs)
    minutos = {t["id"]: 90 for t in titulares}
    eventos = []
    for s, e in zip(saem, entram):
        m = rnd.randint(46, 85)
        minutos[s["id"]], minutos[e["id"]] = m, 90 - m
        eventos.append({"time": {"elapsed": m, "extra": None}, "team": {"id": FLA}, "player": {"id": s["id"], "name": s["name"]},
                        "assist": {"id": e["id"], "name": e["name"]}, "type": "subst", "detail": "Substitution", "comments": None})

    jogaram = [j for j in ELENCO if minutos.get(j["id"])]
    st = {j["id"]: stats_jogador(j, minutos.get(j["id"], 0), j in titulares, completo) for j in ELENCO}
    gp = rnd.choices([0, 1, 2, 3, 4], [18, 32, 28, 15, 7])[0] + (1 if casa and rnd.random() < 0.2 else 0)
    gc = rnd.choices([0, 1, 2, 3], [38, 36, 19, 7])[0]
    linha = [j for j in jogaram if j["pos"] != "G"]
    for k in range(gp):
        autor = rnd.choices(linha, [3 if j["pos"] == "F" else 1.5 if j["pos"] == "M" else 0.4 for j in linha])[0]
        st[autor["id"]]["goals"]["total"] += 1
        garcom = rnd.choice([j for j in linha if j is not autor])
        if rnd.random() < 0.7:
            st[garcom["id"]]["goals"]["assists"] += 1
        eventos.append({"time": {"elapsed": rnd.randint(1, 90), "extra": None}, "team": {"id": FLA},
                        "player": {"id": autor["id"], "name": autor["name"]}, "assist": {"id": garcom["id"], "name": garcom["name"]},
                        "type": "Goal", "detail": "Normal Goal", "comments": None})
    for k in range(gc):
        eventos.append({"time": {"elapsed": rnd.randint(1, 90), "extra": None}, "team": {"id": rival["id"]},
                        "player": {"id": 8000 + k, "name": f"Adversário {k + 1}"}, "assist": {"id": None, "name": None},
                        "type": "Goal", "detail": "Normal Goal", "comments": None})
    for j in rnd.sample(jogaram, rnd.randint(0, 3)):
        st[j["id"]]["cards"]["yellow"] = 1
        eventos.append({"time": {"elapsed": rnd.randint(10, 90), "extra": None}, "team": {"id": FLA},
                        "player": {"id": j["id"], "name": j["name"]}, "assist": {"id": None, "name": None},
                        "type": "Card", "detail": "Yellow Card", "comments": None})

    total_chutes = 0
    for j in jogaram:
        peso = 3 if j["pos"] == "F" else 1.5 if j["pos"] == "M" else 0.4 if j["pos"] == "D" else 0
        n = max(st[j["id"]]["goals"]["total"], int(rnd.uniform(0, 2.2) * peso * minutos[j["id"]] / 90))
        st[j["id"]]["shots"] = {"total": n, "on": max(st[j["id"]]["goals"]["total"], n // 2)}
        total_chutes += n
    eventos.sort(key=lambda e: e["time"]["elapsed"])

    gols_1t_p = sum(1 for e in eventos if e["type"] == "Goal" and e["team"]["id"] == FLA and e["time"]["elapsed"] <= 45)
    gols_1t_c = sum(1 for e in eventos if e["type"] == "Goal" and e["team"]["id"] != FLA and e["time"]["elapsed"] <= 45)
    nos, eles = ("home", "away") if casa else ("away", "home")
    base["goals"] = {nos: gp, eles: gc}
    base["score"]["halftime"] = {nos: gols_1t_p, eles: gols_1t_c}

    def stats_time(chutes, xg):
        s = [{"type": "Total Shots", "value": chutes}, {"type": "Shots on Goal", "value": chutes // 2},
             {"type": "Ball Possession", "value": f"{rnd.randint(42, 66)}%"}, {"type": "Corner Kicks", "value": rnd.randint(2, 10)}]
        if tem_xg:
            s.append({"type": "expected_goals", "value": f"{xg:.2f}"})
        return s
    chutes_adv = rnd.randint(5, 15)
    base["events"] = eventos
    base["lineups"] = [{"team": {"id": FLA}, "formation": rnd.choice(["4-3-3", "4-2-3-1", "4-4-2"]), "coach": {"name": "Técnico Fictício"}}]
    base["statistics"] = [
        {"team": {"id": FLA}, "statistics": stats_time(total_chutes, total_chutes * rnd.uniform(0.08, 0.14))},
        {"team": {"id": rival["id"]}, "statistics": stats_time(chutes_adv, chutes_adv * rnd.uniform(0.07, 0.13))},
    ]
    relacionados = titulares + rnd.sample([r for r in reservas if r not in entram], 7) + entram
    base["players"] = [{"team": {"id": FLA}, "players": [
        {"player": {"id": j["id"], "name": j["name"]}, "statistics": [st[j["id"]]]} for j in relacionados]}]
    return base, base


def gerar(ano):
    global rnd
    rnd = random.Random(ano)
    raw = ROOT / "data-demo" / str(ano) / "raw"
    raw.mkdir(parents=True, exist_ok=True)
    for f in raw.glob("*.json"):
        f.unlink()
    lista, fid = [], ano * 1000
    for comp in COMPETICOES[ano]:
        _, _, n, (mes, dia), passo, _, _ = comp
        inicio = datetime(ano, mes, dia)
        for k in range(n):
            data = (inicio + timedelta(days=passo * k, hours=21)).replace(tzinfo=timezone.utc)
            fid += 1
            resumo, detalhe = jogo(fid, comp, data, data < HOJE)
            lista.append(resumo)
            if detalhe:
                detalhe["_coletado_em"] = (data + timedelta(days=3)).isoformat()
                (raw / f"partida_{fid}.json").write_text(json.dumps(detalhe, ensure_ascii=False), encoding="utf-8")

    # Duas falhas de propósito, para a página de qualidade ter o que mostrar.
    falhas = sorted(raw.glob("partida_*.json"))[12:14]
    for k, f in enumerate(falhas):
        d = json.loads(f.read_text(encoding="utf-8"))
        if k == 0:
            d["players"][0]["players"][0]["statistics"][0]["games"]["minutes"] = None
        else:
            d["statistics"][0]["statistics"][0]["value"] += 6
        f.write_text(json.dumps(d, ensure_ascii=False), encoding="utf-8")

    (raw / "jogos.json").write_text(json.dumps({"response": lista}, ensure_ascii=False), encoding="utf-8")
    if ano == HOJE.year:  # a API só tem o elenco atual
        (raw / "elenco.json").write_text(json.dumps({"response": [{"team": {"id": FLA}, "players": [
            {"id": j["id"], "name": j["name"], "age": j["age"], "number": j["number"],
             "position": {"G": "Goalkeeper", "D": "Defender", "M": "Midfielder", "F": "Attacker"}[j["pos"]], "photo": None}
            for j in ELENCO]}]}, ensure_ascii=False), encoding="utf-8")

    env = dict(os.environ, FLA_DATA_DIR=str(ROOT / "data-demo"), FLA_SITE_DADOS=str(ROOT / "site" / "dados-demo"), FLA_DEMO="1")
    subprocess.run([sys.executable, "-m", "coleta.coletar", "processar", "--temporada", str(ano)], cwd=ROOT, env=env, check=True)


def main():
    for ano in COMPETICOES:
        gerar(ano)


if __name__ == "__main__":
    main()
