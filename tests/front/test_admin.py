"""Tela de admin com o Firebase de mentira: o Playwright intercepta o SDK (gstatic) e a API do GitHub e devolve módulos
falsos com um usuário logado, acessos e opiniões. Nada sai para a internet nem toca no banco de verdade."""

from __future__ import annotations

import json
from datetime import date, timedelta

import pytest

HOJE = date.today()
ACESSOS = [{"dia": (HOJE - timedelta(days=i)).isoformat(), "visitas": 10 + i, "unicos": 5, "celular": 6, "computador": 4,
            "aba_temporada": 8, "aba_jogos": 3, "origem_direto": 9, "dono": 1} for i in range(20)]
OPINIOES = [
    {"id": "a1", "tipo": "elogio", "mensagem": "Painel excelente", "nome": "Ana", "contato": "ana@exemplo.com", "ms": 3},
    {"id": "b2", "tipo": "critica", "mensagem": "Faltou o xG do Carioca", "nome": "", "contato": "", "ms": 2},
    {"id": "c3", "tipo": "sugestao", "mensagem": "Coloquem a Copa do Brasil", "nome": "Beto", "contato": "", "ms": 1},
]

FAKE_APP = "export const initializeApp = () => ({});"
FAKE_AUTH = """
const usuario = { email: 'dono@exemplo.com' };
const auth = { currentUser: usuario, authStateReady: async () => {} };
export const getAuth = () => auth;
export const signOut = async (a) => { a.currentUser = null; };
export const signInWithPopup = async (a) => { a.currentUser = usuario; };
export class GoogleAuthProvider {}
"""
FAKE_FS = """
const ACESSOS = %s, OPINIOES = %s;
window.__apagadas = [];
const linha = (id, dados) => ({ id, ref: { id }, data: () => dados });
window.__gravado = null;
export const doc = (db, colecao, id) => ({ colecao, id });
export const getDoc = async () => ({ exists: () => true, data: () => ({ lesoes: {}, transmissao: {} }) });
export const setDoc = async (ref, dados) => { window.__gravado = { ref, ...JSON.parse(JSON.stringify({ ...dados, atualizado_em: null })) }; };
export const serverTimestamp = () => "agora";
export const getFirestore = () => ({});
export const collection = (db, nome) => ({ nome });
export const orderBy = () => null;
export const limit = () => null;
export const query = (c) => c;
export const getDocs = async (c) => ({ docs: c.nome === 'acessos'
  ? ACESSOS.map(({ dia, ...d }) => linha(dia, d))
  : OPINIOES.map(({ id, ms, ...d }) => linha(id, { ...d, criado_em: { toDate: () => new Date(Date.now() - ms * 3600e3) } })) });
export const deleteDoc = async (ref) => { window.__apagadas.push(ref.id); };
""" % (json.dumps(ACESSOS), json.dumps(OPINIOES))
RUNS = {"workflow_runs": [
    {"status": "completed", "conclusion": "success", "event": "workflow_dispatch", "created_at": "2026-10-16T10:00:00Z",
     "run_started_at": "2026-10-16T10:00:00Z", "updated_at": "2026-10-16T10:01:00Z", "html_url": "https://github.com/x"},
    {"status": "completed", "conclusion": "failure", "event": "schedule", "created_at": "2026-10-16T07:17:00Z",
     "run_started_at": "2026-10-16T07:17:00Z", "updated_at": "2026-10-16T07:18:00Z", "html_url": "https://github.com/y"},
]}


@pytest.fixture
def admin(pagina):
    pg = pagina.pg

    def sdk(route):
        nome = route.request.url.rsplit("/", 1)[-1]
        corpo = {"firebase-app.js": FAKE_APP, "firebase-auth.js": FAKE_AUTH, "firebase-firestore.js": FAKE_FS}[nome]
        route.fulfill(status=200, content_type="text/javascript", body=corpo, headers={"Access-Control-Allow-Origin": "*"})

    pg.route("https://www.gstatic.com/firebasejs/**", sdk)
    pg.route("https://api.github.com/**", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps(RUNS),
                                                            headers={"Access-Control-Allow-Origin": "*"}))
    # começa sem nada lido (só na 1ª carga: o teste recarrega e confere que a leitura ficou guardada)
    pg.add_init_script("try { if (!sessionStorage.getItem('limpo')) { localStorage.removeItem('datafla-admin-lidas');"
                       " localStorage.removeItem('datafla-admin-visto'); sessionStorage.setItem('limpo', '1') } } catch (e) {}")
    pagina.abrir("#admin", "#tela-admin")
    pg.wait_for_selector(".admin-layout")
    return pagina


def test_admin_e_uma_tela_e_nao_modal(admin):
    pg = admin.pg
    assert pg.locator("dialog#modal-admin").count() == 0
    assert pg.is_visible("#tela-admin") and not pg.is_visible("main")
    assert pg.locator(".admin-menu button").count() == 6
    # visão geral: cartões de situação e pendências (1 falha no workflow, 3 opiniões novas)
    assert pg.locator(".admin-status").count() >= 6
    pend = " ".join(pg.locator(".admin-pendencias li").all_inner_texts())
    assert "falha" in pend and "3 opinião" in pend


