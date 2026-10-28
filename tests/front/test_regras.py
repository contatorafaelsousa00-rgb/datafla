"""Regras de negócio do painel (pré-jogo e aba Números) com uma temporada INVENTADA, injetada na página.

Os outros testes usam os dados reais e só checam estrutura; aqui cada regra tem um caso montado de propósito
(ex.: o caso Jorginho — ausência por suspensão não é "fora dos últimos jogos")."""

from __future__ import annotations

import json

import pytest

BRA, COPA = "Brasileirão", "Copa do Brasil"
JOGOS = [  # (id, data, competição, gols pró, contra, resultado)
    (1, "2026-08-01", BRA, 2, 0, "V"),
    (2, "2026-08-08", BRA, 1, 0, "V"),
    (90, "2026-08-10", COPA, 1, 1, "E"),
    (3, "2026-08-15", BRA, 0, 1, "D"),
    (4, "2026-08-22", BRA, 3, 0, "V"),
]


def _j(jogo, id_, nome, minutos=90, amarelos=0, vermelhos=0, gols=0, assist=0):
    return {"id_partida": jogo, "jogador_id": id_, "jogador": nome, "minutos": minutos, "titular": minutos >= 45, "posicao": "Meio-campo",
            "amarelos": amarelos, "vermelhos": vermelhos, "gols": gols, "assistencias": assist, "eh_flamengo": True}


JOGADORES = [
    # Amarelo3: 3º amarelo do Brasileirão no último jogo (4) → suspenso
    _j(1, 11, "Amarelo3", amarelos=1), _j(2, 11, "Amarelo3", amarelos=1), _j(4, 11, "Amarelo3", amarelos=1),
    # Pendurado: 2 amarelos no Brasileirão
    _j(1, 12, "Pendurado", amarelos=1), _j(3, 12, "Pendurado", amarelos=1),
    # Expulso: vermelho no último jogo → suspenso
    _j(4, 13, "Expulso", vermelhos=1),
    # CopaNaoConta: 2 amarelos na Copa + 1 no Brasileirão → não está pendurado no Brasileirão
    _j(90, 14, "CopaNaoConta", amarelos=2), _j(1, 14, "CopaNaoConta", amarelos=1),
    # Sumiu: titular frequente (900+ min) fora dos 2 últimos jogos sem suspensão → "fora dos últimos jogos"
    _j(1, 15, "Sumiu", 500), _j(2, 15, "Sumiu", 500), _j(90, 15, "Sumiu", 90),
    # Cumpriu: expulso no jogo 3, ficou fora do 4 (suspenso) → volta, e NÃO conta como fora dos últimos jogos
    _j(1, 16, "Cumpriu", 500), _j(2, 16, "Cumpriu", 500), _j(90, 16, "Cumpriu", 90), _j(3, 16, "Cumpriu", vermelhos=1),
    # Artilheiro: 2 gols no jogo 1 (um de pênalti) e 1 no jogo 4
    _j(1, 17, "Artilheiro", gols=2), _j(4, 17, "Artilheiro", gols=1, assist=0),
]
EVENTOS = [
    {"id_partida": 1, "ordem": 1, "minuto": 10, "acrescimo": None, "eh_flamengo": True, "jogador_id": 17, "jogador": "Artilheiro",
     "assist_id": None, "assist": None, "tipo": "Goal", "detalhe": "Penalty"},
    {"id_partida": 1, "ordem": 2, "minuto": 50, "acrescimo": None, "eh_flamengo": True, "jogador_id": 17, "jogador": "Artilheiro",
     "assist_id": None, "assist": None, "tipo": "Goal", "detalhe": "Normal Goal"},
    # expulsão de alguém fora da relação do jogo não conta (a fonte às vezes marca gente de fora)
    {"id_partida": 1, "ordem": 3, "minuto": 70, "acrescimo": None, "eh_flamengo": True, "jogador_id": 999, "jogador": "Fantasma",
     "assist_id": None, "assist": None, "tipo": "Card", "detalhe": "Red Card"},
    # expulsão (a aba Números conta pelos lances): Cumpriu, no jogo 3
    {"id_partida": 3, "ordem": 2, "minuto": 60, "acrescimo": None, "eh_flamengo": True, "jogador_id": 16, "jogador": "Cumpriu",
     "assist_id": None, "assist": None, "tipo": "Card", "detalhe": "Red Card"},
    # jogo 3: adversário marcou primeiro
    {"id_partida": 3, "ordem": 1, "minuto": 30, "acrescimo": None, "eh_flamengo": False, "jogador_id": 500, "jogador": "Rival",
     "assist_id": None, "assist": None, "tipo": "Goal", "detalhe": "Normal Goal"},
    # cobrança de disputa de pênaltis não é gol do jogo
    {"id_partida": 90, "ordem": 9, "minuto": 91, "acrescimo": None, "eh_flamengo": True, "jogador_id": 15, "jogador": "Sumiu",
     "assist_id": None, "assist": None, "tipo": "Shootout", "detalhe": "Scored"},
]


