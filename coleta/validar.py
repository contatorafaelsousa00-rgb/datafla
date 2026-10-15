"""Checagens de qualidade sobre as tabelas normalizadas.

Duas partes:
1. Coerência interna: regras que os próprios dados precisam cumprir
   (gols somam o placar, minutos fecham com a duração do jogo etc.).
2. Completude: quanto de cada tipo de dado existe, por competição.

Nada aqui substitui a comparação com a súmula oficial; serve para achar
rapidamente os jogos que merecem ser conferidos à mão.
"""

from __future__ import annotations

from collections import defaultdict

from . import config

OK, ALERTA, ERRO = "ok", "alerta", "erro"
CARTOES_VERMELHOS = {"Red Card", "Second Yellow card", "Second Yellow Card"}


def _agrupar(linhas, *chaves):
    grupos = defaultdict(list)
    for l in linhas:
        grupos[tuple(l[c] for c in chaves)].append(l)
    return grupos


def _z(v):
    return v or 0


def checar_partida(partida, jogadores, eventos, estatisticas) -> list[dict]:
    """Roda todas as regras de coerência para os dois times de uma partida."""
    pid, dur = partida["id_partida"], partida["duracao"]
    resultados = []

    def reg(time_id, regra, status, detalhe):
        resultados.append({
            "id_partida": pid,
            "data_utc": partida["data_utc"],
            "competicao": partida["competicao"],
            "adversario": partida["adversario"],
            "time": "Flamengo" if time_id == config.TEAM_ID else partida["adversario"],
            "regra": regra,
            "status": status,
            "detalhe": detalhe,
        })

    gols_time = {
        config.TEAM_ID: partida["gols_pro"],
        partida["adversario_id"]: partida["gols_contra"],
    }
    gols_contra_evento = sum(
        1 for e in eventos if e["tipo"] == "Goal" and (e["detalhe"] or "").lower() == "own goal"
    )
    stat_time = {
        (s["time_id"], s["estatistica"]): s["valor"] for s in estatisticas
    }

    for time_id, gols in gols_time.items():
        js = [j for j in jogadores if j["time_id"] == time_id]
        if not js:
            # O painel é do Flamengo: falta de dados do adversário não é erro.
            if time_id == config.TEAM_ID:
                reg(time_id, "escalacao", ERRO, "sem jogadores do Flamengo")
            continue

        # 1. Gols dos jogadores somam o placar (gols contra explicam diferença)
        soma_gols = sum(_z(j["gols"]) for j in js)
        dif = _z(gols) - soma_gols
        if dif == 0:
            reg(time_id, "gols", OK, f"{soma_gols} = placar")
        elif 0 < dif <= gols_contra_evento:
            reg(time_id, "gols", OK, f"{soma_gols} + {dif} gol(s) contra = placar")
        else:
            reg(time_id, "gols", ERRO, f"jogadores somam {soma_gols}, placar {gols}")

        # 2. Titulares
        titulares = [j for j in js if j["titular"]]
        if len(titulares) != 11:
            reg(time_id, "titulares", ERRO, f"{len(titulares)} titulares")
        else:
            reg(time_id, "titulares", OK, "11 titulares")
        sem_minuto = [j["jogador"] for j in titulares if not j["minutos"]]
        if sem_minuto:
            reg(time_id, "titulares_sem_minutos", ALERTA, ", ".join(sem_minuto))

        # 3. Substituições dentro do limite (5, +1 na prorrogação; concussão pode somar 2)
        entraram = [j for j in js if not j["titular"] and _z(j["minutos"]) > 0]
        limite = 5 + (1 if dur == 120 else 0)
        if len(entraram) > limite + 2:
            reg(time_id, "substituicoes", ERRO, f"{len(entraram)} reservas com minutos")
        elif len(entraram) > limite:
            reg(time_id, "substituicoes", ALERTA, f"{len(entraram)} (possível concussão)")
        else:
            reg(time_id, "substituicoes", OK, f"{len(entraram)} reservas entraram")

        subs_evento = sum(1 for e in eventos if e["time_id"] == time_id and e["tipo"] == "subst")
        if subs_evento != len(entraram):
            reg(time_id, "substituicoes_vs_eventos", ALERTA,
                f"{subs_evento} eventos de substituição, {len(entraram)} reservas com minutos")

        # 4. Soma de minutos fecha com 11 x duração, descontando expulsões.
        # Algumas fontes contam os acréscimos nos minutos (jogo de 96 min): a duração real
        # é o maior tempo jogado por um atleta, nunca menos que a regulamentar.
        if any(j["minutos"] is None for j in titulares):
            reg(time_id, "minutos", ALERTA, "minutagem ausente em algum titular")
        else:
            dur_real = max([dur] + [_z(j["minutos"]) for j in js])
            perdidos = sum(
                max(0, dur_real - _z(e["minuto"]))
                for e in eventos
                if e["time_id"] == time_id and e["tipo"] == "Card" and e["detalhe"] in CARTOES_VERMELHOS
            )
            esperado = 11 * dur_real - perdidos
            soma = sum(_z(j["minutos"]) for j in js)
            dif = soma - esperado
            status = OK if abs(dif) <= 15 else ALERTA if abs(dif) <= 45 else ERRO
            reg(time_id, "minutos", status, f"soma {soma}, esperado ~{esperado} ({dif:+d})")

        # 5. Finalizações dos jogadores x total do time
        total_time = stat_time.get((time_id, "finalizacoes"))
        if total_time is not None:
            soma_fin = sum(_z(j["finalizacoes"]) for j in js)
            dif = soma_fin - total_time
            status = OK if abs(dif) <= 2 else ALERTA
            reg(time_id, "finalizacoes", status, f"jogadores {soma_fin}, time {total_time}")

    return resultados


