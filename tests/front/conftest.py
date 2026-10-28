"""Testes de front-end: o painel aberto num Chrome sem janela (Playwright), servido de site/ num servidor temporário.

    python -m pytest tests/front -q        # precisa de `pip install playwright` e de site/dados (rode `coletar processar`)

Pulam sozinhos sem Playwright, sem navegador ou sem os dados gerados (ex.: no 1º passo do workflow, antes da coleta).
"""

from __future__ import annotations

import socket
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

SITE = Path(__file__).resolve().parents[2] / "site"


class _Silencioso(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


@pytest.fixture(scope="session")
def url_site():
    if not any((SITE / "dados").glob("20*.json")):
        pytest.skip("sem site/dados: rode `python -m coleta.coletar processar`")
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        porta = s.getsockname()[1]
    servidor = ThreadingHTTPServer(("127.0.0.1", porta), partial(_Silencioso, directory=str(SITE)))
    threading.Thread(target=servidor.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{porta}"
    servidor.shutdown()


@pytest.fixture(scope="session")
def navegador():
    sync = pytest.importorskip("playwright.sync_api")
    with sync.sync_playwright() as p:
        b = None
        for canal in ("chrome", "msedge", None):  # usa o Chrome/Edge instalado; sem eles, o Chromium do Playwright
            try:
                b = p.chromium.launch(channel=canal) if canal else p.chromium.launch()
                break
            except Exception:
                continue
        if b is None:
            pytest.skip("nenhum navegador para o Playwright")
        yield b
        b.close()


class Pagina:
    """Página com os erros de JavaScript guardados (o teste falha se aparecer algum)."""

    def __init__(self, contexto, url_site):
        self.ctx = contexto
        self.url_site = url_site
        self.pg = contexto.new_page()
        self.erros: list[str] = []
        self.pg.on("pageerror", lambda e: self.erros.append(str(e)))
        self.pg.on("console", lambda m: m.type == "error" and "favicon" not in m.text and self.erros.append(m.text))
        # cadastros manuais (Firestore): sem rede nos testes; um teste pode trocar por dados próprios (rota mais nova vale)
        self.pg.route("https://firestore.googleapis.com/**/manual/cadastros*",
                      lambda r: r.fulfill(status=200, content_type="application/json", body="{}"))

    def abrir(self, caminho: str, espera: str = "#aba-temporada"):
        self.pg.goto(self.url_site + "/" + caminho.lstrip("/"), wait_until="networkidle")
        self.pg.wait_for_selector(espera, state="attached")
        self.pg.wait_for_timeout(300)  # gráficos desenham depois do layout
        return self.pg


def _contexto(navegador, url_site, largura, altura, tema):
    ctx = navegador.new_context(viewport={"width": largura, "height": altura}, accept_downloads=True)
    ctx.add_init_script(f"try {{ localStorage.setItem('datafla-tema', '{tema}') }} catch (e) {{}}")
    return ctx


@pytest.fixture(params=["dark", "light"])
def pagina(request, navegador, url_site):
    ctx = _contexto(navegador, url_site, 1440, 900, request.param)
    p = Pagina(ctx, url_site)
    p.tema = request.param
    yield p
    ctx.close()
    assert not p.erros, f"erros de JavaScript: {p.erros}"


@pytest.fixture
def pagina_escura(navegador, url_site):
    ctx = _contexto(navegador, url_site, 1440, 900, "dark")
    p = Pagina(ctx, url_site)
    yield p
    ctx.close()
    assert not p.erros, f"erros de JavaScript: {p.erros}"


@pytest.fixture
def celular(navegador, url_site):
    ctx = _contexto(navegador, url_site, 390, 844, "light")
    p = Pagina(ctx, url_site)
    yield p
    ctx.close()
    assert not p.erros, f"erros de JavaScript: {p.erros}"
