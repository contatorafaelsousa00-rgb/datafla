"""Comportamento do painel no navegador. Os dados são os reais (site/dados), então os testes checam regras que valem
para qualquer temporada — ordem, presença, contraste, layout — e não números de um jogo específico. A lógica do
mata-mata é testada com jogos inventados, injetados na página."""

from __future__ import annotations

import json
import struct
from pathlib import Path

import pytest

ABAS = {
    "temporada": "#aba-temporada svg",
    "jogos": "#aba-jogos table",
    "jogadores": "#aba-jogadores table",
    "elenco": "#aba-elenco svg",
    "estilo": "#aba-estilo svg",
    "numeros": "#aba-numeros table",
    "classificacao": "#aba-classificacao table",
    "opiniao": "#aba-opiniao form",
}

# contraste WCAG entre a cor do texto e a do fundo efetivo (sobe na árvore até achar fundo opaco)
JS_CONTRASTE = """(el) => {
  const rgb = (c) => (c.match(/[\\d.]+/g) || []).map(Number);
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; };
    return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
  let fundo = null, e = el;
  while (e && !fundo) { const c = rgb(getComputedStyle(e).backgroundColor); if (c.length === 3 || (c[3] ?? 0) > .5) fundo = c; e = e.parentElement; }
  fundo ??= rgb(getComputedStyle(document.body).backgroundColor);
  const a = lum(rgb(getComputedStyle(el).color)), b = lum(fundo);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}"""


def _abrir_primeiro_jogo(pg):
    pg.click("#lista-jogos button[data-lista='disputados']")
    pg.click("#card-disputados tbody tr >> nth=0")
    pg.wait_for_selector("#modal-jogo[open] #detalhe-jogo .placar")


# ---------- abas ----------

@pytest.mark.parametrize("aba,seletor", ABAS.items())
def test_aba_desenha(pagina, aba, seletor):
    pg = pagina.abrir(f"?aba={aba}", f"#aba-{aba}")
    assert pg.is_visible(f"#aba-{aba}")
    assert pg.locator(seletor).count() > 0, f"aba {aba} sem {seletor}"


@pytest.mark.parametrize("aba", ABAS)
def test_celular_sem_rolagem_lateral(celular, aba):
    pg = celular.abrir(f"?aba={aba}", f"#aba-{aba}")
    largura = pg.evaluate("document.documentElement.scrollWidth")
    assert largura <= 390, f"aba {aba} passa da tela no celular ({largura}px)"


# ---------- tela do jogo ----------

def test_jogo_abre_em_tela_inteira_e_volta(pagina):
    pg = pagina.abrir("?aba=jogos")
    _abrir_primeiro_jogo(pg)
    caixa = pg.locator("#modal-jogo").bounding_box()
    assert caixa["width"] >= 1400 and caixa["height"] >= 880, "o jogo deve ocupar a tela inteira"
    assert "jogo=" in pg.url
    # com o jogo aberto, a página de trás não rola
    assert pg.evaluate("getComputedStyle(document.documentElement).overflow") == "hidden"
    # botão Voltar legível nos dois temas
    assert pg.eval_on_selector("#fechar-jogo", JS_CONTRASTE) >= 4.5
    pg.click("#fechar-jogo")
    assert not pg.is_visible("#modal-jogo")
    assert pg.evaluate("getComputedStyle(document.documentElement).overflow") != "hidden"


def test_aba_jogadores_do_jogo(pagina_escura):
    pg = pagina_escura.abrir("?aba=jogos")
    _abrir_primeiro_jogo(pg)
    pg.click(".abas-jogo button:has-text('Jogadores')")
    linhas = pg.locator(".tabela-partida tbody tr")
    assert linhas.count() >= 22, "devem aparecer os jogadores dos dois times"
    assert pg.locator(".tabela-partida tbody tr.linha-fla").count() >= 11
    assert pg.locator(".tabela-partida tbody tr:not(.linha-fla)").count() >= 11
    # filtro por time: só o Flamengo
    pg.click(".tabela-partida >> xpath=ancestor::div[contains(@class,'bloco')]//button[text()='Flamengo']")
    assert pg.locator(".tabela-partida tbody tr:not(.linha-fla)").count() == 0
    # ordenar por minutos: decrescente, e o 2º clique inverte
    pg.click(".tabela-partida th:has-text('Min')")
    minutos = [int(t) for t in pg.locator(".tabela-partida tbody tr td:nth-child(2)").all_inner_texts()]
    assert minutos == sorted(minutos, reverse=True)
    pg.click(".tabela-partida th:has-text('Min')")
    minutos = [int(t) for t in pg.locator(".tabela-partida tbody tr td:nth-child(2)").all_inner_texts()]
    assert minutos == sorted(minutos)