def test_admin_navegacao_e_voltar(admin):
    pg = admin.pg
    pg.click(".admin-menu button:has-text('Acessos')")
    assert pg.url.endswith("#admin/acessos")
    assert pg.locator("#adm-dias svg").count() == 1, "gráfico de visitas por dia desenhado"
    pg.click(".admin-menu button:has-text('Qualidade')")
    assert pg.locator(".admin-conteudo table tbody tr").count() >= 1
    pg.click(".admin-cabecalho button:has-text('Voltar ao site')")
    assert not pg.is_visible("#tela-admin") and pg.is_visible("main")
    assert "#admin" not in pg.url


def test_admin_opinioes_filtrar_ler_apagar(admin):
    pg = admin.pg
    pg.click(".admin-menu button:has-text('Opiniões')")
    assert pg.locator(".admin-opiniao").count() == 3
    assert pg.locator(".admin-menu button:has-text('Opiniões') .selo-nova").inner_text() == "3"
    pg.click(".admin-conteudo .segmentado button:has-text('Críticas')")
    assert pg.locator(".admin-opiniao").count() == 1
    pg.click(".admin-conteudo .segmentado button:has-text('Todas')")
    pg.fill(".admin-conteudo .busca", "copa do brasil")
    assert pg.locator(".admin-opiniao").count() == 1
    pg.fill(".admin-conteudo .busca", "")
    # marcar uma como lida: o selo do menu cai para 2 e sobrevive a recarregar
    pg.locator(".admin-opiniao", has_text="Painel excelente").locator("button:has-text('Marcar como lida')").click()
    assert pg.locator(".admin-menu button:has-text('Opiniões') .selo-nova").inner_text() == "2"
    pg.click(".admin-conteudo button:has-text('como lidas')")
    assert pg.locator(".admin-menu button:has-text('Opiniões') .selo-nova").count() == 0
    pg.reload(wait_until="networkidle")
    pg.wait_for_selector(".admin-layout")
    assert pg.locator(".admin-menu button:has-text('Opiniões') .selo-nova").count() == 0
    # apagar pede confirmação e chama o Firestore
    pg.click(".admin-menu button:has-text('Opiniões')")
    pg.once("dialog", lambda d: d.accept())
    pg.locator(".admin-opiniao", has_text="Faltou o xG").locator("button:has-text('Apagar')").click()
    pg.wait_for_function("window.__apagadas.length === 1")
    assert pg.evaluate("window.__apagadas") == ["b2"]
    assert pg.locator(".admin-opiniao").count() == 2


def test_admin_celular(celular):
    pg = celular.pg
    pg.route("https://www.gstatic.com/firebasejs/**", lambda r: r.fulfill(status=200, content_type="text/javascript",
        body={"firebase-app.js": FAKE_APP, "firebase-auth.js": FAKE_AUTH, "firebase-firestore.js": FAKE_FS}[r.request.url.rsplit("/", 1)[-1]]))
    pg.route("https://api.github.com/**", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps(RUNS)))
    celular.abrir("#admin", "#tela-admin")
    pg.wait_for_selector(".admin-layout")
    for secao in ("geral", "acessos", "opinioes", "coleta", "qualidade"):
        pg.evaluate(f"location.hash = '#admin/{secao}'")
        pg.wait_for_timeout(300)
        assert pg.evaluate("document.documentElement.scrollWidth") <= 390, f"admin/{secao} passa da tela no celular"


def test_admin_cadastra_lesao_e_transmissao(admin):
    pg = admin.pg
    pg.click(".admin-menu button:has-text('Cadastros')")
    assert pg.url.endswith("#admin/cadastros")
    jogador = pg.locator(".admin-form select option").nth(1)
    nome, valor = jogador.inner_text(), jogador.get_attribute("value")
    pg.select_option(".admin-form select", valor)
    pg.fill(".admin-form input[type=text]", "lesão na coxa")
    pg.fill(".admin-form input[type=date]", "2099-12-31")
    pg.click(".admin-form button:has-text('Adicionar')")
    pg.wait_for_function("window.__gravado !== null")
    gravado = pg.evaluate("window.__gravado")
    assert gravado["ref"] == {"colecao": "manual", "id": "cadastros"}
    assert gravado["lesoes"][valor] == {"nome": nome, "motivo": "lesão na coxa", "volta": "2099-12-31"}
    assert pg.locator(".admin-conteudo table tbody tr", has_text="lesão na coxa").count() == 1
    campos = pg.locator(".admin-conteudo input[aria-label^='Onde passa']")
    if campos.count():
        campos.first.fill("Globo, Premiere")
        pg.evaluate("window.__gravado = null")
        pg.click("button:has-text('Salvar transmissões')")
        pg.wait_for_function("window.__gravado !== null")
        assert list(pg.evaluate("window.__gravado.transmissao").values()) == ["Globo, Premiere"]