def _bruto():
    partidas = [{"id_partida": i, "data_utc": f"{d}T22:00:00+00:00", "competicao": c, "status": "FT", "gols_pro": gp, "gols_contra": gc,
                 "resultado": r, "mando": "Casa", "adversario": f"Rival {i}", "rodada": None} for i, d, c, gp, gc, r in JOGOS]
    proximo = {"id_partida": 5, "data_utc": "2026-08-29T22:00:00+00:00", "competicao": BRA, "status": "NS", "gols_pro": None,
               "gols_contra": None, "mando": "Fora", "adversario": "Rival 5"}
    return {"partidas": partidas, "calendario": partidas + [proximo], "jogadores": JOGADORES, "eventos": EVENTOS,
            "estatisticas": [], "finalizacoes": [], "escalacoes": [], "perfis": [], "meta": {"temporada": 2026}}


@pytest.fixture
def regras(pagina_escura):
    """Página com a temporada inventada no lugar da real (restaurada no fim)."""
    pg = pagina_escura.abrir("?aba=temporada", "#aba-temporada svg")
    pg.evaluate(f"""async () => {{
      const comum = await import('/comum.js');
      window.__real = comum.D;
      comum.definirDados(comum.preparar({json.dumps(_bruto())}));
    }}""")
    yield pg
    pg.evaluate("async () => (await import('/comum.js')).definirDados(window.__real)")


def test_desfalques_do_pre_jogo(regras):
    r = regras.evaluate("""async () => {
      const { D } = await import('/comum.js');
      const { desfalques } = await import('/preview.js');
      const d = desfalques(D.calendario.find((c) => c.id_partida === 5));
      const nomes = (l) => l.map((x) => x.nome).sort();
      return { suspensos: nomes(d.suspensos), pendurados: nomes(d.pendurados), ausentes: nomes(d.ausentes), voltam: nomes(d.voltam),
               motivos: Object.fromEntries(d.suspensos.map((x) => [x.nome, x.motivo])) };
    }""")
    assert r["suspensos"] == ["Amarelo3", "Expulso"]
    assert r["motivos"]["Amarelo3"] == "3º amarelo" and "expulso" in r["motivos"]["Expulso"]
    assert r["pendurados"] == ["Pendurado"]  # CopaNaoConta: amarelos de outra competição não somam
    assert r["ausentes"] == ["Sumiu"]
    assert r["voltam"] == ["Cumpriu"]  # ausência por suspensão: volta, e não é "fora dos últimos jogos"


def test_numeros_por_jogador_e_sequencias(regras):
    r = regras.evaluate("""async () => {
      const { D } = await import('/comum.js');
      const n = await import('/numeros.js');
      const linhas = Object.fromEntries(n.porJogador(D.encerrados).map((l) => [l.nome, l]));
      const seq = Object.fromEntries(n.sequencias(D.encerrados).map((s) => [s.nome, [s.n, s.atual]]));
      return { art: [linhas.Artilheiro.gols, linhas.Artilheiro.penaltis, linhas.Artilheiro.jogosComGol.length],
               fantasma: "Fantasma" in linhas, expulsoesCumpriu: linhas.Cumpriu.expulsoes, golsSumiu: linhas.Sumiu.gols, seq,
               primeiro: D.encerrados.map((p) => n.primeiroGol(p)) };
    }""")
    assert r["art"] == [3, 1, 2]  # 3 gols (1 de pênalti) em 2 jogos
    assert r["fantasma"] is False  # expulsão de quem não estava na relação não entra
    assert r["expulsoesCumpriu"] == 1
    assert r["golsSumiu"] == 0  # cobrança de disputa de pênaltis não é gol
    # resultados em ordem: V V E D V
    assert r["seq"]["Invencibilidade"] == [3, 1]
    assert r["seq"]["Vitórias seguidas"] == [2, 1]
    assert r["seq"]["Marcando gol"] == [3, 1]
    assert r["primeiro"] == ["fla", None, None, "adv", None]  # só jogos com lances de gol