def test_previsao_legivel(pagina):
    pg = pagina.abrir("?aba=jogos")
    _abrir_primeiro_jogo(pg)
    partes = pg.locator("#detalhe-jogo .prob-parte")
    if not partes.count():
        pytest.skip("jogo sem previsão")
    for i in range(partes.count()):
        p = partes.nth(i)
        assert float(p.evaluate("e => getComputedStyle(e).opacity")) == 1
        assert p.evaluate(JS_CONTRASTE) >= 3, f"texto da previsão ilegível no tema {pagina.tema}"


def test_proximo_jogo_ordem_das_secoes(pagina_escura):
    pg = pagina_escura.abrir("?aba=jogos")
    if not pg.locator("#card-proximos tbody tr").count():
        pytest.skip("sem próximos jogos")
    pg.click("#card-proximos tbody tr >> nth=0")
    pg.wait_for_selector("#modal-jogo[open] #detalhe-proximo h3")
    titulos = pg.locator("#detalhe-proximo h3").all_inner_texts()
    if "Prováveis escalações" in titulos:
        assert titulos.index("Prováveis escalações") < titulos.index("Desfalques do Flamengo")
    assert titulos[-1] == "Pendurados", "pendurados ficam no fim da tela"


# ---------- classificação ----------

def test_seletor_de_competicao(pagina_escura):
    pg = pagina_escura.abrir("?aba=classificacao", "#aba-classificacao")
    botoes = pg.locator("#classificacao-comp button").all_inner_texts()
    assert botoes[0].strip() == "Brasileirão"
    if "Libertadores" not in [b.strip() for b in botoes]:
        pytest.skip("sem dados da Libertadores")
    pg.click("#classificacao-comp button:has-text('Libertadores')")
    assert "tabela=libertadores" in pg.url
    assert pg.locator(".tabela-grupo").count() >= 1
    assert pg.locator(".grupo-fla").count() == 1, "o grupo do Flamengo vem destacado"
    if pg.locator(".chaveamento").count():  # mata-mata em colunas (uma por fase), não empilhado
        assert pg.eval_on_selector(".chaveamento", "e => getComputedStyle(e).display") == "grid"
        fases = pg.locator(".chave-fase")
        assert fases.count() >= 2
        assert fases.nth(1).bounding_box()["x"] > fases.nth(0).bounding_box()["x"]
    # link direto abre na competição certa
    pg = pagina_escura.abrir("?aba=classificacao&tabela=libertadores", "#aba-classificacao")
    assert pg.locator("#classificacao-comp button[aria-pressed='true']").inner_text().strip() == "Libertadores"


JOGOS_FICTICIOS = """[
  // oitavas: A x B (A passa no placar somado), C x D (empate, D nos pênaltis)
  {fase:'Oitavas de final', ordem_fase:2, data_utc:'2026-08-01T22:00:00+00:00', casa_id:1, casa:'A', fora_id:2, fora:'B', gols_casa:2, gols_fora:0},
  {fase:'Oitavas de final', ordem_fase:2, data_utc:'2026-08-08T22:00:00+00:00', casa_id:2, casa:'B', fora_id:1, fora:'A', gols_casa:1, gols_fora:0},
  {fase:'Oitavas de final', ordem_fase:2, data_utc:'2026-08-02T22:00:00+00:00', casa_id:3, casa:'C', fora_id:4, fora:'D', gols_casa:1, gols_fora:1},
  {fase:'Oitavas de final', ordem_fase:2, data_utc:'2026-08-09T22:00:00+00:00', casa_id:4, casa:'D', fora_id:3, fora:'C', gols_casa:0, gols_fora:0, penaltis_casa:4, penaltis_fora:3},
  {fase:'Oitavas de final', ordem_fase:2, data_utc:'2026-08-03T22:00:00+00:00', casa_id:5, casa:'E', fora_id:6, fora:'F', gols_casa:0, gols_fora:3},
  {fase:'Oitavas de final', ordem_fase:2, data_utc:'2026-08-10T22:00:00+00:00', casa_id:6, casa:'F', fora_id:5, fora:'E', gols_casa:0, gols_fora:0},
  // quartas: F x A (só a ida jogada) — F veio do 3º confronto, A do 1º
  {fase:'Quartas de final', ordem_fase:3, data_utc:'2026-09-01T22:00:00+00:00', casa_id:6, casa:'F', fora_id:1, fora:'A', gols_casa:1, gols_fora:0},
  {fase:'Quartas de final', ordem_fase:3, data_utc:'2026-09-08T22:00:00+00:00', casa_id:1, casa:'A', fora_id:6, fora:'F', gols_casa:null, gols_fora:null},
].map((m, i) => ({ competicao: 'Teste', id_partida: i, penaltis_casa: null, penaltis_fora: null, ...m }))"""


