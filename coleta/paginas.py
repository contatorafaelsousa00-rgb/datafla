"""Páginas estáticas por jogo (site/jogo/<id>.html) + sitemap.xml + robots.txt.

O painel é uma página só, montada no navegador: o WhatsApp/X/Google não rodam o JavaScript, então um link de jogo mostrava
a prévia genérica do site. Cada jogo ganha uma página leve com título e descrição próprios (placar, gols, xG ou, antes do
jogo, data e chances) que leva o visitante para a tela do jogo no painel. Geradas por `processar` a cada deploy (fora do Git).
"""

from __future__ import annotations

import html
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

URL = "https://datafla.web.app"
BR = ZoneInfo("America/Sao_Paulo")
DIAS = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"]


def _num(v: float | None, casas: int = 2) -> str:
    return "–" if v is None else f"{v:.{casas}f}".replace(".", ",")


def _quando(iso: str) -> datetime:
    return datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(BR)


def _times(p: dict) -> tuple[str, str]:
    """Mandante × visitante (regra de exibição do painel)."""
    return ("Flamengo", p["adversario"]) if p.get("mando") != "Fora" else (p["adversario"], "Flamengo")


def _pct(v: float | None) -> str:
    return f"{round(v * 100)}%" if v is not None else "–"


def resumo_jogo(p: dict, xg: dict, gols: list[str]) -> tuple[str, str]:
    """(título, descrição) de um jogo. `p` é a linha de partidas/calendário; `xg` = {pro, contra}; `gols` = autores do Flamengo."""
    casa, fora = _times(p)
    q = _quando(p["data_utc"])
    onde = " · ".join(x for x in (p.get("competicao"), p.get("rodada")) if x)
    if p.get("gols_pro") is not None:
        gc, gf = (p["gols_pro"], p["gols_contra"]) if p.get("mando") != "Fora" else (p["gols_contra"], p["gols_pro"])
        titulo = f"{casa} {gc} × {gf} {fora}"
        partes = [f"{onde}, {q:%d/%m/%Y}."]
        if p.get("penaltis_pro") is not None:
            pc, pf = (p["penaltis_pro"], p["penaltis_contra"]) if p.get("mando") != "Fora" else (p["penaltis_contra"], p["penaltis_pro"])
            partes.append(f"Pênaltis: {pc} × {pf}.")
        if gols:
            contagem = Counter(gols)
            partes.append("Gols do Flamengo: " + ", ".join(f"{n} {c}" if c > 1 else n for n, c in contagem.items()) + ".")
        if xg.get("pro") is not None and xg.get("contra") is not None:
            xc, xf = (xg["pro"], xg["contra"]) if p.get("mando") != "Fora" else (xg["contra"], xg["pro"])
            partes.append(f"xG {_num(xc)} × {_num(xf)}.")
        partes.append("Escalações, finalizações e os números de cada jogador no datafla.")
    else:
        titulo = f"{casa} × {fora} · {DIAS[q.weekday()]}, {q:%d/%m} às {q:%H:%M}"
        partes = [f"{onde}" + (f", {p['estadio']}" if p.get("estadio") else "") + "."]
        if p.get("prob_vitoria") is not None:
            partes.append(f"Chance do Flamengo: vitória {_pct(p['prob_vitoria'])}, empate {_pct(p.get('prob_empate'))}, "
                          f"derrota {_pct(p.get('prob_derrota'))}.")
        partes.append("Prováveis escalações, desfalques e retrospecto no datafla.")
    return titulo, " ".join(partes)


def _pagina(id_partida: int, titulo: str, descricao: str, temporada: int, disputado: bool) -> str:
    alvo = f"/?t={temporada}&aba=jogos&{'jogo' if disputado else 'proximo'}={id_partida}"
    url = f"{URL}/jogo/{id_partida}"
    t, d = html.escape(titulo), html.escape(descricao)
    return f"""<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{t} · datafla.</title>
<meta name="description" content="{d}">
<link rel="canonical" href="{url}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="datafla.">
<meta property="og:title" content="{t}">
<meta property="og:description" content="{d}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{URL}/capa.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="pt_BR">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#0e0f11">
<script>location.replace({alvo!r});</script>
<style>body{{background:#0e0f11;color:#f2f3f5;font:16px/1.5 system-ui,sans-serif;margin:0;padding:40px 16px;text-align:center}}a{{color:#ff3341}}</style>
</head>
<body>
<h1>{t}</h1>
<p>{d}</p>
<p><a href="{alvo}">Abrir no datafla.</a></p>
</body>
</html>
"""


def gerar(conteudo: dict, temporada: int, pasta_site: Path) -> int:
    """Escreve site/jogo/<id>.html para cada jogo do calendário (encerrados e futuros). Devolve quantas páginas."""
    destino = pasta_site / "jogo"
    destino.mkdir(parents=True, exist_ok=True)
    detalhe = {p["id_partida"]: p for p in conteudo.get("partidas", [])}
    proximo = {p["id_partida"]: p for p in conteudo.get("proximo", [])}
    xg: dict[int, dict] = {}
    for s in conteudo.get("estatisticas", []):
        if s.get("estatistica") == "xg":
            xg.setdefault(s["id_partida"], {})["pro" if s["eh_flamengo"] else "contra"] = s["valor"]
    gols: dict[int, list[str]] = {}
    for e in conteudo.get("eventos", []):
        if e.get("tipo") == "Goal" and e.get("eh_flamengo") and e.get("detalhe") in ("Normal Goal", "Penalty") and e.get("jogador"):
            gols.setdefault(e["id_partida"], []).append(e["jogador"])
    jogos = conteudo.get("calendario") or conteudo.get("partidas", [])
    for c in jogos:
        p = {**c, **proximo.get(c["id_partida"], {}), **detalhe.get(c["id_partida"], {})}
        if p.get("gols_pro") is None and p.get("status") not in (None, "NS", "TBD", "PST"):
            continue  # cancelado/em andamento sem placar: sem página
        titulo, descricao = resumo_jogo(p, xg.get(p["id_partida"], {}), gols.get(p["id_partida"], []))
        (destino / f"{p['id_partida']}.html").write_text(_pagina(p["id_partida"], titulo, descricao, temporada, p.get("gols_pro") is not None), encoding="utf-8")
    escrever_sitemap(pasta_site)
    return len(jogos)


def escrever_sitemap(pasta_site: Path) -> None:
    """sitemap.xml com a página inicial e todas as páginas de jogo existentes (de todas as temporadas) + robots.txt."""
    hoje = datetime.now(timezone.utc).date().isoformat()
    urls = [f"{URL}/"] + [f"{URL}/jogo/{a.stem}" for a in sorted((pasta_site / "jogo").glob("*.html"))]
    corpo = "\n".join(f"  <url><loc>{u}</loc><lastmod>{hoje}</lastmod></url>" for u in urls)
    (pasta_site / "sitemap.xml").write_text(
        f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{corpo}\n</urlset>\n',
        encoding="utf-8")
    (pasta_site / "robots.txt").write_text(f"User-agent: *\nAllow: /\nSitemap: {URL}/sitemap.xml\n", encoding="utf-8")