def completude(partida, jogadores, estatisticas) -> dict:
    fla = [j for j in jogadores if j["eh_flamengo"]]
    fla_stats = {s["estatistica"]: s["valor"] for s in estatisticas if s["eh_flamengo"]}
    return {
        "id_partida": partida["id_partida"],
        "competicao": partida["competicao"],
        "escalacao": bool(fla),
        "minutagem": bool(fla) and all(j["minutos"] is not None for j in fla if j["titular"]),
        # A API usa null tanto para "zero" quanto para "não coletado"; passes
        # quase nunca são zero para o time inteiro, então servem de sinal.
        "estatisticas_jogador": any(j["passes"] is not None for j in fla),
        "nota": any(j["nota"] is not None for j in fla),
        "estatisticas_time": bool(fla_stats),
        "xg": fla_stats.get("xg") is not None,
    }


def validar(tabelas: dict[str, list[dict]]) -> dict:
    jog = _agrupar(tabelas["jogadores_partida"], "id_partida")
    eve = _agrupar(tabelas["eventos"], "id_partida")
    est = _agrupar(tabelas["estatisticas_time"], "id_partida")

    checagens, completudes = [], []
    for p in tabelas["partidas"]:
        if p["status"] not in config.STATUS_ENCERRADO:
            continue
        chave = (p["id_partida"],)
        completudes.append(completude(p, jog.get(chave, []), est.get(chave, [])))
        checagens += checar_partida(p, jog.get(chave, []), eve.get(chave, []), est.get(chave, []))
    return {"checagens": checagens, "completude": completudes}


CAMPOS_COMPLETUDE = ["escalacao", "minutagem", "estatisticas_jogador", "nota", "estatisticas_time", "xg"]


def relatorio_markdown(resultado: dict) -> str:
    por_comp = _agrupar(resultado["completude"], "competicao")
    linhas = [
        "# Validação dos dados — Flamengo",
        "",
        "## Completude por competição (% dos jogos encerrados)",
        "",
        "| Competição | Jogos | " + " | ".join(CAMPOS_COMPLETUDE) + " |",
        "|---|---:|" + "---:|" * len(CAMPOS_COMPLETUDE),
    ]
    for (comp,), itens in sorted(por_comp.items()):
        pcts = [f"{100 * sum(i[c] for i in itens) / len(itens):.0f}%" for c in CAMPOS_COMPLETUDE]
        linhas.append(f"| {comp} | {len(itens)} | " + " | ".join(pcts) + " |")

    contagem = defaultdict(lambda: {OK: 0, ALERTA: 0, ERRO: 0})
    for c in resultado["checagens"]:
        contagem[c["regra"]][c["status"]] += 1
    linhas += ["", "## Regras de coerência", "", "| Regra | ok | alerta | erro |", "|---|---:|---:|---:|"]
    for regra, n in sorted(contagem.items()):
        linhas.append(f"| {regra} | {n[OK]} | {n[ALERTA]} | {n[ERRO]} |")

    problemas = [c for c in resultado["checagens"] if c["status"] != OK]
    linhas += ["", f"## Jogos para conferir na súmula ({len(problemas)} apontamentos)", ""]
    if problemas:
        linhas += ["| Data | Competição | Jogo | Time | Regra | Status | Detalhe |", "|---|---|---|---|---|---|---|"]
        for c in sorted(problemas, key=lambda c: (c["data_utc"], c["regra"])):
            linhas.append(
                f"| {c['data_utc'][:10]} | {c['competicao']} | x {c['adversario']} | {c['time']} "
                f"| {c['regra']} | {c['status']} | {c['detalhe']} |"
            )
    else:
        linhas.append("Nenhum problema encontrado.")
    return "\n".join(linhas) + "\n"