def test_mata_mata_logica(pagina_escura):
    pg = pagina_escura.abrir("?aba=classificacao", "#aba-classificacao")
    r = pg.evaluate(f"""async () => {{
      const comum = await import('/comum.js');
      const copas = await import('/copas.js');
      const antes = comum.D.bruto.mata_mata;
      comum.D.bruto.mata_mata = {JOGOS_FICTICIOS};
      try {{
        const fases = copas.confrontos('Teste');
        return fases.map((f) => ({{ nome: f.nome, confrontos: f.confrontos.map((c) => ({{
          times: [c.a.nome, c.b.nome], gols: c.gols, penaltis: c.penaltis, vencedor: c.vencedor }})) }}));
      }} finally {{ comum.D.bruto.mata_mata = antes; }}
    }}""")
    oitavas, quartas = r
    assert [f["nome"] for f in r] == ["Oitavas de final", "Quartas de final"]
    por_par = {tuple(sorted(c["times"])): c for c in oitavas["confrontos"]}
    assert por_par[("A", "B")]["gols"] == [2, 1] and por_par[("A", "B")]["vencedor"] == 1  # placar somado 2×1
    assert por_par[("C", "D")]["penaltis"] == [3, 4] and por_par[("C", "D")]["vencedor"] == 4  # pênaltis na volta
    assert por_par[("E", "F")]["vencedor"] == 6
    # quartas com só a ida: sem vencedor, placar parcial
    assert quartas["confrontos"][0]["vencedor"] is None and quartas["confrontos"][0]["gols"] == [1, 0]
    # chaveamento: os confrontos de onde vieram F e A ficam no topo das oitavas, na ordem dos times das quartas
    assert [tuple(sorted(c["times"])) for c in oitavas["confrontos"]][:2] == [("E", "F"), ("A", "B")]


# ---------- comparar calendário: imagem ----------

@pytest.mark.parametrize("modo", ["Simplificada", "Detalhada"])
def test_exportar_imagem(pagina_escura, modo):
    pg = pagina_escura.abrir("?aba=jogos&lista=comparar", "#comparar-calendario")
    if not pg.locator(".comparar-exportar").count():
        pytest.skip("sem calendário do Brasileirão")
    with pg.expect_download() as d:
        pg.click(f".comparar-exportar button:has-text('{modo}')")
    arquivo = d.value
    assert arquivo.suggested_filename.endswith(f"-{modo.lower()}.png")
    cabecalho = open(arquivo.path(), "rb").read(24)
    assert cabecalho[:8] == b"\x89PNG\r\n\x1a\n"
    largura, altura = struct.unpack(">II", cabecalho[16:24])
    assert largura == 2160 and altura > 1000  # 1080 px em resolução dobrada


def test_virada_de_ano_abre_a_ultima_temporada_com_jogos(pagina_escura):
    """Em janeiro a temporada nova entra no índice ainda sem jogos: o site abre a anterior, não uma tela vazia."""
    pg = pagina_escura.pg
    real = json.loads((Path(__file__).resolve().parents[2] / "site" / "dados" / "temporadas.json").read_text(encoding="utf-8"))
    ano = real[0]["temporada"]
    indice = [{"temporada": ano + 1, "jogos": 0, "gerado_em": "2027-01-01T00:00:00+00:00"}] + real
    pg.route("**/dados/temporadas.json", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps(indice)))
    pagina_escura.abrir("?aba=temporada", "#aba-temporada svg")
    assert pg.evaluate("(async () => (await import('/comum.js')).D.bruto.meta.temporada)()") == ano


def test_cadastros_manuais_aparecem_no_site(pagina_escura):
    """Lesão e transmissão cadastradas no admin (Firestore, manual/cadastros) aparecem no pré-jogo e no banner."""
    pg = pagina_escura.pg
    dados = json.loads((Path(__file__).resolve().parents[2] / "site" / "dados" / "2026.json").read_text(encoding="utf-8"))
    futuros = sorted((c for c in dados["calendario"] if c["status"] == "NS"), key=lambda c: c["data_utc"])
    if not futuros:
        pytest.skip("sem jogo futuro")
    jog = dados["jogadores"]
    linhas = [dict(zip(jog["colunas"], l)) for l in jog["linhas"]] if isinstance(jog, dict) else jog
    titular = max(linhas, key=lambda j: j["data_utc"] if "data_utc" in j else j["id_partida"])  # alguém do último jogo
    s = lambda v: {"stringValue": v}
    doc = {"fields": {
        "lesoes": {"mapValue": {"fields": {str(titular["jogador_id"]): {"mapValue": {"fields": {
            "nome": s(titular["jogador"]), "motivo": s("lesão no joelho"), "volta": s("2099-01-01")}}}}}},
        "transmissao": {"mapValue": {"fields": {str(futuros[0]["id_partida"]): s("Canal Teste")}}}}}
    pg.route("https://firestore.googleapis.com/**/manual/cadastros*", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps(doc)))
    pagina_escura.abrir("?aba=temporada", "#card-proximo")
    assert "Canal Teste" in pg.inner_text("#card-proximo")
    pg.click("#card-proximo")
    pg.wait_for_selector("#modal-jogo[open] #detalhe-proximo h3")
    assert "lesão no joelho" in pg.inner_text("#detalhe-proximo")
