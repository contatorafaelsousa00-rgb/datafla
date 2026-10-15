"""Responde, a partir dos dados reais baixados, as dúvidas que a documentação não esclarece.

    python -m coleta.coletar inspecionar

Cada pergunta é decidida por evidência nos próprios jogos (não por suposição):
1. Na substituição, `player` é quem sai ou quem entra?
2. O evento de gol contra vem com o time de quem marcou contra ou de quem se beneficiou?
3. `passes.accuracy` em /fixtures/players é contagem de passes certos ou porcentagem?
4. Em quais competições existe `expected_goals` (xG)?
"""

from __future__ import annotations

from collections import Counter, defaultdict

from . import config


def _jogadores(partida):
    """{player_id: (time_id, stats)} a partir do bloco players."""
    out = {}
    for bloco in partida.get("players", []):
        for item in bloco.get("players", []):
            out[item["player"]["id"]] = (bloco["team"]["id"], (item.get("statistics") or [{}])[0])
    return out


def substituicao(partidas) -> dict:
    """Conta quantas vezes `player` é titular (sai) e `assist` é reserva (entra)."""
    votos = Counter()
    for p in partidas:
        js = _jogadores(p)
        for e in p.get("events", []):
            if e.get("type") != "subst":
                continue
            pid, aid = (e.get("player") or {}).get("id"), (e.get("assist") or {}).get("id")
            if pid not in js or aid not in js:
                votos["sem_dados"] += 1
                continue
            p_titular = js[pid][1].get("games", {}).get("substitute") is False
            a_titular = js[aid][1].get("games", {}).get("substitute") is False
            # Titular nunca entra; reserva que é substituído já tinha entrado antes (raro).
            if p_titular and not a_titular:
                votos["player_sai"] += 1
            elif a_titular and not p_titular:
                votos["player_entra"] += 1
            else:
                votos["ambiguo"] += 1
    return dict(votos)


def gol_contra(partidas) -> dict:
    """Compara o time do evento com o time que ficou com o gol a mais no placar."""
    votos = Counter()
    for p in partidas:
        contras = [e for e in p.get("events", []) if e.get("type") == "Goal" and (e.get("detail") or "").lower() == "own goal"]
        if not contras:
            continue
        js = _jogadores(p)
        gols_jog = defaultdict(int)
        for time_id, st in js.values():
            gols_jog[time_id] += (st.get("goals") or {}).get("total") or 0
        sobra = {}
        for lado in ("home", "away"):
            tid = p["teams"][lado]["id"]
            sobra[tid] = (p["goals"][lado] or 0) - gols_jog[tid]
        beneficiados = {tid for tid, s in sobra.items() if s > 0}
        for e in contras:
            tid = e["team"]["id"]
            if beneficiados == {tid}:
                votos["time_beneficiado"] += 1
            elif beneficiados and tid not in beneficiados:
                votos["time_de_quem_marcou_contra"] += 1
            else:
                votos["ambiguo"] += 1
    return dict(votos)


def precisao_passes(partidas) -> dict:
    """Se accuracy > total em algum jogador, é porcentagem; se nunca passa do total, é contagem."""
    acima, abaixo, exemplos = 0, 0, []
    for p in partidas:
        for _, st in _jogadores(p).values():
            pa = st.get("passes") or {}
            tot, acc = pa.get("total"), pa.get("accuracy")
            if tot in (None, 0) or acc in (None, ""):
                continue
            try:
                acc = float(str(acc).rstrip("%"))
            except ValueError:
                continue
            if acc > tot:
                acima += 1
            else:
                abaixo += 1
            if len(exemplos) < 5:
                exemplos.append((tot, pa.get("accuracy")))
    return {"accuracy_maior_que_total": acima, "accuracy_ate_total": abaixo, "exemplos": exemplos}


def xg_por_competicao(partidas) -> dict:
    cont = defaultdict(lambda: [0, 0])
    for p in partidas:
        if p["fixture"]["status"]["short"] not in config.STATUS_ENCERRADO:
            continue
        nome = p["league"]["name"]
        cont[nome][1] += 1
        tem = any(st.get("type") == "expected_goals" and st.get("value") not in (None, "")
                  for bloco in p.get("statistics", []) for st in bloco.get("statistics", []))
        cont[nome][0] += tem
    return {k: tuple(v) for k, v in cont.items()}


def _veredito(votos: dict, a: str, b: str) -> str:
    va, vb = votos.get(a, 0), votos.get(b, 0)
    if va + vb == 0:
        return "sem casos suficientes ainda"
    vence, perde = (a, b) if va >= vb else (b, a)
    return f"{vence} ({max(va, vb)} de {va + vb} casos{'; CONFLITO, revisar' if min(va, vb) else ''})"


def relatorio(partidas) -> str:
    sub, gc, pas, xg = substituicao(partidas), gol_contra(partidas), precisao_passes(partidas), xg_por_competicao(partidas)
    if pas["accuracy_maior_que_total"]:
        veredito_passes = "porcentagem (há accuracy maior que o total de passes)"
    elif pas["accuracy_ate_total"]:
        veredito_passes = "provavelmente contagem de passes certos (nunca passa do total)"
    else:
        veredito_passes = "sem dados"
    linhas = [
        f"# Inspeção dos dados reais — temporada {config.SEASON}",
        "",
        f"{len(partidas)} jogos analisados.",
        "",
        "| Pergunta | Resposta pelos dados | Contagem |",
        "|---|---|---|",
        f"| Substituição: `player` é... | {_veredito(sub, 'player_sai', 'player_entra')} | {sub} |",
        f"| Gol contra: o time do evento é... | {_veredito(gc, 'time_beneficiado', 'time_de_quem_marcou_contra')} | {gc} |",
        f"| `passes.accuracy` é... | {veredito_passes} | exemplos (total, accuracy): {pas['exemplos']} |",
        "",
        "## xG (`expected_goals`) por competição",
        "",
        "| Competição | Jogos com xG | Jogos encerrados |",
        "|---|---:|---:|",
    ]
    linhas += [f"| {nome} | {com} | {total} |" for nome, (com, total) in sorted(xg.items())]
    linhas += [
        "",
        "## O que ajustar no código conforme a resposta",
        "",
        "- Gol contra = `time_de_quem_marcou_contra`: inverter o lado em `site/app.js` (gols por faixa) e em `normalizar.linhas_eventos`.",
        "- `passes.accuracy` = contagem: renomear `passes_precisao_api` para `passes_certos` em `normalizar.py`; se for %, para `passes_pct`.",
        "- Substituição = `player_entra`: trocar a ordem do texto \"sai ⇄ entra\" no detalhe do jogo em `site/app.js`.",
    ]
    return "\n".join(linhas) + "\n"
