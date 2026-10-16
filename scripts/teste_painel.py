"""Teste de fumaça do painel: abre cada aba num navegador sem janela e confere que desenhou sem erro.

    python scripts/teste_painel.py              # usa site/dados (rode antes `coletar processar`)

Precisa de Chrome, Chromium ou Edge instalado (no GitHub Actions o Chrome já vem no ubuntu-latest);
`FLA_NAVEGADOR` aponta outro executável. Sai com código 1 se alguma aba falhar, o que barra a publicação.
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent / "site"

# aba -> o que precisa aparecer dentro dela
ABAS = {
    "temporada": ["<svg", 'class="kpi'],
    "jogos": ["<table"],
    "jogadores": ["<table"],
    "elenco": ["<svg"],
    "estilo": ["<svg"],
    "classificacao": ["<table", "lista-palpites"],
    "opiniao": ["<form"],
}
ERROS = re.compile(r"Uncaught|SyntaxError|ReferenceError|TypeError|Failed to load module", re.I)

CANDIDATOS = [
    "google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "chrome", "msedge",
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
]


class Silencioso(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def navegador() -> str:
    for c in [os.environ.get("FLA_NAVEGADOR")] + CANDIDATOS:
        if c and (shutil.which(c) or Path(c).exists()):
            return shutil.which(c) or c
    sys.exit("Nenhum navegador encontrado (Chrome, Chromium ou Edge). Defina FLA_NAVEGADOR.")


def secao(dom: str, aba: str) -> str:
    """Trecho do HTML da seção da aba (até a próxima seção)."""
    inicio = dom.find(f'id="aba-{aba}"')
    if inicio < 0:
        return ""
    fim = dom.find('<section id="aba-', inicio + 10)
    return dom[inicio: fim if fim > 0 else len(dom)]


def main() -> int:
    if not (SITE / "dados" / "temporadas.json").exists():
        print("Sem site/dados: rode antes `python -m coleta.coletar processar`.")
        return 1
    exe = navegador()
    servidor = ThreadingHTTPServer(("127.0.0.1", 0), partial(Silencioso, directory=str(SITE)))
    threading.Thread(target=servidor.serve_forever, daemon=True).start()
    porta = servidor.server_address[1]
    falhas = 0
    with tempfile.TemporaryDirectory() as perfil:
        for aba, esperado in ABAS.items():
            cmd = [exe, "--headless=new", "--disable-gpu", "--no-first-run", f"--user-data-dir={perfil}",
                   "--window-size=1300,2400", "--virtual-time-budget=10000", "--enable-logging=stderr", "--v=0",
                   "--dump-dom", f"http://127.0.0.1:{porta}/?aba={aba}"]
            if sys.platform.startswith("linux"):
                cmd.insert(1, "--no-sandbox")
            r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=120)
            erros = [l for l in r.stderr.splitlines() if "CONSOLE" in l and ERROS.search(l)]
            trecho = secao(r.stdout, aba)
            faltando = [e for e in esperado if e not in trecho]
            ok = r.stdout and not erros and not faltando and "Sem dados ainda" not in r.stdout
            falhas += not ok
            print(f"{'ok   ' if ok else 'FALHA'} {aba}" + (f": faltou {faltando}" if faltando else ""))
            for e in erros[:3]:
                print("      ", e.split("CONSOLE", 1)[-1][:200])
    servidor.shutdown()
    print("Painel ok." if not falhas else f"{falhas} aba(s) com problema.")
    return 1 if falhas else 0


if __name__ == "__main__":
    sys.exit(main())
