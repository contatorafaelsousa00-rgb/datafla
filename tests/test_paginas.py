"""Páginas por jogo (prévia no WhatsApp/X e Google)."""

from coleta import paginas


def test_resumo_de_jogo_disputado_fora_de_casa():
    p = {"id_partida": 1, "data_utc": "2026-10-23T00:30:00+00:00", "competicao": "Libertadores", "rodada": "Semifinal",
         "mando": "Fora", "adversario": "Estudiantes", "gols_pro": 0, "gols_contra": 0, "penaltis_pro": 2, "penaltis_contra": 3}
    titulo, desc = paginas.resumo_jogo(p, {"pro": 0.86, "contra": 0.79}, [])
    assert titulo == "Estudiantes 0 × 0 Flamengo"  # mandante × visitante
    assert "Pênaltis: 3 × 2." in desc and "xG 0,79 × 0,86." in desc and "Gols do Flamengo" not in desc


def test_resumo_conta_gols_repetidos_e_jogo_futuro():
    p = {"id_partida": 2, "data_utc": "2026-10-26T23:00:00+00:00", "competicao": "Brasileirão", "rodada": "Rodada 32",
         "mando": "Casa", "adversario": "Atletico-MG", "gols_pro": 3, "gols_contra": 2}
    _, desc = paginas.resumo_jogo(p, {}, ["Pedro", "Lino", "Pedro"])
    assert "Gols do Flamengo: Pedro 2, Lino." in desc
    futuro = {"id_partida": 3, "data_utc": "2026-10-29T23:00:00+00:00", "competicao": "Brasileirão", "rodada": "Rodada 33",
              "mando": "Fora", "adversario": "Vasco da Gama", "gols_pro": None, "prob_vitoria": 0.5, "prob_empate": 0.25, "prob_derrota": 0.25}
    titulo, desc = paginas.resumo_jogo(futuro, {}, [])
    assert titulo == "Vasco da Gama × Flamengo · quinta, 29/10 às 20:00"  # horário de Brasília
    assert "vitória 50%" in desc


def test_gerar_escreve_paginas_sitemap_e_robots(tmp_path):
    conteudo = {"calendario": [{"id_partida": 7, "data_utc": "2026-10-26T23:00:00+00:00", "status": "FT", "mando": "Casa",
                                "adversario": "Atletico-MG", "gols_pro": 3, "gols_contra": 2, "competicao": "Brasileirão"}],
                "eventos": [{"id_partida": 7, "tipo": "Goal", "eh_flamengo": True, "detalhe": "Penalty", "jogador": "Pedro"},
                            {"id_partida": 7, "tipo": "Shootout", "eh_flamengo": True, "detalhe": "Scored", "jogador": "Lino"}]}
    paginas.gerar(conteudo, 2026, tmp_path)
    html = (tmp_path / "jogo" / "7.html").read_text(encoding="utf-8")
    assert "<title>Flamengo 3 × 2 Atletico-MG · datafla.</title>" in html
    assert "Gols do Flamengo: Pedro." in html and "Lino" not in html  # cobrança de disputa não é gol
    assert "aba=jogos&jogo=7" in html
    assert "https://datafla.web.app/jogo/7" in (tmp_path / "sitemap.xml").read_text(encoding="utf-8")
    assert "Sitemap:" in (tmp_path / "robots.txt").read_text(encoding="utf-8")
